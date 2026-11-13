//! The Share button's dropdown, which Browser's window runs itself:
//!
//! - `nyx-browser-bridge share-destinations` prints, as JSON, where Share can send a link in one
//!   click: the destinations that take a link and need nothing more (no folder, no phone number).
//! - `nyx-browser-bridge share-to DESTINATION URL` sends a web page's address to one of them.
//!
//! Either prints `{"error": "..."}` and fails when Share can't, or is turned off in Settings.

use std::process::ExitCode;

use nyx_share_client::{Client, Content, ContentKind, Destination, ShareOptions};
use serde_json::{Value, json};

use crate::protocol::{Group, Op, Refusal};
use crate::{APP_NAME, group_allowed, integrations_file, share_failed};

pub fn run_destinations() -> ExitCode {
    report(destinations().map(|list| json!(list)))
}

pub fn run_share_to(args: &[String]) -> ExitCode {
    let [destination, url] = args else {
        return report(Err(Refusal::invalid("Name a destination and a web address.")));
    };
    report(share_to(destination, url).map(|()| json!({})))
}

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

fn destinations() -> Result<Vec<Value>, Refusal> {
    group_allowed(Group::Share, &integrations_file())?;
    let client = Client::connect().map_err(|_| share_failed())?;
    let all = client.destinations(&[ContentKind::Url], 1).map_err(|_| share_failed())?;
    Ok(one_click(&all).map(describe).collect())
}

fn share_to(destination: &str, url: &str) -> Result<(), Refusal> {
    let op = Op::SharePage { url: url.into(), title: String::new() };
    op.validate()?;
    group_allowed(Group::Share, &integrations_file())?;
    let client = Client::connect().map_err(|_| share_failed())?;
    let all = client.destinations(&[ContentKind::Url], 1).map_err(|_| share_failed())?;
    let chosen = one_click(&all)
        .find(|d| d.id == destination)
        .ok_or_else(|| Refusal::invalid("Share can't send there."))?;
    if !chosen.available {
        return Err(Refusal::unavailable(chosen.status.clone().unwrap_or_else(|| format!("{} isn't available.", chosen.name))));
    }
    let mut content = Content::new();
    content.url(url);
    let options = ShareOptions { app_name: Some(APP_NAME.into()), ..Default::default() };
    client.share_to(&chosen.id, &content, &options).map_err(|_| share_failed())?;
    Ok(())
}

/// The destinations a link goes to in one click: shown, taking a link, asking for nothing more.
fn one_click(all: &[Destination]) -> impl Iterator<Item = &Destination> {
    all.iter().filter(|d| !d.hidden && !d.needs_folder && !d.needs_recipient && d.kinds.contains(&ContentKind::Url))
}

/// What the dropdown shows of a destination. The icon is Share's symbolic name; Browser draws its
/// own icon for it.
fn describe(d: &Destination) -> Value {
    json!({
        "id": d.id,
        "name": d.name,
        "icon": d.icon,
        "tint": d.tint,
        "section": d.section,
        "available": d.available,
        "status": d.status,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn destination(id: &str, extra: Value) -> Destination {
        let mut base = json!({
            "id": id, "provider": "test", "name": id, "icon": "edit-copy-symbolic", "tint": "graphite",
            "section": "apps", "kinds": ["url", "text"], "available": true,
        });
        base.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        serde_json::from_value(base).unwrap()
    }

    #[test]
    fn one_click_leaves_out_what_needs_more() {
        let all = vec![
            destination("clipboard", json!({})),
            destination("save", json!({"needs_folder": true})),
            destination("sms", json!({"needs_recipient": true})),
            destination("hidden", json!({"hidden": true})),
            destination("files-only", json!({"kinds": ["file"]})),
            destination("phone", json!({"available": false, "status": "Not connected", "section": "devices"})),
        ];
        let ids: Vec<&str> = one_click(&all).map(|d| d.id.as_str()).collect();
        assert_eq!(ids, ["clipboard", "phone"]);
        let phone = describe(one_click(&all).nth(1).unwrap());
        assert_eq!(phone["available"], false);
        assert_eq!(phone["status"], "Not connected");
        assert_eq!(phone["section"], "devices");
    }

    #[test]
    fn share_to_takes_web_pages_only() {
        for url in ["file:///etc/passwd", "javascript:alert(1)", "about:blank", "https://"] {
            assert_eq!(share_to("clipboard", url).unwrap_err().code, "invalid", "{url}");
        }
        assert_eq!(run_share_to(&["clipboard".into()]), ExitCode::FAILURE);
    }
}
