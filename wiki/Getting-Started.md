# Getting Started

## Prerequisites

- **Nmap 7.0+** — must be installed and accessible in your system PATH
  - [Download Nmap](https://nmap.org/download.html)
  - Verify: `nmap --version`

## Installation

### Option 1: Download Pre-built Binary

1. Go to the [Releases page](https://github.com/mahdialemi/NexusMap/releases)
2. Download the binary for your OS (nexusmap-linux, nexusmap.exe, nexusmap-macos)
3. Make it executable (Linux/Mac): `chmod +x nexusmap`
4. Run it

### Option 2: Build from Source

```bash
git clone https://github.com/mahdialemi/NexusMap.git
cd NexusMap
go build -o nexusmap .
```

## First Run

```bash
# Start the server (default port 9090)
./nexusmap
```

```
NexusMap v1.0.0
Server started on http://localhost:9090
```

Open **http://localhost:9090** in your browser.

## Default Login

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `changeme!` |

**Change the password immediately after first login.**

## Quick Walkthrough

1. **Create a project** — click "New Project", give it a name
2. **Run a scan** — go to the "New Scan" tab, select a profile (e.g. `quick-tcp`), enter a target (e.g. `192.168.1.0/24`), click "Run Scan"
3. **View results** — click the scan to see open ports and services
4. **Explore topology** — switch to the "Topology" tab to see the network graph
5. **Consolidate** — run multiple scans, then use the "Consolidated" tab for a merged view

## Stopping the Server

Press `Ctrl+C` in the terminal.
