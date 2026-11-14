//! Video downloads, with yt-dlp:
//!
//! - `nyx-browser-bridge video-info URL [--cookies PROFILE]` prints what the page's video is:
//!   its title, channel, length, thumbnail, the qualities it comes in with their sizes, and
//!   whether it has subtitles.
//! - `nyx-browser-bridge video-download URL --folder DIR [--quality best|audio|HEIGHT]
//!   [--audio FORMAT] [--names PRESET] [--subtitles] [--embed] [--cookies PROFILE]` downloads it,
//!   printing a JSON line for each step (`{"t":"progress",…}`, `{"t":"stage",…}`) and last
//!   `{"t":"done","file":…}`. Closing its input stops the download.
//! - `nyx-browser-bridge video-version` prints yt-dlp's version and where it is.
//!
//! yt-dlp is found on PATH. Only web addresses, a folder that exists, and fixed choices reach it.

use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, ExitCode, Stdio};

use serde_json::{Value, json};

use crate::protocol::{Refusal, check_web_url};

const YT_DLP: &str = "yt-dlp";
const AUDIO_FORMATS: &[&str] = &["opus", "m4a", "mp3"];

fn report(result: Result<Value, Refusal>) -> ExitCode {
    match result {
        Ok(value) => {
            println!("{value}");
            ExitCode::SUCCESS
        }
        Err(refusal) => {
            println!("{}", json!({"code": refusal.code, "error": refusal.message}));
            ExitCode::FAILURE
        }
    }
}

fn missing() -> Refusal {
    Refusal::unavailable("yt-dlp isn't installed.")
}

/// `--cookies PROFILE`: the Browser profile whose sign-ins yt-dlp may use for this site.
fn cookies(args: &[String]) -> Result<Vec<String>, Refusal> {
    match args.iter().position(|a| a == "--cookies") {
        None => Ok(vec![]),
        Some(at) => {
            let profile = args.get(at + 1).ok_or_else(|| Refusal::invalid("Name the profile."))?;
            if !Path::new(profile).join("cookies.sqlite").is_file() {
                return Err(Refusal::invalid("That isn't a Browser profile."));
            }
            Ok(vec!["--cookies-from-browser".into(), format!("firefox:{profile}")])
        }
    }
}

pub fn run_version() -> ExitCode {
    report(version())
}

fn version() -> Result<Value, Refusal> {
    let output = Command::new(YT_DLP).arg("--version").stdin(Stdio::null()).stderr(Stdio::null()).output().map_err(|_| missing())?;
    let path = std::env::var_os("PATH")
        .and_then(|paths| std::env::split_paths(&paths).map(|d| d.join(YT_DLP)).find(|p| p.is_file()))
        .map(|p| p.display().to_string());
    Ok(json!({"version": String::from_utf8_lossy(&output.stdout).trim(), "path": path}))
}

pub fn run_info(args: &[String]) -> ExitCode {
    report(info(args))
}

fn info(args: &[String]) -> Result<Value, Refusal> {
    let url = args.first().ok_or_else(|| Refusal::invalid("Name a web address."))?;
    check_web_url(url)?;
    let output = Command::new(YT_DLP)
        .args(["-J", "--no-playlist", "--no-warnings", "--no-colors"])
        .args(cookies(args)?)
        .arg("--")
        .arg(url)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| missing())?;
    if !output.status.success() {
        return Err(Refusal::unavailable(error_line(&String::from_utf8_lossy(&output.stderr)).unwrap_or_else(|| "There's no video here yt-dlp can download.".into())));
    }
    let video: Value = serde_json::from_slice(&output.stdout).map_err(|_| Refusal::unavailable("yt-dlp's answer couldn't be read."))?;
    Ok(summarize(&video))
}

/// The last `ERROR:` line yt-dlp wrote, without its prefix.
fn error_line(stderr: &str) -> Option<String> {
    stderr
        .lines()
        .rev()
        .find_map(|l| l.strip_prefix("ERROR: "))
        .map(|l| l.trim().chars().take(300).collect())
}

fn size(format: &Value) -> u64 {
    format.get("filesize").and_then(Value::as_u64).or_else(|| format.get("filesize_approx").and_then(Value::as_u64)).unwrap_or(0)
}

/// What the panel shows: the video, each height it comes in (largest first) with about how big
/// it is with its sound, and the sound alone.
pub fn summarize(video: &Value) -> Value {
    let formats = video.get("formats").and_then(Value::as_array).cloned().unwrap_or_default();
    let has = |f: &Value, key: &str| f.get(key).and_then(Value::as_str).is_some_and(|c| c != "none");
    let audio = formats.iter().filter(|f| has(f, "acodec") && !has(f, "vcodec")).map(size).max().unwrap_or(0);
    let mut heights: Vec<(u64, u64)> = Vec::new();
    for f in formats.iter().filter(|f| has(f, "vcodec")) {
        let Some(height) = f.get("height").and_then(Value::as_u64) else { continue };
        let total = size(f) + if has(f, "acodec") { 0 } else { audio };
        match heights.iter_mut().find(|(h, _)| *h == height) {
            Some((_, best)) => *best = (*best).max(total),
            None => heights.push((height, total)),
        }
    }
    heights.sort_by(|a, b| b.0.cmp(&a.0));
    let subtitles = video.get("subtitles").and_then(Value::as_object).is_some_and(|s| !s.is_empty());
    json!({
        "title": video.get("title").and_then(Value::as_str).unwrap_or_default(),
        "channel": video.get("channel").or_else(|| video.get("uploader")).and_then(Value::as_str).unwrap_or_default(),
        "site": video.get("extractor_key").and_then(Value::as_str).unwrap_or_default(),
        "duration": video.get("duration").and_then(Value::as_f64).unwrap_or(0.0),
        "thumbnail": video.get("thumbnail").and_then(Value::as_str).filter(|t| t.starts_with("https://")),
        "qualities": heights.iter().map(|(h, s)| json!({"height": h, "size": s})).collect::<Vec<_>>(),
        "audio_size": audio,
        "subtitles": subtitles,
    })
}

/// The file names the settings offer, as yt-dlp templates.
pub fn names(preset: &str) -> Option<&'static str> {
    Some(match preset {
        "title" => "%(title)s.%(ext)s",
        "title-channel" => "%(title)s%(channel,uploader& [{}]|)s.%(ext)s",
        "channel-title" => "%(channel,uploader&{} - |)s%(title)s.%(ext)s",
        "date-title" => "%(upload_date>%Y-%m-%d)s %(title)s.%(ext)s",
        _ => return None,
    })
}

/// yt-dlp's arguments for a download, from the panel's choices.
pub fn download_args(args: &[String]) -> Result<Vec<String>, Refusal> {
    let url = args.first().ok_or_else(|| Refusal::invalid("Name a web address."))?;
    check_web_url(url)?;
    let value = |flag: &str| args.iter().position(|a| a == flag).and_then(|at| args.get(at + 1)).map(String::as_str);
    let flag = |flag: &str| args.iter().any(|a| a == flag);
    let folder = value("--folder").ok_or_else(|| Refusal::invalid("Name a folder."))?;
    if !Path::new(folder).is_absolute() || !Path::new(folder).is_dir() {
        return Err(Refusal::invalid("That folder isn't there."));
    }
    let names = names(value("--names").unwrap_or("title-channel")).ok_or_else(|| Refusal::invalid("Those names aren't one of the choices."))?;
    let mut out: Vec<String> = [
        "--no-playlist", "--newline", "--no-colors", "--quiet", "--progress", "--no-simulate",
        "--progress-template", "download:NYX%(progress)j",
        "--progress-template", "postprocess:NYXPP%(progress.postprocessor)s",
        "--print", "after_move:NYXFILE%(filepath)s",
        "-P",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    out.push(folder.into());
    out.extend(["-o".into(), names.into()]);
    match value("--quality").unwrap_or("best") {
        "audio" => {
            let format = value("--audio").unwrap_or("opus");
            if !AUDIO_FORMATS.contains(&format) {
                return Err(Refusal::invalid("That sound format isn't one of the choices."));
            }
            out.extend(["-f", "ba/b", "-x", "--audio-format", format].map(String::from));
        }
        "best" => out.extend(["-f", "bv*+ba/b"].map(String::from)),
        height => {
            let height: u32 = height.parse().map_err(|_| Refusal::invalid("That quality isn't one of the choices."))?;
            out.extend(["-f".into(), format!("bv*[height<={height}]+ba/b[height<={height}]/b")]);
        }
    }
    if flag("--subtitles") {
        out.extend(["--write-subs", "--sub-langs", "en.*,-live_chat", "--embed-subs"].map(String::from));
    }
    if flag("--embed") {
        out.extend(["--embed-chapters", "--embed-metadata", "--embed-thumbnail"].map(String::from));
    }
    out.extend(cookies(args)?);
    out.push("--".into());
    out.push(url.clone());
    Ok(out)
}

pub fn run_download(args: &[String]) -> ExitCode {
    let ytdlp_args = match download_args(args) {
        Ok(a) => a,
        Err(refusal) => return report(Err(refusal)),
    };
    let mut child = match Command::new(YT_DLP).args(&ytdlp_args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn() {
        Ok(c) => c,
        Err(_) => return report(Err(missing())),
    };
    // Browser closes this program's input to stop the download.
    let pid = child.id();
    std::thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = std::io::stdin().read_to_end(&mut sink);
        // SAFETY: kill(2) on the child's own pid, which this process waits for below.
        unsafe { libc_kill(pid as i32, 15) };
    });
    let stderr = child.stderr.take();
    let errors = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut s) = stderr {
            let _ = s.read_to_string(&mut text);
        }
        text
    });
    let mut file = None;
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(event) = progress_line(&line) {
                if let Some(path) = event.get("file").and_then(Value::as_str) {
                    file = Some(path.to_string());
                } else {
                    println!("{event}");
                }
            }
        }
    }
    let status = child.wait();
    let errors = errors.join().unwrap_or_default();
    match (status, file) {
        (Ok(s), Some(file)) if s.success() => report(Ok(json!({"t": "done", "file": file}))),
        (Ok(s), _) if s.code().is_none() => report(Err(Refusal::denied("The download was stopped."))),
        _ => report(Err(Refusal::unavailable(error_line(&errors).unwrap_or_else(|| "yt-dlp couldn't download it.".into())))),
    }
}

unsafe extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, signal: i32) -> i32;
}

/// One of yt-dlp's lines as Browser's event: progress, a stage (merging, converting), the file.
pub fn progress_line(line: &str) -> Option<Value> {
    if let Some(file) = line.strip_prefix("NYXFILE") {
        return Some(json!({"file": file}));
    }
    if let Some(stage) = line.strip_prefix("NYXPP") {
        let stage = match stage.trim() {
            "Merger" => "merging",
            "FFmpegExtractAudio" => "converting",
            "FFmpegEmbedSubtitle" | "EmbedThumbnail" | "FFmpegMetadata" => "finishing",
            _ => return None,
        };
        return Some(json!({"t": "stage", "stage": stage}));
    }
    let progress: Value = serde_json::from_str(line.strip_prefix("NYX")?).ok()?;
    let done = progress.get("downloaded_bytes").and_then(Value::as_u64).unwrap_or(0);
    let total = progress.get("total_bytes").and_then(Value::as_u64).or_else(|| progress.get("total_bytes_estimate").and_then(Value::as_f64).map(|t| t as u64)).unwrap_or(0);
    Some(json!({
        "t": "progress",
        "downloaded": done,
        "total": total,
        "speed": progress.get("speed").and_then(Value::as_f64).unwrap_or(0.0),
        "eta": progress.get("eta").and_then(Value::as_f64).unwrap_or(-1.0),
        "status": progress.get("status").and_then(Value::as_str).unwrap_or("downloading"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sums_up_a_video() {
        let video = json!({
            "title": "Ridge loop", "channel": "Trail Days", "extractor_key": "Youtube", "duration": 1122.0,
            "thumbnail": "https://i.example/t.jpg", "subtitles": {"en": []},
            "formats": [
                {"format_id": "a", "vcodec": "none", "acodec": "opus", "filesize": 10},
                {"format_id": "v1", "vcodec": "vp9", "acodec": "none", "height": 1080, "filesize": 600},
                {"format_id": "v2", "vcodec": "avc1", "acodec": "none", "height": 1080, "filesize_approx": 500},
                {"format_id": "v3", "vcodec": "avc1", "acodec": "none", "height": 720, "filesize": 300},
                {"format_id": "both", "vcodec": "avc1", "acodec": "mp4a", "height": 360, "filesize": 50},
            ],
        });
        let s = summarize(&video);
        assert_eq!(s["title"], "Ridge loop");
        assert_eq!(s["qualities"], json!([{"height": 1080, "size": 610}, {"height": 720, "size": 310}, {"height": 360, "size": 50}]));
        assert_eq!(s["audio_size"], 10);
        assert_eq!(s["subtitles"], true);
    }

    #[test]
    fn downloads_only_what_the_choices_allow() {
        let dir = std::env::temp_dir();
        let folder = dir.to_str().unwrap().to_string();
        let args = |extra: &[&str]| {
            let mut a = vec!["https://video.example/v".to_string(), "--folder".into(), folder.clone()];
            a.extend(extra.iter().map(|s| s.to_string()));
            a
        };
        let a = download_args(&args(&["--quality", "720", "--subtitles"])).unwrap();
        assert!(a.contains(&"bv*[height<=720]+ba/b[height<=720]/b".to_string()));
        assert!(a.contains(&"--embed-subs".to_string()));
        assert_eq!(a.last().unwrap(), "https://video.example/v");
        assert_eq!(a[a.len() - 2], "--");
        let audio = download_args(&args(&["--quality", "audio", "--audio", "mp3"])).unwrap();
        assert!(audio.windows(2).any(|w| w == ["--audio-format", "mp3"]));
        assert!(download_args(&args(&["--quality", "audio", "--audio", "wav; rm"])).is_err());
        assert!(download_args(&args(&["--quality", "-1080"])).is_err());
        assert!(download_args(&args(&["--names", "%(id)s/../../x"])).is_err());
        let mut relative = args(&[]);
        relative[2] = "videos".into();
        assert!(download_args(&relative).is_err());
        assert!(download_args(&["file:///etc/passwd".into(), "--folder".into(), folder.clone()]).is_err());
        assert!(download_args(&["https://v.example".into(), "--folder".into(), folder, "--cookies".into(), "/nonexistent".into()]).is_err());
    }

    #[test]
    fn reads_yt_dlp_lines() {
        let p = progress_line(r#"NYX{"status":"downloading","downloaded_bytes":50,"total_bytes":200,"speed":10.5,"eta":15}"#).unwrap();
        assert_eq!(p["downloaded"], 50);
        assert_eq!(p["total"], 200);
        assert_eq!(progress_line("NYXPPMerger").unwrap()["stage"], "merging");
        assert_eq!(progress_line("NYXFILE/home/k/Videos/a.webm").unwrap()["file"], "/home/k/Videos/a.webm");
        assert!(progress_line("[youtube] something").is_none());
        assert!(progress_line("NYXPPSomethingElse").is_none());
    }
}
