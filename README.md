# JobTrack

Self-hosted job search tracker. A kanban pipeline for your applications
(Wishlist, Applied, Interview, Offer, Rejected) with per-job activities, notes,
contacts and documents, a metrics page, and an MCP server so you can read and
update your board straight from an AI chat.

![Board screenshot placeholder](docs/screenshot-board.png)

## Features

- **Board** — five-stage kanban with drag and drop, per-column quick add, and
  a text filter. Handles hundreds of cards per column.
- **Job detail** — tabs for editable info, activities (with due dates and
  overdue highlighting), markdown notes, linked contacts, document uploads,
  and a company profile shared across that company's jobs.
- **Metrics** — applications per week, stage conversion rates, response rate,
  and average days in stage, all computed from real timestamps.
- **Importer** — bring your history over from a hosted tracker's CSV export,
  idempotently, with stage history preserved so metrics stay honest. See
  [migration/README.md](migration/README.md).
- **MCP server** — add jobs, move cards, log interviews, and pull metrics from
  an AI chat. See [packages/mcp/README.md](packages/mcp/README.md).

## Quick start

Requires Node 20+.

```sh
git clone <this repo>
cd jobtrack
npm install
npm run seed   # fictional demo data
npm run dev
```

Open http://localhost:3000.

Or with Docker:

```sh
docker compose up --build
```

The SQLite database lives in `data/` and uploaded files in `uploads/`; both are
mounted as volumes in the compose setup and are gitignored.

## Layout

```
apps/web        Next.js app (board UI, API routes)
packages/core   schema, db client, service layer, seed
packages/mcp    MCP server (stdio)
migration/      CSV importer (raw exports go in migration/raw/, gitignored)
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on :3000 |
| `npm run seed` | Reset the database with fictional demo data (refuses to wipe imported data without `--force`) |
| `npm run import -- --dry-run` | Preview a CSV import from `migration/raw/` |
| `npm run import` | Run the import |
| `npm run lint` / `typecheck` / `test` | Checks |

## License

MIT
