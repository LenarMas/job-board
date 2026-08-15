import { parseJobPosting } from "./parse";
import type { CapturedJob, ScrapeRequest, ScrapeResponse } from "./types";

// Injected on demand by the popup. Guard so re-injection (popup reopened on
// the same tab) doesn't register a second listener.
declare global {
  interface Window {
    __jobtrackContentLoaded?: boolean;
  }
}

// SPA pages (LinkedIn especially) render the job pane well after document
// load, so a single immediate parse often sees an empty shell. Re-parse on an
// interval until the result stops improving or the deadline passes, and
// return the best attempt.
const RETRY_INTERVAL_MS = 400;
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

function isComplete(job: CapturedJob): boolean {
  return Boolean(job.title && job.company && job.description);
}

async function scrapeWithRetries(): Promise<CapturedJob> {
  const startedAt = Date.now();
  let best = parseJobPosting(document, window.location.href);
  while (!isComplete(best) && Date.now() - startedAt < RETRY_DEADLINE_MS) {
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
    const next = parseJobPosting(document, window.location.href);
    if (score(next) > score(best)) best = next;
    if (isComplete(best)) break;
  }
  return best;
}

if (!window.__jobtrackContentLoaded) {
  window.__jobtrackContentLoaded = true;
  chrome.runtime.onMessage.addListener(
    (message: ScrapeRequest, _sender, sendResponse: (r: ScrapeResponse) => void) => {
      if (message?.type !== "jobtrack-scrape") return;
      scrapeWithRetries()
        .then((job) => sendResponse({ ok: true, job }))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : "failed to parse page",
          }),
        );
      return true; // keep the message channel open for the async response
    },
  );
}
