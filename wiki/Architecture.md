# Architecture

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Go 1.23+, `net/http` (no frameworks) |
| Frontend | Vanilla JavaScript, CSS custom properties |
| Database | SQLite via `modernc.org/sqlite` (pure Go, no CGO) |
| Scanning | Nmap 7.0+ (external binary) |
| Real-time | Server-Sent Events (SSE) |
| Export | Excel (`xuri/excelize/v2`), JSON, CSV, TXT |
| Security | bcrypt, HMAC sessions, CSRF, rate limiting |

## Directory Structure

```
nexusmap/
├── main.go                    # Entry point, HTTP server, route registration
├── internal/
│   ├── auth/                  # Authentication, sessions, CSRF, middleware
│   │   └── auth.go
│   ├── db/                    # SQLite schema, queries, data access
│   │   ├── db.go              # Connection, migrations
│   │   ├── structs.go         # All data models
│   │   ├── scans.go / projects.go / results.go
│   │   ├── consolidated.go / live.go
│   │   ├── profiles.go / schedules.go / scripts.go
│   │   ├── global_stats.go / db_mgmt.go
│   ├── nmap/                  # Nmap integration
│   │   ├── runner.go          # Process management
│   │   ├── validate.go        # Argument validation + profile definitions
│   │   ├── parse_xml.go / parse_gnmap.go / parse_nmap.go / parse_csvjson.go
│   ├── export/
│   │   └── export.go          # Excel/JSON/CSV/TXT generation
│   └── handlers/
│       ├── handlers.go        # Server struct, helpers
│       ├── auth.go / projects.go / scans.go / results.go
│       ├── consolidated.go / live.go / profiles.go
│       ├── schedules.go / import.go / export.go
│       ├── sse.go             # SSE event broker
│       ├── users.go / dbmgmt.go / dbimport.go
│       ├── ratelimit.go / logging.go
└── web/                       # Embedded frontend
    ├── css/app.css            # All styles (dark/light themes)
    ├── js/                    # Frontend JavaScript
    ├── icons/sprite.svg       # SVG icon set
    ├── pages/                 # HTML pages
    │   ├── login.html / change-password.html
    │   ├── index.html         # Project dashboard
    │   ├── project.html       # Main project UI (all tabs)
    │   ├── results.html       # Scan results with inline editing
    │   └── users.html         # Admin panel
    └── favicon.svg
```

## Request Flow

```
Browser                          Server
   │                                │
   ├── GET / ──────────────────────►│─── session cookie check
   │                                │─── load CSRF token
   │◄── HTML page + <meta csrf> ────│
   │                                │
   ├── POST /api/scans/create ────►│─── auth middleware
   │   + CSRF header               │─── CSRF validation
   │                                │─── rate limit check
   │                                │─── handler → DB insert
   │◄── JSON { id, status } ───────│
   │                                │
   ├── POST /api/scans/{id}/run ──►│─── spawn nmap goroutine
   │                                │─── exec.Command("nmap", args...)
   │◄── JSON { status: "running" }──│
   │                                │
   │◄── SSE: scan progress ────────│─── parse output → DB → emit event
   │◄── SSE: scan complete ────────│
```

## Data Model (Key Tables)

```
users ────── sessions
  │
projects ─── schedules
  │
scans ────── hosts ────── ports ────── port_scripts
  │          │
  │          └───── host_scripts
  │
consolidated_hosts ─── consolidated_ports ─── consolidated_edits
                                                consolidated_notes

live_hosts

profiles

activity_log
import_history
notifications
```

## Embedding System

All frontend files are embedded into the Go binary using `//go:embed`:

```go
//go:embed web/css/* web/js/* web/icons/* web/pages/* web/favicon.svg
var embeddedFS embed.FS
```

This produces a single, self-contained binary with no external dependencies at runtime (except Nmap).
