# JobTrack Capture — Chrome extension

One-click capture of job postings into your JobTrack board. Click the toolbar
button (or right-click → "Capture job posting") on any job page and a capture
panel opens **in the page itself** — unlike a browser popup it stays open
while you click around, scroll, or copy text from the posting, and your edits
survive until you save or close it. Review what was parsed, edit anything
that's off, pick a stage, and save; the confirmation links straight to the
job in JobTrack.

The panel also has an **Autofill application** button: save your details and
resume once on JobTrack's Profile page (`http://localhost:3000/profile`) and
it fills the application form on the page — name, email, phone, location,
LinkedIn/GitHub/website — and attaches your resume to the upload field.
Field recognition lives in one rules table (`src/autofill.ts`); it never
overwrites anything already typed, and you review the form before submitting.

Nothing is saved without your review: the panel always shows exactly what was
parsed and how (JobPosting metadata, site-specific selectors, or a bare
page-title fallback) before you hit Save.

## How parsing works

1. **JSON-LD `JobPosting`** — public/guest views of Greenhouse, Lever, Ashby,
   and LinkedIn embed schema.org metadata; this is the most reliable source.
2. **Logged-in LinkedIn** — the authenticated app strips all metadata and
   hashes its class names, so it gets a dedicated structural parser
   (`parseLinkedInApp` in [`src/parse.ts`](src/parse.ts)) anchored on the page
   title, company links, and the "About the job" section. Captured URLs are
   normalized to `linkedin.com/jobs/view/<id>/` with tracking params removed,
   so recapturing the same posting dedupes correctly. The content script
   retries for a few seconds while LinkedIn's SPA finishes rendering.
3. **Per-site selectors** — Workday and Indeed (plus guest-page fallbacks for
   the boards above) are scraped with DOM selectors kept in one place,
   [`src/sites.ts`](src/sites.ts), so a site redesign is a one-line fix.
4. **Page fallback** — anywhere else you get the page title and the page's
   best company hint pre-filled and type the rest.

Saving posts to `POST /api/jobs/capture` on your local JobTrack
(`http://localhost:3000`). The endpoint dedupes on the post URL — capturing
the same posting twice tells you it's already on the board instead of creating
a duplicate — and creates the company if it doesn't exist yet. If the app
isn't running, the popup shows an error and keeps everything you captured.

## Install (load unpacked)

```sh
# from the repo root
npm install
npm run build -w @jobtrack/extension
```

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select `packages/extension/dist`.
4. Pin "JobTrack Capture" from the puzzle-piece menu.

Re-run the build and click the reload icon on `chrome://extensions` after
pulling changes. The JobTrack app must be running (`npm run dev`) for saves to
work; captures are review-first, so nothing is lost if it isn't.

## Tests

```sh
npm run test -w @jobtrack/extension
```

Parser unit tests run against fictional fixture HTML for each supported site
in [`test/fixtures/`](test/fixtures/).
