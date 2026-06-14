# Admin Guide

The Admin panel is available at `/admin` for users with the **admin** role.

---

## User Management

**Create user:** Username, role (admin/user), optional temporary password (auto-generated if blank).

**Edit user:** Change username, role, or reset password.

**Delete user:** Removes the user account. Scan history and edits are preserved.

**Password policies:** Enforced for all users:
- Minimum 8 characters
- Must contain uppercase, lowercase, digit, and special character
- Cannot reuse last 5 passwords

---

## Database Management

### Statistics

Shows:

- Database file size
- Row counts for all tables (users, projects, scans, hosts, ports, etc.)
- Latest activity

### Backup

Download a full SQLite database backup (`.db` file). The backup is consistent — NexusMap uses WAL mode so reads don't block writes.

### Restore

Import an external NexusMap database. The import **merges** data — existing records are not overwritten. You can preview the import before confirming.

### Vacuum

Reclaims unused disk space. The database file shrinks to its minimum size. Database remains online during vacuum (SQLite WAL mode).

### Factory Reset

Deletes all data: projects, scans, results, users, profiles, everything. Built-in profiles are re-seeded on next restart.

### Health Check

Runs `PRAGMA integrity_check` on the SQLite database. Reports any corruption.

---

## Activity Log

All significant actions are logged with:

- Username
- Action description
- Timestamp
- IP address

Examples: "admin created scan 'Quick scan'", "user deleted consolidated port 22/tcp on 10.0.0.5"

View the log from the Admin panel. Filter by action type or date range.
