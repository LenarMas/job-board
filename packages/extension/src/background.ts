// Service worker. Injects the content script into EVERY frame (job boards are
// often embedded in an iframe on the company's own careers page), toggles the
// top-frame panel by direct function invocation (no messaging race on the
// first click), fans scrape/autofill out across frames, and performs all
// JobTrack API calls (content scripts fetch with the page's origin, which the
// API correctly refuses).

export {}; // imported by tests; the extension build wraps this file in an IIFE

const APP_URL = "http://localhost:3000";

function flashBadge(tabId: number) {
  chrome.action.setBadgeText({ tabId, text: "✕" });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }), 2000);
}

// Chrome rejects a batched allFrames injection outright when the page holds
// even one frame it refuses to script (sandboxed without allow-scripts,
// cross-origin frames beyond the activeTab grant, other extensions' frames).
// The panel lives in the top frame, so inject that first — it must never be
// hostage to frames we were never going to reach — then try the rest
// best-effort.
async function injectContent(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content.js"],
    });
  } catch (err) {
    console.warn("JobTrack: some frames rejected injection, top frame only", err);
  }
}

async function togglePanel(tab: chrome.tabs.Tab | undefined) {
  if (!tab?.id) return;
  const tabId = tab.id;
  if (tab.url && !/^https?:/.test(tab.url)) {
    flashBadge(tabId); // chrome:// pages and the like can't be captured
    return;
  }
  try {
    await injectContent(tabId);
    // Direct invocation instead of tabs.sendMessage: the function is defined
    // synchronously by content.js, so there is no listener-registration race.
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const w = window as { __jobtrackTogglePanel?: () => void };
        if (!w.__jobtrackTogglePanel) return false;
        w.__jobtrackTogglePanel();
        return true;
      },
    });
    if (!injection?.result) throw new Error("content script did not initialize");
  } catch (err) {
    console.error("JobTrack: could not open the capture panel", err);
    flashBadge(tabId);
  }
}

// Fan a function out across every reachable frame; when the batch is rejected
// wholesale, fall back to the top frame alone rather than failing the action.
async function execFrames<A extends unknown[], R>(
  tabId: number,
  func: (...args: A) => R,
  args?: A,
) {
  try {
    return await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func,
      args,
    });
  } catch (err) {
    console.warn("JobTrack: frame fan-out rejected, retrying top frame only", err);
    return chrome.scripting.executeScript({ target: { tabId }, func, args });
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

async function scrapeFrames(tabId: number) {
  const injections = await execFrames(
    tabId,
    () => (window as { __jobtrackScrape?: () => unknown }).__jobtrackScrape?.() ?? null,
  );
  return injections.map((i) => i.result ?? null);
}

async function fetchProfile() {
  const res = await fetch(`${APP_URL}/api/profile`);
  if (!res.ok) throw new Error(`profile request failed (${res.status})`);
  const profile = await res.json();
  let resume: { name: string; mime: string; base64: string } | null = null;
  if (profile?.resumeFilename) {
    const fileRes = await fetch(`${APP_URL}/api/profile/resume`);
    if (fileRes.ok) {
      const bytes = new Uint8Array(await fileRes.arrayBuffer());
      let binary = "";
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
  return { profile, resume };
}

async function autofillFrames(tabId: number) {
  const { profile, resume } = await fetchProfile();
  const FILL_FIELDS = [
    "firstName", "lastName", "email", "phone",
    "location", "linkedin", "github", "website",
  ];
  const hasAny = FILL_FIELDS.some(
    (k) => typeof profile?.[k] === "string" && profile[k].trim(),
  );
  if (!hasAny && !resume) {
    return {
      ok: false,
      error: `No saved profile yet — fill it in at ${APP_URL}/profile first.`,
    };
  }
  const injections = await execFrames(
    tabId,
    (p: unknown, r: unknown) =>
      (
        window as {
          __jobtrackAutofill?: (p: unknown, r: unknown) => { filled: number; resumeAttached: boolean };
        }
      ).__jobtrackAutofill?.(p, r) ?? null,
    [profile, resume],
  );
  let filled = 0;
  let resumeAttached = false;
  for (const i of injections) {
    const r = i.result as { filled: number; resumeAttached: boolean } | null;
    if (r) {
      filled += r.filled;
      resumeAttached ||= r.resumeAttached;
    }
  }
  let resumeNote = "";
  if (resume) {
    resumeNote = resumeAttached
      ? ` · attached ${resume.name}`
      : " · no resume field found on this page";
  }
  if (filled === 0 && !resumeAttached) {
    return { ok: false, error: "No application fields recognized on this page." };
  }
  return {
    ok: true,
    summary: `Filled ${filled} field${filled === 1 ? "" : "s"}${resumeNote}. Review before submitting.`,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message?.type === "jobtrack-scrape-frames" && tabId) {
    scrapeFrames(tabId)
      .then((results) => sendResponse({ ok: true, results }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "jobtrack-autofill" && tabId) {
    autofillFrames(tabId)
      .then(sendResponse)
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
});
