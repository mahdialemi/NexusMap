# API Reference

All endpoints return JSON. Authentication is via session cookie + CSRF token.

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/login` | No | Login with username/password |
| POST | `/api/logout` | Yes | Logout (destroy session) |
| GET | `/api/me` | Yes | Get current user info |
| PUT | `/api/change-password` | Yes | Change password |
| GET | `/api/csrf-token` | Yes | Get CSRF token |

---

## Projects

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | Yes | List projects |
| POST | `/api/projects` | Yes | Create project |
| GET | `/api/projects/{id}` | Yes | Get project |
| PUT | `/api/projects/{id}` | Yes | Update project |
| DELETE | `/api/projects/{id}` | Admin | Delete project |
| PUT | `/api/projects/{id}/status` | Yes | Update project status |
| GET | `/api/projects/{id}/scans` | Yes | List scans in project |
| GET | `/api/projects/{id}/schedules` | Yes | List schedules |
| POST | `/api/projects/{id}/schedules/create` | Yes | Create schedule |
| DELETE | `/api/projects/{id}/schedules/{sid}/delete` | Yes | Delete schedule |

---

## Scans

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/scans/create` | Yes | Create scan |
| POST | `/api/scans/{id}/run` | Yes | Start scan |
| POST | `/api/scans/{id}/stop` | Yes | Stop running scan |
| POST | `/api/scans/{id}/confirm` | Yes | Confirm results |
| POST | `/api/scans/{id}/reject` | Yes | Reject results |
| POST | `/api/projects/{id}/scans/confirm-all` | Yes | Confirm all scans in project |
| GET | `/api/scans/{id}` | Yes | Get scan details |
| PUT | `/api/scans/{id}` | Yes | Update scan |
| DELETE | `/api/scans/{id}` | Yes | Delete scan |
| GET | `/api/scans/{id}/log` | Yes | Get scan execution log |
| GET | `/api/scans/{id}/status` | Yes | Get real-time status + progress |
| GET | `/api/scans/{id}/results` | Yes | Get scan results |
| GET | `/api/scans/{id}/scripts` | Yes | Get NSE script results |
| GET | `/api/scans/{id}/download/xml` | Yes | Download raw XML |
| GET | `/api/scans/{id}/download/nmap` | Yes | Download normal format |
| GET | `/api/scans/{id}/download/gnmap` | Yes | Download greppable format |
| POST | `/api/scans/backfill` | Yes | Backfill scripts for all scans |
| POST | `/api/scans/{id}/backfill` | Yes | Backfill scripts for one scan |

---

## Consolidated

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/{id}/consolidated/hosts` | List consolidated hosts |
| GET | `/api/projects/{id}/consolidated/ports` | List consolidated ports (paginated) |
| PUT | `/api/projects/{id}/consolidated/ports/update` | Update a port field |
| GET | `/api/projects/{id}/consolidated/ports/history` | Get port change history |
| POST | `/api/projects/{id}/consolidated/ports/revert` | Revert port to original |
| GET | `/api/projects/{id}/consolidated/ports/edits` | List all edits |
| POST | `/api/projects/{id}/consolidated/ports/edits/{eid}/revert` | Revert an edit |
| POST | `/api/projects/{id}/consolidated/ports/edits/{eid}/apply` | Apply a pending edit |
| POST | `/api/projects/{id}/consolidated/ports/bulk-delete` | Bulk delete ports |
| GET | `/api/projects/{id}/consolidated/hosts/edits` | List host edits |
| POST | `/api/projects/{id}/consolidated/hosts/edits/{eid}/revert` | Revert host edit |
| GET | `/api/projects/{id}/consolidated/scripts` | Get script results |
| GET | `/api/projects/{id}/consolidated/notes` | Get port note |
| POST | `/api/projects/{id}/consolidated/notes/set` | Set port note |
| DELETE | `/api/projects/{id}/consolidated/notes/delete` | Delete port note |
| GET | `/api/projects/{id}/consolidated/filter-options` | Get available filter options |
| GET | `/api/projects/{id}/consolidated/field-values` | Get distinct field values |
| POST | `/api/projects/{id}/consolidated/ports/query` | Advanced filtered query |
| GET | `/api/projects/{id}/consolidated/export/{fmt}` | Export (xlsx/json/csv/txt) |

---

## Live Hosts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/{id}/live` | List live hosts |
| GET | `/api/projects/{id}/live/ping` | Ping a host |
| PUT | `/api/projects/{id}/live/status` | Update host status |
| DELETE | `/api/projects/{id}/live/delete` | Delete a host |
| POST | `/api/projects/{id}/live/bulk-delete` | Bulk delete hosts |
| POST | `/api/projects/{id}/live/bulk-status` | Bulk update status |
| GET | `/api/projects/{id}/live/detail` | Get host detail (ports, scripts, scan history) |
| PUT | `/api/projects/{id}/live/update-field` | Update a host field |
| GET | `/api/projects/{id}/topology` | Get topology graph data |

---

## Profiles & NSE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scan/profiles` | List profiles |
| POST | `/api/scan/profiles` | Create custom profile |
| PUT | `/api/scan/profiles` | Update profile |
| DELETE | `/api/scan/profiles` | Delete profile |
| GET | `/api/scan/nse` | Search NSE scripts |

---

## Import/Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import/{pid}` | Import data |
| POST | `/api/import/{pid}/preview` | Preview import |
| GET | `/api/import/{pid}/history` | Import history |
| GET | `/api/export/{sid}/{fmt}` | Export scan results |
| GET | `/api/export/{sid}/availability` | Check export format availability |
| GET | `/api/live/export/{id}` | Export live hosts |
| GET | `/api/live/export/{id}/sizes` | Pre-compute export sizes |

---

## Users (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| GET | `/api/users/{id}` | Get user |
| PUT | `/api/users/{id}` | Update user |
| DELETE | `/api/users/{id}` | Delete user |

---

## Database Management (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/db` | DB statistics |
| GET | `/api/db/stats` | Detailed stats |
| GET | `/api/db/backup` | Download backup |
| POST | `/api/db/vacuum` | Vacuum database |
| POST | `/api/db/factory-reset` | Factory reset |
| GET | `/api/db/activity` | Activity log |
| GET | `/api/db/health` | Health check |
| POST | `/api/db/import` | Import external database |
| POST | `/api/db/import/preview` | Preview external database |

---

## Real-time & Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | SSE stream for live events |
| GET | `/api/stats/global` | Global statistics |
| GET | `/api/tags` | Get tag cloud |
