# JobTrack MCP server

A stdio MCP server that lets an AI chat read and update your JobTrack board.
It talks to the same SQLite database as the web app through the shared service
layer.

## Tools

| Tool | What it does |
|---|---|
| `list_jobs(stage?, query?)` | List jobs, optionally by stage or text filter |
| `get_job(id)` | Full details for one job |
| `add_job(title, company?, stage?, ...)` | Create a job |
| `move_job(id, stage)` | Move a job between stages |
| `log_activity(job_id, category, title, ...)` | Log an apply/interview/follow-up/offer activity |
| `add_note(job_id, body)` | Add a markdown note |
| `search(query)` | Search titles, companies, locations |
| `get_metrics()` | Stage totals, conversion rates, response rate, weekly applications |

## Setup

Requires `npm install` at the repo root first. The server reads
`data/jobtrack.db` relative to the repo (override with the `JOBTRACK_DB`
environment variable).

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "jobtrack": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/jobtrack/packages/mcp/src/index.ts"]
    }
  }
}
```

### Claude Code

```sh
claude mcp add jobtrack -- npx -y tsx /absolute/path/to/jobtrack/packages/mcp/src/index.ts
```

Restart the client and ask it something like "what's on my job board?".

## Smoke test checklist

From a connected chat, verify each change appears in the web UI on refresh:

1. "Add a job: Platform Engineer at Example Corp, stage applied" → card appears
2. "Move that job to interview" → card changes column, applied date preserved
3. "Log a phone screen interview on it for next Tuesday" → activity with due date
4. "Add a note: recruiter is Sam, team of 6" → note on the Notes tab
5. "What are my board metrics?" → numbers match the /metrics page
