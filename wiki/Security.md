# Security

NexusMap implements multiple layers of security. This page documents each one.

## Authentication

- **Session cookies** with `HttpOnly`, `SameSite=Lax` flags — not accessible via JavaScript
- **bcrypt** password hashing with work factor 12
- **Password policy:** minimum 8 characters, requires uppercase, lowercase, digit, and special character
- **Password history:** prevents reuse of the last 5 passwords
- **Temporary passwords:** admins can create users with temporary passwords that must be changed on first login

## CSRF Protection

Every session has a unique CSRF token. All `POST`, `PUT`, and `DELETE` requests must include:
- Header: `X-CSRF-Token`
- Or form field: `_csrf`

The token is injected as a `<meta>` tag in every page and refreshed periodically.

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 attempts | 60 seconds |
| API (general) | 60 requests | 60 seconds |

Exceeding the limit returns `429 Too Many Requests`. The rate limiter uses a per-IP token bucket.

## Input Validation (Nmap Args)

The `ValidateNmapArgs()` function enforces:

- **Blocks shell injection:** backtick `` ` ``, `$()`, `;`, `|`, `&&`, `||`, newlines
- **Blocks dangerous flags:** `-oN`, `-oX`, `-oG`, `-oS`, `-oA`, `-oH`, `--stylesheet`, `--datadir`, `--webxml`, `--iflist`
- **Flag name validation:** must match `--[a-zA-Z0-9-]+`
- **Flag value validation:** only letters, digits, dots, hyphens, underscores, forward slashes, colons, and spaces

## Content Security Policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
```

- No external scripts or styles allowed
- Inline styles permitted for dynamic UI
- `data:` URIs allowed for images (PNG export)

## Session Management

- Sessions expire after 72 hours of inactivity
- Logout destroys the session server-side
- Only one active session per user
- Sessions stored in SQLite with CSRF token binding

## Role-Based Access

| Role | Permissions |
|------|-------------|
| **admin** | Full access: all projects, all scans, user management, database management, import/export |
| **user** | Access to assigned projects, can create and run scans, edit results, use import/export |
