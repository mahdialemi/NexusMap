# Configuration

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `9090` | HTTP server port |
| `-host` | `0.0.0.0` | Bind address |
| `-db` | `nexusmap.db` | SQLite database file path |
| `-admin-password` | `changeme!` | Initial admin password (first run only) |
| `-version` | — | Print version and exit |

Example:

```bash
nexusmap -port 8080 -db /data/nexusmap.db
```

## Database

- SQLite database created automatically on first run
- Path configurable via `-db` flag
- Uses WAL mode for concurrent reads
- All data: users, projects, scans, results, profiles, activity logs

## Config File

NexusMap does not use a config file. All configuration is via CLI flags.

## Built-in Profiles

40+ built-in scan profiles are defined in `internal/nmap/validate.go`. They are organized into categories:

- Discovery (arp-discovery, ping-sweep, live-discovery, etc.)
- TCP Scanning (quick-tcp, fast-top-1000, full-port-scan, stealth-syn, etc.)
- UDP Scanning (udp-fast, udp-common, udp-top-1000)
- Evasion (fragmentation, decoys, source-port, mac-spoof, data-length)
- Timing (paranoid-t0, sneaky-t1, polite-t2)
- Special Scans (fin-scan, xmas-scan, null-scan, ack-scan, window-scan, maimon-scan)
- Comprehensive (aggressive, comprehensive/full)

Custom profiles can be created from the UI.
