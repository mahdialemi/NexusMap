<div align="center">

<img src="logo.svg" width="130" height="130" alt="NexusMap Logo"/>

# NexusMap

**A modern web GUI for Nmap** — run, organize, and visualize network scans from any browser.

[Download](https://github.com/mahdialemi/NexusMap/releases)

</div>

---

## Quick Start

1. Download the [latest release](https://github.com/mahdialemi/NexusMap/releases)
2. Run `nexusmap` (or `./nexusmap` on Linux/macOS)
3. Open `http://127.0.0.1:9090` — use the admin password printed in the console

### Build from Source
```bash
git clone https://github.com/mahdialemi/NexusMap.git
cd NexusMap
go build -ldflags="-s -w" -o nexusmap .
./nexusmap
```

### Requirements
- **Nmap 7.0+** — must be in your system PATH
- **Go 1.23+** — only needed when building from source

---

## Project Structure

```
nexusmap                 # Single binary (all frontend files embedded)
├── scans/               # Nmap output files (auto-created)
├── scanner.db           # SQLite database (auto-created)
│
├── main.go              # Entry point, HTTP server, embedded web files
├── internal/
│   ├── auth/            # Auth, sessions, CSRF, rate limiting
│   ├── db/              # SQLite models and queries
│   ├── export/          # Excel, JSON, CSV, TXT exporters
│   ├── handlers/        # HTTP handlers (scans, projects, etc.)
│   └── nmap/            # Nmap runner, parse XML/gnmap/CSV
├── web/
│   ├── css/             # Styles (dark/light theme via CSS vars)
│   ├── js/              # Vanilla JS frontend logic
│   ├── pages/           # HTML pages (served from embedded FS)
│   └── icons/           # SVG sprite sheet
└── data/                # Default DB location
```

| Layer | Technology |
|---|---|
| Backend | Go, `net/http`, `modernc.org/sqlite` |
| Frontend | Vanilla JS, CSS custom properties |
| Database | SQLite (pure Go, zero CGO) |
| Scanning | Nmap (external binary) |
| Real-time | Server-Sent Events (SSE) |
| Export | Excel (excelize), JSON, CSV, TXT |
| Security | bcrypt, CSRF, rate limiting, session cookies |

---

## Features

- **40+ scan profiles** — host discovery, TCP/UDP, OS detection, service versioning, evasion
- **Custom Nmap args** — override profiles with built-in safety validation
- **Real-time progress** — live SSE updates
- **Scheduling** — one-shot or dependency-based triggers
- **Editable results** — double-click cells, bulk editing, change audit, revert
- **Consolidated view** — merge all scans, deduplicate, filter, label ports
- **Live host discovery** — ARP/ICMP, status tracking, ping check
- **NSE scripts** — 46 built-in profiles, run from UI
- **Import** — Nmap XML, Gnmap, CSV, or full DB merge
- **Export** — Excel, JSON, CSV, TXT
- **User management** — roles, activity log, password policy
- **Admin tools** — DB backup, restore, vacuum, factory reset

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

**NexusMap** v0.9.0 &middot; Made by [Mahdi Alemi](https://github.com/mahdialemi)

</div>
