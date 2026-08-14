# Decisions

Small product/engineering decisions made while building, so they are not
re-litigated later.

- **2026-08-14** Local planning docs (CLAUDE.md, PLAN.md, MIGRATION.md) are
  gitignored: they reference the source tracker by name, which the repo rules
  keep out of the public repo. The public-facing equivalents live in README.md
  and migration/README.md.
- **2026-08-14** LICENSE uses the owner's full legal name; commits use the
  owner's GitHub handle.
- **2026-08-14** Source data arrived as the tracker's built-in full CSV export
  (migration option A) and is complete (per-stage job counts match the UI), so
  the importer reads CSVs from `migration/raw/` and no network capture is
  needed.
