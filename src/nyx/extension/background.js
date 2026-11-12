/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Connects menus and commands to the native host. Web pages have no route to this script: there
 * are no content scripts, no web-accessible resources and no external messaging, and messages
 * from anywhere but this extension's own pages are ignored. Page text is read only for a user's
 * gesture, through activeTab, and goes nowhere but the local Assistant. */
"use strict";

const HOST = "io.github.design_nexus.nyx.browser";
const PAGE_TEXT_LIMIT = 200000;

let port = null;
let nextId = 1;
const waiting = new Map();

function connect() {
  if (port) {
    return port;
  }
  port = browser.runtime.connectNative(HOST);
  port.onMessage.addListener(reply => {
    const pending = waiting.get(reply.id);
    if (pending) {
      waiting.delete(reply.id);
      reply.ok ? pending.resolve(reply.data) : pending.reject(new Error(reply.error || "That didn't work."));
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    for (const pending of waiting.values()) {
      pending.reject(new Error("The Nyx apps aren't connected. Reinstalling Browser may fix this."));
    }
    waiting.clear();
  });
  return port;
}

function call(op, fields = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    try {
      connect().postMessage({ id, op, ...fields });
    } catch (error) {
      waiting.delete(id);
      reject(error);
    }
  });
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const isWebPage = tab => /^https?:/i.test(tab?.url || "");

/** Visible text only. Runs once, returns plain strings, and leaves nothing in the page. */
function readPageScript(limit) {
  return { url: location.href, title: document.title, text: (document.body?.innerText || "").slice(0, limit) };
}

async function readPage(tabId) {
  const [frame] = await browser.scripting.executeScript({ target: { tabId }, func: readPageScript, args: [PAGE_TEXT_LIMIT] });
  return frame.result;
}

function pngBase64(dataUrl) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

async function captureVisible() {
  return pngBase64(await browser.tabs.captureVisibleTab(undefined, { format: "png" }));
}

async function captureFullPage(tabId) {
  const [frame] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }),
  });
  const rect = { x: 0, y: 0, width: frame.result.width, height: frame.result.height };
  return pngBase64(await browser.tabs.captureVisibleTab(undefined, { format: "png", rect }));
}

/* Remembered for the panel, which opens after the gesture that chose it. */
let panelRequest = null;

function openPanel(request) {
  panelRequest = request;
  // Must be the first call in a gesture's handler, or the browser refuses it.
  const opened = browser.sidebarAction.open();
  browser.runtime.sendMessage({ to: "panel", request }).catch(() => {});
  return opened;
}

const MENUS = [
  { id: "assistant-explain", title: "Explain with Assistant", contexts: ["selection"] },
  { id: "assistant-ask", title: "Ask Assistant about this page", contexts: ["page", "selection"] },
  { id: "share-selection", title: "Share selection", contexts: ["selection"] },
  { id: "share-link", title: "Share link", contexts: ["link"] },
  { id: "share-page", title: "Share this page", contexts: ["page"] },
  { id: "capture", title: "Capture", contexts: ["page", "selection"] },
  { id: "capture-visible", parentId: "capture", title: "Visible page", contexts: ["page", "selection"] },
  { id: "capture-full", parentId: "capture", title: "Full page", contexts: ["page", "selection"] },
  { id: "capture-region", parentId: "capture", title: "Region", contexts: ["page", "selection"] },
  { id: "capture-text", parentId: "capture", title: "Text from region", contexts: ["page", "selection"] },
];

browser.runtime.onInstalled.addListener(() => {
  for (const item of MENUS) {
    browser.contextMenus.create(item);
  }
});

function report(error) {
  browser.notifications.create({ type: "basic", title: "Browser", message: error.message });
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "assistant-explain":
      openPanel({ kind: "explain", selection: info.selectionText, tabId: tab.id });
      return;
    case "assistant-ask":
      openPanel({ kind: "ask", selection: info.selectionText || "", tabId: tab.id });
      return;
    case "share-selection":
      call("share_text", { text: info.selectionText }).catch(report);
      return;
    case "share-link":
      call("share_page", { url: info.linkUrl, title: "" }).catch(report);
      return;
    case "share-page":
      call("share_page", { url: tab.url, title: tab.title || "" }).catch(report);
      return;
    case "capture-visible":
      captureVisible().then(data => call("capture_open", { data })).catch(report);
      return;
    case "capture-full":
      captureFullPage(tab.id).then(data => call("capture_open", { data })).catch(report);
      return;
    case "capture-region":
      call("capture_region").catch(report);
      return;
    case "capture-text":
      call("capture_text").catch(report);
      return;
  }
});

browser.commands.onCommand.addListener(async command => {
  if (command === "open-assistant") {
    // Before any await: opening the panel needs the gesture still in hand.
    const opened = browser.sidebarAction.open();
    const tab = await activeTab();
    panelRequest = { kind: "ask", selection: "", tabId: tab?.id };
    browser.runtime.sendMessage({ to: "panel", request: panelRequest }).catch(() => {});
    return opened;
  }
  const tab = await activeTab();
  if (command === "share-page") {
    if (isWebPage(tab)) {
      call("share_page", { url: tab.url, title: tab.title || "" }).catch(report);
    }
  } else if (command === "capture-page") {
    captureVisible().then(data => call("capture_open", { data })).catch(report);
  }
});

/* Downloads can be shared once finished, from the downloads list. */
async function shareDownload(id) {
  const [item] = await browser.downloads.search({ id });
  if (item?.state !== "complete") {
    throw new Error("That download hasn't finished.");
  }
  return call("share_download", { path: item.filename });
}

browser.runtime.onMessage.addListener((message, sender) => {
  // Only this extension's own pages, and never a tab's content.
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL("")) || message?.to !== "background") {
    return undefined;
  }
  switch (message.action) {
    case "theme":
      return call("theme");
    case "weather":
      return call("weather_cached");
    case "panel-request": {
      const request = panelRequest;
      panelRequest = null;
      return Promise.resolve(request);
    }
    case "ask":
      return (async () => {
        const tabId = message.tabId ?? (await activeTab())?.id;
        const page = await readPage(tabId);
        const question = message.selection ? `${message.question}\n\nThe selected text: ${message.selection}` : message.question;
        return call("assistant_ask", { question: question.slice(0, 4000), page_url: page.url, page_title: page.title.slice(0, 1000), page_text: page.text });
      })();
    case "active-page":
      return activeTab().then(tab => ({ title: tab?.title || "", host: isWebPage(tab) ? new URL(tab.url).host : "", web: isWebPage(tab), tabId: tab?.id }));
    case "share-download":
      return shareDownload(message.id);
    default:
      return undefined;
  }
});
