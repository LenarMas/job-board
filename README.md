# JobTrack

Self-hosted job search tracker. A kanban pipeline for your applications
(Wishlist, Applied, Interview, Offer, Rejected) with per-job activities, notes,
contacts and documents, a metrics page, and an MCP server so you can read and
update your board straight from an AI chat.

![Board screenshot placeholder](docs/screenshot-board.png)

## Quick start

Requires Node 20+.

```sh
git clone <this repo>
cd jobtrack
npm install
npm run dev
```

Open http://localhost:3000.

## Layout

```
apps/web        Next.js app (board UI, API routes)
packages/core   schema, db client, service layer
packages/mcp    MCP server (stdio)
migration/      import scripts for bringing data in from another tracker
```

## Status

Early. The board, metrics, importer and MCP server are being built out —
see commits for progress.

## License

MIT
