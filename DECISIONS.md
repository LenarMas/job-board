# Decisions

Small product/engineering decisions made while building, so they are not
re-litigated later.

- **2026-08-14** Local planning docs (CLAUDE.md, PLAN.md, MIGRATION.md) are
  gitignored: they reference the source tracker by name, which the repo rules
  keep out of the public repo. The public-facing equivalents live in README.md
  and migration/README.md.
- **2026-08-14** LICENSE uses the owner's full legal name; commits use the
  owner's GitHub handle.
- **2026-08-14** Added a `stage_events` table (job, from stage, to stage,
  moved-at) beyond the base data model: time-in-stage and conversion metrics
  need full stage history, not just applied/rejected timestamps, and the source
  export ships the move events to fill it. `source_id` and JSON `extras`
  columns on importable tables support idempotent imports and unmapped fields.
- **2026-08-14** Job `position` is a REAL with gap-based ordering (insert
  bisects neighbours, renumbers the column when the gap is exhausted) so drag
  and drop is one row update instead of renumbering 400 cards per move.
- **2026-08-15** Added `jobs.source` (applied / reachout / referral / other,
  nullable) and granular interview activity categories (screen, hm, technical,
  final) to power source and interview-round metrics. Imported data can't be
  classified retroactively beyond title keywords, so untagged jobs with an
  applied date count as applications and generic interviews are reported as
  unclassified rather than guessed.
- **2026-08-14** Source data arrived as the tracker's built-in full CSV export
  (migration option A) and is complete (per-stage job counts match the UI), so
  the importer reads CSVs from `migration/raw/` and no network capture is
  needed.
