# Troubleshooting

## "Nmap not found" on startup

NexusMap requires Nmap 7.0+ in the system PATH.

```bash
# Check if Nmap is installed
nmap --version

# Linux (Debian/Ubuntu)
sudo apt install nmap

# Linux (RHEL/Fedora)
sudo dnf install nmap

# macOS
brew install nmap

# Windows
# Download installer from https://nmap.org/download.html
```

## "Port already in use" error

The default port `9090` is taken. Use the `-port` flag:

```bash
nexusmap -port 8080
```

## "Permission denied" when binding

Ports below 1024 require root/admin privileges. Use a higher port:

```bash
nexusmap -port 9090
```

Or run as administrator/root (not recommended for security).

## Scan stuck on "running"

1. Check if Nmap is actually running:
   ```bash
   # Linux/macOS
   ps aux | grep nmap

   # Windows
   Get-Process nmap
   ```
2. Kill the stuck Nmap process manually
3. Restart NexusMap
4. If the scan status doesn't reset, delete the scan from the UI and re-run

## Forgotten admin password

Restart NexusMap with the `-admin-password` flag to reset:

```bash
nexusmap -admin-password NewSecurePass123
```

This only takes effect on first run or if the admin user doesn't exist yet. If the admin already exists, use the database management page to create a new admin user, or:

1. Stop NexusMap
2. Delete the database file (backup first!)
3. Restart NexusMap with `-admin-password` flag

## Database file is growing large

1. Run **Vacuum** from the Admin panel to reclaim unused space
2. Delete old/unneeded scans
3. Export and archive old data, then remove scans

## "Invalid Nmap arguments" error

Custom Nmap arguments are validated for safety. Common issues:

- Shell metacharacters (`` ` ``, `$()`, `;`, `|`) are blocked
- Output flags (`-oN`, `-oX`, `-oG`, `-oA`, etc.) are blocked
- Flag values must match: `[a-zA-Z0-9._\\-/: ]`

Use the built-in profiles if you encounter validation errors.

## Windows — SmartScreen / antivirus false positive

The Go binary is unsigned, which triggers Windows SmartScreen and some antivirus software. This is a **false positive**. To proceed:

1. Click "More info" → "Run anyway"
2. Or build from source yourself to get a uniquely-signed binary

## Web UI not loading / blank page

1. Check the browser console (F12) for JavaScript errors
2. Clear your browser cache and reload
3. Ensure you're using a modern browser (Chrome, Firefox, Edge, Safari — latest 2 versions)
4. Check the server console for error logs

## "CSRF token mismatch" error

This happens when the session expires or the page is open for too long. Refresh the page and try again.

## Scan starts but no results appear

1. Check the scan log in the UI for Nmap output
2. Verify the target is reachable (try pinging it manually)
3. Check firewall rules on the target
4. Try a simpler profile (e.g., `ping-sweep`) to verify Nmap works

## How to report a bug

Open an issue on GitHub: https://github.com/mahdialemi/NexusMap/issues

Include:
- NexusMap version (`nexusmap -version`)
- OS and architecture
- Nmap version (`nmap --version`)
- Steps to reproduce
- Server log output (if applicable)
