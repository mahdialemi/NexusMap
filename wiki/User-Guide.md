# User Guide

## Projects

The dashboard lists all projects. Each project represents a network or scope you are scanning.

**Create a project:** Click "New Project" → fill in name, description, optional tags, priority, client, due date.

**Project tabs:** Click a project to open it. Inside you'll find:

| Tab | Description |
|-----|-------------|
| Scans | All scans for this project, with status, progress, confirm/reject actions |
| New Scan | Create and run scans |
| Live Hosts | ARP/ICMP discovered hosts on the local network |
| Consolidated | Merged view of all scan results (hosts + ports) |
| Topology | Interactive network topology graph |
| Scripts | Browse and run NSE scripts |
| Import | Import scan data from various formats |

---

## Scan Profiles

NexusMap ships with 40+ built-in profiles organized by category:

**Discovery**
| Profile | Target | Description |
|---------|--------|-------------|
| `arp-discovery` | `192.168.1.0/24` | ARP scan for local network discovery |
| `ping-sweep` | `192.168.1.0/24` | ICMP echo ping sweep |
| `live-discovery` | `192.168.1.0/24` | Multiple discovery methods (ARP + ICMP + TCP) |

**TCP Scanning**
| Profile | Description |
|---------|-------------|
| `quick-tcp` | Top 100 TCP ports |
| `fast-top-1000` | Top 1000 TCP ports, service version |
| `full-port-scan` | All 65535 TCP ports |
| `stealth-syn` | SYN stealth scan (default, needs root) |
| `full-connect` | TCP connect scan (no root needed) |

**UDP Scanning**
| Profile | Description |
|---------|-------------|
| `udp-fast` | Top 100 UDP ports |
| `udp-common` | 50 common UDP ports |
| `udp-top-1000` | Top 1000 UDP ports |

**Evasion Techniques**
| Profile | Description |
|---------|-------------|
| `fragmentation` | Fragment IP packets to evade firewalls |
| `decoys` | Use decoy source addresses |
| `source-port` | Specify a source port |
| `mac-spoof` | Spoof MAC address |
| `data-length` | Append random data to packets |

**Timing**
| Profile | Description |
|---------|-------------|
| `paranoid-t0` | Extremely slow (IDS evasion) |
| `sneaky-t1` | Very slow |
| `polite-t2` | Polite rate |

**Special Scans**
| Profile | Description |
|---------|-------------|
| `fin-scan`, `xmas-scan`, `null-scan` | TCP flag manipulation scans |
| `ack-scan` | Map firewall rulesets |
| `window-scan`, `maimon-scan` | Advanced TCP techniques |

**Comprehensive**
| Profile | Description |
|---------|-------------|
| `aggressive (-A)` | Full OS detection, versioning, scripts, traceroute |
| `comprehensive/full` | All TCP + top UDP, OS detection, versioning, scripts |

You can also supply **custom Nmap arguments** — they are validated for safety (shell injection blocked, output flags denied).

---

## Running Scans

1. Go to the **New Scan** tab
2. Select a **profile** (or enter custom args)
3. Enter a **target** (IP, range, CIDR, hostname)
4. Optionally set a **note** for this scan run
5. Click **Run Scan**

**Real-time progress:** The scan status updates via SSE — you see Nmap's output lines as they come in, including open ports discovered in real-time.

**After completion:**

- **Confirm** — accepts the results into the project
- **Reject** — discards the results
- Results are editable after confirmation

**Stop a scan:** Click the stop button to kill the running Nmap process.

---

## Editing Results

Once a scan is confirmed, results are editable:

- **Double-click** any cell in the port table to edit (state, service, version, product, extra info)
- **Bulk edit:** Select multiple rows, click "Edit Selected", apply a change to all at once
- **Change history:** Every edit is recorded with username and timestamp
- **Revert:** Click "History" to see all changes for a port, revert any individual change

---

## Consolidated View

The Consolidated tab merges **all scans** in a project into a single unified view.

### Consolidated Hosts

Deduplicated list of all discovered IPs showing:

- IP, MAC, hostname, OS, status
- Discovery methods (which scan types found this host)
- First seen / last seen timestamps
- Labels (assign custom labels)

### Consolidated Ports

Paginated, filterable table of all ports across all scans:

- **Filters:** Advanced query builder with AND/OR groups. Field types: string, enum, number, date.
- **Labels:** Assign colored labels to hosts or ports
- **Notes:** Add notes to individual ports (e.g., "this is the DB server")
- **Export:** Export the consolidated view to Excel, JSON, CSV, or TXT

---

## Live Hosts

The Live Hosts tab manages hosts discovered via ARP/ICMP:

- **Discovery:** Click "Discover" to run ARP scan + ping sweep on the local network
- **Status tracking:** Hosts marked as `alive`, `dead`, or `unknown`
- **Ping check:** Click the ping icon to test if a host is currently reachable
- **Field editing:** Edit hostname, MAC, OS, note, and status inline
- **Detail view:** Click a host to see associated ports, scan history, and script results
- **Bulk operations:** Select multiple hosts to delete or bulk-update status
- **Export:** Download live host list as Excel, JSON, or TXT

---

## Topology

The Topology tab renders an interactive graph of your network.

**Basic interaction:**

- **Subnet clusters** — hosts grouped by /24 subnet. Cluster nodes are hexagons.
- **Click a cluster** — expand to show individual hosts; click again to collapse
- **Click a host** — shows port details in the detail panel (bottom-left)

**Toolbar controls:**

| Button | Action |
|--------|--------|
| Search | Filter by IP, hostname, OS, port, or service. Press Enter or click the search button. |
| Risk | Toggle — highlights hosts with high-risk ports (21, 23, 25, 445, 3389, etc.) in red |
| Path | Select two hosts → highlights the shortest network path between them |
| Expand | Expand all subnet clusters |
| Collapse | Collapse all clusters |
| Layout | Switch between Force-directed, Hierarchical, or Radial layout |
| Zoom In/Out | Adjust zoom level |
| Fit | Fit all nodes to the viewport |
| Fullscreen | Enter fullscreen mode |
| Export PNG | Download the current graph view as an image |

**Right-click context menu:** Copy IP, copy hostname, set custom label, show details.

**Hover behavior:** Hover a host to highlight its neighbors (dim non-connected nodes) and see a tooltip with OS, port count, services, and risk info.

---

## Scheduling

Create schedules to run scans automatically:

**Time-based:** Run a scan at a specific date and time (one-shot).

**Dependency-based:** Run a scan automatically when another scan finishes.

The scheduler runs in the background and checks for due schedules every 30 seconds.

---

## Import

Supports importing scan data from multiple formats:

| Format | Notes |
|--------|-------|
| Nmap XML (`-oX`) | Full data: ports, OS, scripts, hostnames |
| Gnmap (`-oG`) | Grepable Nmap output |
| CSV | Port data in comma-separated format |
| JSON | Structured JSON format |
| Nmap normal (`-oN`) | Human-readable format |
| Raw text | Auto-detects format from content |
| Full DB merge | Import another NexusMap SQLite database |

**Import flow:** Select file → choose format → preview parsed data → confirm import.

---

## Export

Export scan data in four formats:

- **Excel (.xlsx)** — styled headers, formatted columns, auto-width
- **JSON** — structured data for programmatic use
- **CSV** — comma-separated values for spreadsheet apps
- **TXT** — human-readable report

Export from: scan results page, consolidated view, or live hosts. File sizes are pre-calculated before download.

---

## NSE Scripts

NexusMap integrates with Nmap's Scripting Engine:

- **Browse scripts:** Click "Find Scripts" to search the Nmap scripts directory on your system
- **Categories:** HTTP, DNS, SMB, SSH, SSL/TLS, FTP, SMTP, Database, SNMP, Other
- **Built-in profiles:** 46 profiles use NSE scripts (e.g., `http-enum`, `smb-enum-shares`, `ssl-heartbleed`)
- **Results:** Script output stored per-host and per-port, viewable in scan results and consolidated view
