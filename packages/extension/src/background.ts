// Service worker. The capture UI is an in-page panel (content script), so the
// toolbar button and the context menu both just toggle it. Saves are routed
// through here because content scripts fetch with the page's origin, which
// the JobTrack API (correctly) refuses.

const APP_URL = "http://localhost:3000";

async function togglePanel(tab: chrome.tabs.Tab | undefined) {
  if (!tab?.id) return;
  if (tab.url && !/^https?:/.test(tab.url)) {
    // Can't inject into chrome:// pages and the like.
    chrome.action.setBadgeText({ tabId: tab.id, text: "✕" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: "" }), 2000);
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "jobtrack-toggle-panel" });
  } catch {
    chrome.action.setBadgeText({ tabId: tab.id, text: "✕" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: "" }), 2000);
  }
}

chrome.action.onClicked.addListener((tab) => void togglePanel(tab));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "jobtrack-capture",
    title: "Capture job posting",
    contexts: ["page", "selection", "link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "jobtrack-capture") void togglePanel(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "jobtrack-save") {
    fetch(`${APP_URL}/api/jobs/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          sendResponse({ ok: false, error: body?.error ?? `JobTrack responded with ${res.status}` });
        } else {
          sendResponse({ ok: true, job: body.job, duplicate: body.duplicate, appUrl: APP_URL });
        }
      })
      .catch((err) =>
        sendResponse({
          ok: false,
          error:
            `Could not reach JobTrack at ${APP_URL}. Is the app running? (npm run dev)\n` +
            (err instanceof Error ? err.message : String(err)),
        }),
      );
    return true;
  }
  if (message?.type === "jobtrack-profile") {
    (async () => {
      try {
        const res = await fetch(`${APP_URL}/api/profile`);
        if (!res.ok) throw new Error(`profile request failed (${res.status})`);
        const profile = await res.json();
        let resume: { name: string; mime: string; base64: string } | null = null;
        if (profile?.resumeFilename) {
          const fileRes = await fetch(`${APP_URL}/api/profile/resume`);
          if (fileRes.ok) {
            const buf = await fileRes.arrayBuffer();
            let binary = "";
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < bytes.length; i += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            resume = {
              name: profile.resumeFilename,
              mime: fileRes.headers.get("content-type") ?? "application/octet-stream",
              base64: btoa(binary),
            };
          }
        }
        sendResponse({ ok: true, profile, resume, appUrl: APP_URL });
      } catch (err) {
        sendResponse({
          ok: false,
          error:
            `Could not reach JobTrack at ${APP_URL}. Is the app running? (npm run dev)\n` +
            (err instanceof Error ? err.message : String(err)),
        });
      }
    })();
    return true;
  }
});
