# NexusMap

**NexusMap** is a web-based network scanner and topology mapper built in Go. It provides an integrated interface for running Nmap scans, managing results, visualizing network topology, and exporting data — all from a single self-contained binary.

## Features

- **Scan Management** — create, run, monitor, and review Nmap scans with real-time progress via SSE
- **40+ Built-in Profiles** — organized by category: discovery, TCP/UDP scanning, evasion, timing, comprehensive
- **Custom Nmap Args** — with safety validation (shell injection and dangerous flags blocked)
- **Consolidated View** — merge results from multiple scans with deduplication, advanced filtering, labeling, notes, per-port history, and revert
- **Live Host Discovery** — ARP + ICMP discovery with status tracking, ping checks, bulk operations
- **Topology Graph** — interactive vis-network graph with subnet clustering, Maltego-style visual design, neighbor highlighting, BFS pathfinding, layout switching, export PNG, context menu
- **Real-time Streaming** — scan output, port discoveries, and status updates via Server-Sent Events
- **Inline Editing** — double-click to edit scan results, bulk edit, full change history with revert
- **Import/Export** — Nmap XML, Gnmap, CSV, JSON, normal format, full DB merge
- **Scheduling** — time-based and dependency-based scan scheduling
- **NSE Integration** — browse and run Nmap Scripting Engine scripts
- **Authentication & Security** — session cookies, bcrypt hashing, CSRF protection, rate limiting, input validation, CSP headers
- **Role-Based Access** — admin and user roles
- **Dark Theme** — modern dark UI with light theme option

## Quick Start

```bash
# Download the binary for your platform from Releases
# Run it:
nexusmap

# Open http://localhost:9090 in your browser
# Default login: admin / changeme!
```

> **Prerequisite:** Nmap 7.0+ must be installed and in your PATH.

## Contents

| Page | Description |
|------|-------------|
| [[Getting-Started]] | Installation, first run, default login |
| [[Configuration]] | CLI flags, config file, environment variables |
| [[User-Guide]] | Projects, profiles, scans, results, consolidated view, live hosts, topology, scheduling, import/export, NSE scripts |
| [[Security]] | Auth, CSRF, rate limiting, input validation, CSP, sessions, RBAC |
| [[Admin-Guide]] | User management, database management, activity log |
| [[API-Reference]] | Complete HTTP API reference |
| [[Architecture]] | Tech stack, directory structure, request flow, data model |
| [[Development]] | Building, conventions, adding profiles, frontend, testing, release |
| [[Troubleshooting]] | Common issues and solutions |

## License

[MIT License](https://github.com/mahdialemi/NexusMap/blob/main/LICENSE)
