<div align="center">

<img src="logo.svg" width="130" height="130" alt="NexusMap Logo"/>

# NexusMap

**A modern web GUI for Nmap** — run, organize, and visualize network scans from any browser.

[Download](https://github.com/mahdialemi/NexusMap/releases) · [Report Bug](https://github.com/mahdialemi/NexusMap/issues)

</div>

---

## Quick Start

### Pre-built Binary
1. Download the [latest release](https://github.com/mahdialemi/NexusMap/releases)
2. Run `nexusmap` (or `./nexusmap` on Linux/macOS)
3. Open `http://127.0.0.1:9090` — use the admin password printed in the console

### Install with Go
```bash
go install github.com/mahdialemi/NexusMap/v2@latest
nexusmap
```

### Build from Source
```bash
git clone https://github.com/mahdialemi/NexusMap.git
cd NexusMap
go build -ldflags="-s -w" -o nexusmap .
./nexusmap
```

### Requirements
- **Nmap 7.0+** — must be in your system PATH ([download](https://nmap.org/download))
- **Go 1.23+** — only needed when building from source

### CLI Options
```
nexusmap -port 9090 -bind 127.0.0.1 -db /path/to/scanner.db
```

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `9090` | HTTP port |
| `-bind` | `0.0.0.0` | Bind address |
| `-db` | `scanner.db` | SQLite database path |
| `-admin-password` | *(random)* | Set initial admin password |
| `-version` | — | Print version and exit |
| `-skip-version-check` | — | Skip update check on startup |

---

## Features

### Scan Management
- **40+ built-in profiles** — host discovery, TCP/UDP scans, OS fingerprinting, service detection, evasion
- **Custom Nmap args** — override profiles with built-in safety validation
- **Real-time progress** — live SSE updates on scan status
- **46 NSE profiles** — select and configure NSE scripts through the UI
- **Stop & restart** — cancel and retry scans

### Scanning & Scheduling
- **One-shot scheduling** — set a specific date/time
- **Dependency triggers** — auto-start a scan after another finishes

### Results & Editing
- **Editable cells** — double-click to modify IP, port, service, version, OS, notes
- **Bulk editing** — update multiple ports at once
- **Change audit** — every edit logged with before/after values
- **Revert** — undo edits or revert to original scan data
- **Port labeling** — tag ports (e.g. "web", "database") and filter by label
- **Import** — Nmap XML, Gnmap, or raw text

### Consolidated View
- **Merge all scans** — combine every scan into one unified table
- **Deduplication** — ports merged across scans; change count tracks updates
- **Edit history** — complete timeline of changes per host/port
- **Bulk delete & export** — export to Excel, JSON, or TXT
- **NSE script output** — view per-host script results
- **Advanced filtering** — multi-condition filter builder

### Live Host Management
- **ARP/ICMP discovery** — find live hosts on your network
- **Status tracking** — online, offline, maintenance, etc.
- **Bulk operations** — update status or delete multiple hosts
- **Ping check** — test reachability from the UI
- **Export** — Excel, JSON, TXT

### User & Security
- **Role-based access** — admin and user roles
- **CRUD users** — create, edit, delete; force password change
- **Activity log** — track system-wide actions
- **Random admin password** — generated on first boot, never ships with a default
- **Password policy** — min 8 chars, uppercase, lowercase, digit, special
- **Password history** — last 5 passwords remembered
- **CSRF protection**, rate limiting, bcrypt hashing, HTTP-only cookies
- **Nmap arg sanitization** — dangerous flags blocked

### Import / Export
| Format | Scans | Consolidated | Live Hosts |
|--------|-------|-------------|------------|
| Excel | — | ✅ | ✅ |
| JSON | ✅ | ✅ | ✅ |
| CSV | ✅ | — | — |
| TXT | — | ✅ | ✅ |
| XML (Nmap) | ✅ (import) | — | — |
| Gnmap | ✅ (import) | — | — |

### Database Management (Admin)
- **Full DB import** — merge an entire NexusMap database from another instance
- **Preview before import** — see row counts per table
- **Schema-safe** — imports only common columns across versions
- **Backup, restore, vacuum, factory reset**

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
| Frontend | Vanilla JS, Canvas API, CSS custom properties |
| Scanning | Nmap (external binary) |
| Real-time | Server-Sent Events (SSE) |
| Export | Excel (excelize), JSON, CSV, TXT |
| Security | bcrypt, CSRF, rate limiting, session cookies |

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

**NexusMap** v2.0.0 &middot; Made by [Mahdi Alemi](https://github.com/mahdialemi)

</div>
