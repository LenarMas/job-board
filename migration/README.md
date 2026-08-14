# Importing data from another tracker

`import.ts` brings a CSV "download my data" export from a hosted job tracker
into the JobTrack database.

## Usage

1. Export your data from the old tracker and drop the `USER_*.csv` files into
   `migration/raw/` (gitignored — nothing in there is ever committed).
2. Preview: `npm run import -- --dry-run` prints entity counts and a
   field-mapping report of everything the importer could not place. Nothing is
   silently dropped; source columns with no schema home are kept in a JSON
   `extras` column on the imported rows.
3. Import: `npm run import`. The run ends with a per-stage comparison of
   source vs imported job counts.

The import is idempotent: every row is keyed on the source object id, so
re-running after a fresh export updates rows instead of duplicating them.

Stage history is rebuilt from the export's move events, including applied and
rejected timestamps, so the metrics page stays honest for imported data.
Documents are the one thing the export does not carry — re-upload files by
hand on each job's Documents tab if you need them.
