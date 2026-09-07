export type CapturedJob = {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  description: string;
  /** How the data was obtained, shown in the popup so the user knows how much to trust it. */
  source: "json-ld" | "site-selectors" | "page-fallback";
};

/** What a single frame reports back: the parsed job plus whether the frame
 * contains an application form (drives the panel's stage default). */
export type FrameScrape = CapturedJob & { applying: boolean };

export type ScrapeRequest = { type: "jobtrack-scrape" };
export type ScrapeResponse = { ok: true; job: CapturedJob } | { ok: false; error: string };
