/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Runs one of the native host's commands (`nyx-browser-bridge <command> …`) and reads its JSON
// answer. A command that fails prints `{"error": "..."}`, which becomes the thrown Error.

import { findBridge } from "chrome://browser/content/nyx/NyxTheme.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

export const NyxBridge = {
  /**
   * @param {string[]} args The command and its arguments.
   * @param {string} unavailable What to say when the host can't be run or answers nonsense.
   * @param {(line: object) => void} [onLine] Called with each JSON line as it comes, for commands
   *   that report progress; the last line is the answer.
   * @param {{signal?: AbortSignal}} [options] Aborting closes the command's input, which tells
   *   the commands that run long (a download) to stop.
   */
  async run(args, unavailable, onLine, { signal } = {}) {
    const command = await findBridge();
    if (!command) {
      throw new Error(unavailable);
    }
    const proc = await lazy.Subprocess.call({ command, arguments: args, stderr: "ignore" });
    signal?.addEventListener("abort", () => proc.stdin.close().catch(() => {}), { once: true });
    let output = "";
    let last = "";
    for (;;) {
      const chunk = await proc.stdout.readString();
      if (!chunk) {
        break;
      }
      output += chunk;
      if (onLine) {
        const lines = output.split("\n");
        output = lines.pop();
        for (const line of lines.filter(Boolean)) {
          last = line;
          try {
            onLine(JSON.parse(line));
          } catch {}
        }
      }
    }
    const { exitCode } = await proc.wait();
    let reply;
    try {
      reply = JSON.parse(output.trim() || last);
    } catch {
      throw new Error(unavailable);
    }
    if (exitCode !== 0) {
      throw new Error(reply?.error || unavailable);
    }
    return reply;
  },
};
