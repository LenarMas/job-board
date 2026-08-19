# JobTrack MCP server

A stdio MCP server that lets an AI chat read and update your JobTrack board.
It talks to the same SQLite database as the web app through the shared service
layer.

## Tools

| Tool | What it does |
|---|---|
| `list_jobs(stage?, query?)` | List jobs, optionally by stage or text filter |
| `get_job(id)` | Full details for one job: fields, comp, schedule, contacts, provenance |
| `add_job(title, company?, stage?, ...)` | Create a job — idempotent: matches an existing job by url, requisition id, or company+title instead of duplicating |
| `upsert_job(..., activities?, notes?)` | Create-or-update a job with activities and notes in one atomic call (backfills) |
| `update_job(id, ...)` | Patch any field in place: title, company, salary, comp, JD provenance, requisition id, calendar link, applied date, … |
| `move_job(id, stage)` | Move a job between stages |
| `archive_job(id)` / `restore_job(id)` / `list_archived()` | Reversible soft delete — archived jobs drop out of board, search, and metrics |
| `merge_jobs(source_id, target_id)` | Consolidate a duplicate: moves children, fills empty fields, archives the source |
| `find_duplicates()` | Flag likely duplicate pairs (fuzzy company + similar title, or same requisition id) |
| `set_source(job_id, source)` | Record how a job originated: applied, reachout, referral, other |
| `log_activity(job_id, category, title, ...)` | Log an activity with optional schedule (starts/ends, timezone), meeting details, and interviewer; warns on conflicts |
| `list_activities(category?, job_id?)` | List activities board-wide; `category: "unclassified"` finds interviews with no round type |
| `update_activity(activity_id, ...)` | Retag, rename, re-schedule, or complete an existing activity |
| `delete_activity(activity_id)` | Permanently delete one activity (destructive) |
| `find_conflicts(from, to, gap_minutes?)` | Overlapping or too-tight scheduled activities in a range |
| `add_availability(start, end, note?)` / `list_availability(from, to)` / `mark_availability_taken(id, activity_id)` | Track interview slots offered to recruiters |
| `add_contact(job_id, name, role?, ...)` / `list_contacts(job_id)` | People on a job with roles: recruiter, coordinator, interviewer, hiring_manager, agency, referrer |
| `add_note(job_id, body)` / `update_note(note_id, body)` / `delete_note(note_id)` | Notes (delete is destructive) |
| `search(query)` | Search titles, companies, locations, descriptions, and notes |
| `list_stale(days)` | Follow-up list: quiet jobs and overdue activities |
| `get_metrics()` | Stage totals, conversion rates, response rate, sources, interview rounds |

There is deliberately no hard delete over MCP — archiving is the destructive-adjacent operation, and it is reversible.

## Setup

From the repo root:

```sh
npm install
npm run build -w @jobtrack/mcp   # emits packages/mcp/dist/index.js
```

The server needs only Node 20+ to run — no build tools at launch time:

```sh
node packages/mcp/dist/index.js
```

It works from any working directory. The database defaults to
`data/jobtrack.db` inside the repo; set `JOBTRACK_DB` to an absolute path to
override.

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config),
replacing `/absolute/path/to/jobtrack` with where you cloned the repo:

```json
{
  "mcpServers": {
    "jobtrack": {
      "command": "node",
      "args": ["/absolute/path/to/jobtrack/packages/mcp/dist/index.js"],
      "env": {
        "JOBTRACK_DB": "/absolute/path/to/jobtrack/data/jobtrack.db"
      }
    }
  }
}
```

`JOBTRACK_DB` is optional (the server finds the repo's `data/` on its own) but
spelling it out makes the config self-documenting.

### Claude Code

```sh
claude mcp add jobtrack -- node /absolute/path/to/jobtrack/packages/mcp/dist/index.js
```

Restart the client and ask it something like "what's on my job board?".
Re-run the build after pulling changes to this package.

## Smoke test checklist

From a connected chat, verify each change appears in the web UI on refresh:

1. "Add a job: Platform Engineer at Example Corp, stage applied" → card appears
2. "Move that job to interview" → card changes column, applied date preserved
3. "Log a phone screen interview on it for next Tuesday" → activity with due date
4. "Add a note: recruiter is Sam, team of 6" → note on the Notes tab
5. "What are my board metrics?" → numbers match the /metrics page
