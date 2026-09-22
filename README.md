# job-tracker-mcp

A small MCP server that lets an AI agent (Claude Code, Claude Desktop,
Cursor, etc.) keep track of my job applications.

## Why I built it

I was applying to a lot of jobs and tracking them in my head and in a
messy spreadsheet. I was already pasting job postings into Claude to
tailor my resume, so I wanted Claude to also remember what I applied to,
update the status when I heard back, and tell me which applications
needed a follow-up.

A chat alone can't do that: it forgets everything between conversations,
and it is unreliable at date maths ("was that 9 days ago or 12?"). This
server gives the agent a small, permanent store and does the date
calculation for it.

## Tools

| Tool | What it does |
|---|---|
| `add_application` | Save a job: company, role, location, link, status, notes. |
| `list_applications` | Show saved jobs, newest first, with `daysSinceUpdate`. Filter by status or company. |
| `update_application` | Change the status (e.g. `interviewing`, `rejected`) and add dated notes. |

Statuses: `saved`, `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`.

Data is stored in `~/.job-applications.json`. Set `JOB_TRACKER_FILE` to use
a different file.

## Setup

```bash
git clone https://github.com/joanapie/job-tracker-mcp.git
cd job-tracker-mcp
npm install
```

Add it to Claude Code:

```bash
claude mcp add job-tracker -- node /absolute/path/to/job-tracker-mcp/server.js
```

Things you can then say:

- *"Here's a posting I just applied to: [paste]. Add it."*
- *"Which applications have had no update for more than 10 days?"*
- *"Konrad invited me to a phone screen on Friday."*
