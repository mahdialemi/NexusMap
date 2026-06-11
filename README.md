<div align="center">

<img src="logo.svg" width="150" height="150" alt="NexusMap Logo"/>

# NexusMap

**A modern web GUI for Nmap** — Organize, run, and visualize network scans from any browser.

[Download](https://github.com/mahdialemi/NexusMap/releases) · [Report Bug](https://github.com/mahdialemi/NexusMap/issues)

</div>

---

## Overview

NexusMap wraps Nmap in a clean, self-hosted web interface. Create projects, run scans with 40+ built-in profiles, edit results, merge data from multiple scans into a single consolidated view, track live hosts, and manage users — all from your browser.

No JavaScript framework, no CGO, no external dependencies beyond Nmap itself. The entire backend and frontend compile to a single portable binary.

---

## Requirements

- **Nmap 7.0+** — Must be installed and available in your system PATH ([nmap.org/download](https://nmap.org/download.html))
- **Go 1.23+** — Only needed when building from source

---

## Quick Start

### Install with Go

```bash
go install github.com/mahdialemi/NexusMap@v1.2.7
nexusmap
```

### Pre-built Binary

1. Download the latest release from [Releases](https://github.com/mahdialemi/NexusMap/releases)
2. Extract and run `nexusmap.exe` (or `./nexusmap` on Linux/macOS)
3. Open `http://127.0.0.1:9090` in your browser
4. Use the admin password printed in the console to log in

### Build from Source

```bash
git clone https://github.com/mahdialemi/NexusMap.git
cd NexusMap
go build -ldflags="-s -w" -o nexusmap .
./nexusmap
```

### First Boot

A random 16-character admin password is generated and printed to the console on first run. You must change it after logging in. The password line won't appear on subsequent runs.

> **Important:** Change the default password immediately. The app enforces this on first login.

### CLI Options

```
nexusmap -port 9090 -bind 127.0.0.1 -db /path/to/scanner.db
```

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `9090` | HTTP server port |
| `-bind` | `0.0.0.0` | Bind address (`0.0.0.0`, `127.0.0.1`, etc.) |
| `-db` | `scanner.db` | SQLite database path |
| `-admin-password` | *(random)* | Set initial admin password |
| `-version` | — | Print version and exit |
| `-skip-version-check` | — | Skip checking for newer version on startup |

---

## Features

### Scan Management

- **40+ built-in profiles** — Host discovery, TCP/UDP port scans, OS fingerprinting, service version detection, IDS/IPS evasion, and more
- **Custom Nmap arguments** — Override any profile or write your own with built-in safety validation
- **Real-time progress** — Watch scan status, host count, and port count update live via SSE
- **46 built-in NSE profiles** — Select and configure NSE scripts through the UI
- **Stop and restart** — Cancel running scans and retry with different parameters

### Scan Scheduling

- **One-shot scheduling** — Schedule scans for a specific date/time
- **Dependency triggers** — Start a scan automatically after another scan completes
- **Schedule info on scan cards** — See pending schedules and dependency relationships directly on scan cards

### Port Labeling

- **Assign labels** — Tag ports with custom labels (e.g., "web", "database", "admin")
- **Filter by label** — Filter assets by label using the filter builder

### Results & Editing

- **Editable results** — Double-click any cell to modify IP, port, service, version, OS, or notes
- **Bulk editing** — Update multiple ports at once (state, service, version, etc.)
- **Change tracking** — Every edit is recorded with before/after values for full audit trail
- **Revert** — Undo individual edits or revert to original scan data
- **Import results** — Import Nmap XML, Gnmap, or raw text output files

### Consolidated View

- **Merge all scans** — Automatically combine data from every scan in a project into one unified table
- **Deduplication** — Ports are merged across scans; change count tracks how many times a port was updated
- **Edit history** — See a complete timeline of changes for every host and port
- **Apply/Revert edits** — Review and apply or discard pending changes
- **Bulk delete** — Remove multiple consolidated ports at once
- **Export** — Export consolidated data to Excel, JSON, or TXT
- **Script output** — View NSE script results per host

### Live Host Management

- **ARP/ICMP discovery** — Discover live hosts on your network
- **Status tracking** — Mark hosts with custom statuses (online, offline, maintenance, etc.)
- **Bulk operations** — Update status or delete multiple hosts at once
- **Ping check** — Test reachability directly from the UI
- **Export** — Export live host data to Excel, JSON, or TXT

### User Management

- **Role-based access** — Admin and user roles with appropriate permissions
- **User CRUD** — Create, edit, and delete users
- **Password reset** — Force password change on next login
- **Activity log** — Track important actions across the system
- **Database management** — Backup, restore, vacuum, factory reset, and **database import**

### Security

- **Random admin password** — Generated on first boot; never ships with a default
- **Forced password change** — First login requires creating a strong password
- **Password policy** — Minimum 8 characters, must include uppercase, lowercase, digit, and special character
- **Password history** — Last 5 passwords are remembered and cannot be reused
- **CSRF protection** — Token-based prevention of cross-site request forgery
- **Rate limiting** — API request throttling per client IP
- **BCrypt hashing** — All passwords hashed with bcrypt (cost factor 12)
- **HTTP-only cookies** — Session tokens not accessible to JavaScript
- **Input validation** — Nmap arguments are sanitized and dangerous flags blocked
- **Security headers** — X-Content-Type-Options, X-Frame-Options, CSP-ready architecture

### Import/Export

| Format | Scans | Consolidated | Live Hosts |
|--------|-------|-------------|------------|
| Excel | — | ✅ | ✅ |
| JSON | ✅ | ✅ | ✅ |
| CSV | ✅ | — | — |
| TXT | — | ✅ | ✅ |
| XML (Nmap) | ✅ (import) | — | — |
| Gnmap | ✅ (import) | — | — |

### Database Import (Admin)

- **Merge full databases** — Import an entire NexusMap database from another instance
- **Preview before import** — See row counts per table before committing
- **Schema-safe** — Works across versions; only common columns are imported

---

## Architecture

```
nexusmap (single binary — all frontend files embedded)
├── scans/             # Nmap output files (auto-created)
└── scanner.db         # SQLite database (auto-created)
```

| Layer | Technology |
|---|---|
| Backend | Go 1.23, `net/http`, `modernc.org/sqlite` |
| Database | SQLite (pure Go, zero CGO) |
| Frontend | Vanilla JavaScript, Canvas API, CSS custom properties |
| Scanning | Nmap (external binary) |
| Real-time | Server-Sent Events (SSE) |
| Export | Excel (excelize), JSON, CSV, TXT |
| Security | bcrypt, CSRF tokens, rate limiting, session cookies |

---

## License

[MIT](LICENSE)

---

<div align="center">

**NexusMap** v1.2.7 &middot; Made with vibe coding by [Mahdi Alemi](https://github.com/mahdialemi)

</div>
