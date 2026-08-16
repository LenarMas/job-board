# JobTrack MCP server

A stdio MCP server that lets an AI chat read and update your JobTrack board.
It talks to the same SQLite database as the web app through the shared service
layer.

## Tools

| Tool | What it does |
|---|---|
| `list_jobs(stage?, query?)` | List jobs, optionally by stage or text filter |
| `get_job(id)` | Full details for one job |
| `add_job(title, company?, stage?, source?, ...)` | Create a job |
| `move_job(id, stage)` | Move a job between stages |
| `set_source(job_id, source)` | Record how a job originated: applied, reachout, referral, other |
| `log_activity(job_id, category, title, ...)` | Log an activity — categories: apply, screen, interview, hm, technical, final, follow_up, offer, other |
| `list_activities(category?, job_id?)` | List activities board-wide; `category: "unclassified"` finds interviews with no round type |
| `update_activity(activity_id, ...)` | Retag, rename, re-date, or complete an existing activity |
| `add_note(job_id, body)` | Add a markdown note |
| `search(query)` | Search titles, companies, locations |
| `get_metrics()` | Stage totals, conversion rates, response rate, weekly applications |

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
