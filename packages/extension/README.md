# JobTrack Capture — Chrome extension

One-click capture of job postings into your JobTrack board. Click the toolbar
button (or right-click → "Capture job posting") on any job page, review what
was parsed, edit anything that's off, pick a stage, and save.

Nothing is saved without your review: the popup always shows exactly what was
parsed and how (JobPosting metadata, site-specific selectors, or a bare
page-title fallback) before you hit Save.

## How parsing works

1. **JSON-LD `JobPosting`** — LinkedIn, Greenhouse, Lever, and Ashby all embed
   schema.org metadata; this is the most reliable source.
2. **Per-site selectors** — Workday and Indeed (plus fallbacks for the four
   above) are scraped with DOM selectors kept in one place,
   [`src/sites.ts`](src/sites.ts), so a site redesign is a one-line fix.
3. **Page fallback** — anywhere else you get the page title and site name
   pre-filled and type the rest.

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
