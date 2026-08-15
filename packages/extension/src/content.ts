import { parseJobPosting } from "./parse";
import type { ScrapeRequest, ScrapeResponse } from "./types";

// Injected on demand by the popup. Guard so re-injection (popup reopened on
// the same tab) doesn't register a second listener.
declare global {
  interface Window {
    __jobtrackContentLoaded?: boolean;
  }
}

if (!window.__jobtrackContentLoaded) {
  window.__jobtrackContentLoaded = true;
  chrome.runtime.onMessage.addListener(
    (message: ScrapeRequest, _sender, sendResponse: (r: ScrapeResponse) => void) => {
      if (message?.type !== "jobtrack-scrape") return;
      try {
        const job = parseJobPosting(document, window.location.href);
        sendResponse({ ok: true, job });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "failed to parse page",
        });
      }
    },
  );
}
