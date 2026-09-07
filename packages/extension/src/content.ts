import {
  attachResume,
  detectApplicationForm,
  fillApplication,
  type AutofillProfile,
} from "./autofill";
import { CapturePanel } from "./panel";
import { parseJobPosting, scoreJob } from "./parse";
import type { FrameScrape } from "./types";

/**
 * Injected into EVERY frame of the tab (Greenhouse and friends often live in
 * an iframe on the company's own careers page). Each frame exposes scrape and
 * autofill hooks that the background worker invokes across all frames; only
 * the top frame owns the capture panel.
 */

declare global {
  interface Window {
    __jobtrackContentLoaded?: boolean;
    __jobtrackPanel?: CapturePanel;
    __jobtrackScrape?: () => FrameScrape;
    __jobtrackAutofill?: (
      profile: AutofillProfile,
      resume: { name: string; mime: string; base64: string } | null,
    ) => { filled: number; resumeAttached: boolean };
    __jobtrackTogglePanel?: () => void;
  }
}

// SPA pages render the job pane well after load; the panel polls all frames
// until the result stops improving or the deadline passes.
const RETRY_INTERVAL_MS = 500;
const RETRY_DEADLINE_MS = 6000;

function bestOf(results: (FrameScrape | null)[]): FrameScrape | null {
  let best: FrameScrape | null = null;
  for (const job of results) {
    if (job && (!best || scoreJob(job) > scoreJob(best))) best = job;
  }
  if (!best) return null;
  // The application form often lives in a different frame than the best
  // parse (ATS iframe vs. company page), so "applying" is any frame's.
  return { ...best, applying: results.some((r) => r?.applying) };
}

async function scrapeAllFrames(): Promise<FrameScrape | null> {
  const res: { ok: boolean; results?: (FrameScrape | null)[] } =
    await chrome.runtime.sendMessage({ type: "jobtrack-scrape-frames" });
  return res.ok ? bestOf(res.results ?? []) : null;
}

async function scrapeIntoPanel(panel: CapturePanel): Promise<void> {
  const startedAt = Date.now();
  let best = await scrapeAllFrames();
  if (best) panel.applyScrape(best);
  while (Date.now() - startedAt < RETRY_DEADLINE_MS) {
    if (best?.title && best.company && best.description) break;
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    const next = await scrapeAllFrames();
    if (next && (!best || scoreJob(next) > scoreJob(best))) {
      best = next;
      panel.applyScrape(best);
    }
  }
}

async function runAutofill(): Promise<{ ok: boolean; error?: string; summary?: string }> {
  // Background fetches the profile and fans the fill out across every frame.
  return chrome.runtime.sendMessage({ type: "jobtrack-autofill" });
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

if (!window.__jobtrackContentLoaded) {
  window.__jobtrackContentLoaded = true;

  // Every frame answers scrape/autofill invocations from the background.
  window.__jobtrackScrape = () => ({
    ...parseJobPosting(document, window.location.href),
    applying: detectApplicationForm(document),
  });
  window.__jobtrackAutofill = (profile, resume) => {
    const { filled } = fillApplication(document, profile);
    let resumeAttached = false;
    if (resume) {
      const bytes = Uint8Array.from(atob(resume.base64), (c) => c.charCodeAt(0));
      const file = new File([bytes], resume.name, { type: resume.mime });
      resumeAttached = attachResume(document, file);
    }
    return { filled, resumeAttached };
  };

  // Only the top frame renders the panel.
  if (window === window.top) {
    window.__jobtrackTogglePanel = () => {
      const panel = getPanel();
      if (panel.visible) {
        panel.hide();
      } else {
        panel.show();
        void scrapeIntoPanel(panel);
      }
    };
  }
}
