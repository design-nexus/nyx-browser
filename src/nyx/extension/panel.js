/* Assistant's side panel. It asks before each read, and answers are shown as plain text: a model
 * that read a hostile page can still write anything, so nothing it says becomes markup or a link. */
"use strict";

const conversation = document.getElementById("conversation");
const permission = document.getElementById("permission");
const questionBox = document.getElementById("question");
let pending = null;

function say(className, text) {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  conversation.append(line);
  conversation.scrollTop = conversation.scrollHeight;
  return line;
}

const background = message => browser.runtime.sendMessage({ to: "background", ...message });

async function requestPermission(question, selection, tabId) {
  const page = await background({ action: "active-page" });
  if (!page.web) {
    say("answer failed", "Assistant can only read web pages.");
    return;
  }
  pending = { question, selection, tabId: tabId ?? page.tabId };
  document.getElementById("permission-page").textContent = `${page.title || "this page"}${page.host ? ` on ${page.host}` : ""}`;
  permission.hidden = false;
  document.getElementById("allow").focus();
}

async function run({ question, selection, tabId }) {
  say("question", question);
  const answer = say("answer waiting", "Reading the page");
  try {
    const { text } = await background({ action: "ask", question, selection, tabId });
    answer.className = "answer";
    answer.textContent = text;
    say("source", "From this page only");
  } catch (error) {
    answer.className = "answer failed";
    answer.textContent = /permission|Missing host/i.test(error.message)
      ? "This page needs a fresh go-ahead. Use the Assistant button or the page's menu, then ask again."
      : error.message;
  }
  conversation.scrollTop = conversation.scrollHeight;
}

function handle(request) {
  if (!request) {
    return;
  }
  if (request.kind === "explain") {
    requestPermission("Explain the selected text.", request.selection, request.tabId);
  } else {
    if (request.selection) {
      questionBox.placeholder = "Ask about the selected text";
    }
    pending = { selection: request.selection, tabId: request.tabId };
    questionBox.focus();
  }
}

document.getElementById("allow").addEventListener("click", () => {
  permission.hidden = true;
  const request = pending;
  pending = null;
  if (request?.question) {
    run(request);
  }
});

document.getElementById("deny").addEventListener("click", () => {
  permission.hidden = true;
  pending = null;
  questionBox.focus();
});

document.getElementById("ask").addEventListener("submit", event => {
  event.preventDefault();
  const question = questionBox.value.trim();
  if (!question) {
    return;
  }
  questionBox.value = "";
  requestPermission(question, pending?.selection, pending?.tabId);
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === browser.runtime.id && message?.to === "panel") {
    handle(message.request);
  }
});

background({ action: "panel-request" }).then(handle).catch(() => {});
questionBox.focus();
