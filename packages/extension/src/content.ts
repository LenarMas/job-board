import { attachResume, fillApplication, type AutofillProfile } from "./autofill";
import { CapturePanel } from "./panel";
import { parseJobPosting } from "./parse";
import type { CapturedJob } from "./types";

// Injected on demand. Guard so re-injection doesn't duplicate listeners.
declare global {
  interface Window {
    __jobtrackContentLoaded?: boolean;
    __jobtrackPanel?: CapturePanel;
  }
}

// SPA pages (LinkedIn especially) render the job pane well after document
// load, so a single immediate parse often sees an empty shell. Re-parse on an
// interval, improving the form as content arrives — without ever overwriting
// a field the user already edited.
const RETRY_INTERVAL_MS = 500;
const RETRY_DEADLINE_MS = 6000;

function score(job: CapturedJob): number {
  let s = 0;
  if (job.title) s += 2;
  if (job.company) s += 2;
  if (job.location) s += 1;
  if (job.salary) s += 1;
  if (job.description) s += 3;
  if (job.source !== "page-fallback") s += 2;
  return s;
}

function getPanel(): CapturePanel {
  if (!window.__jobtrackPanel || !window.__jobtrackPanel.connected) {
    window.__jobtrackPanel = new CapturePanel({
      onSave: (payload) =>
        chrome.runtime.sendMessage({ type: "jobtrack-save", payload }),
      onAutofill: runAutofill,
    });
  }
  return window.__jobtrackPanel;
}

async function scrapeIntoPanel(panel: CapturePanel): Promise<void> {
  const startedAt = Date.now();
  let best = parseJobPosting(document, window.location.href);
  panel.applyScrape(best);
  while (Date.now() - startedAt < RETRY_DEADLINE_MS) {
    if (best.title && best.company && best.description) break;
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    const next = parseJobPosting(document, window.location.href);
    if (score(next) > score(best)) {
      best = next;
      panel.applyScrape(best);
    }
  }
}

async function runAutofill(): Promise<{ ok: boolean; error?: string; summary?: string }> {
  const res: {
    ok: boolean;
    error?: string;
    profile?: AutofillProfile & { resumeFilename?: string | null };
    resume?: { name: string; mime: string; base64: string } | null;
    appUrl?: string;
  } = await chrome.runtime.sendMessage({ type: "jobtrack-profile" });
  if (!res.ok) return { ok: false, error: res.error };

  const profile = res.profile ?? {};
  const hasAny = Object.values(profile).some((v) => typeof v === "string" && v.trim());
  if (!hasAny) {
    return {
      ok: false,
      error: `No saved profile yet — fill it in at ${res.appUrl}/profile first.`,
    };
  }

  const { filled } = fillApplication(document, profile);
  let resumeNote = "";
  if (res.resume) {
    const bytes = Uint8Array.from(atob(res.resume.base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], res.resume.name, { type: res.resume.mime });
    resumeNote = attachResume(document, file)
      ? ` · attached ${res.resume.name}`
      : " · no resume field found on this page";
  }
  if (filled === 0 && !resumeNote.startsWith(" · attached")) {
    return { ok: false, error: "No application fields recognized on this page." };
  }
  return {
    ok: true,
    summary: `Filled ${filled} field${filled === 1 ? "" : "s"}${resumeNote}. Review before submitting.`,
  };
}

if (!window.__jobtrackContentLoaded) {
  window.__jobtrackContentLoaded = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "jobtrack-toggle-panel") return;
    const panel = getPanel();
    if (panel.visible) {
      panel.hide();
    } else {
      panel.show();
      void scrapeIntoPanel(panel);
    }
    sendResponse({ ok: true });
  });
}
