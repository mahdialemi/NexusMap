# Development

## Building

```bash
git clone https://github.com/mahdialemi/NexusMap.git
cd NexusMap

# Build with debug info
go build -o nexusmap .

# Build with stripped binary
go build -ldflags="-s -w" -o nexusmap .

# Cross-compile
GOOS=linux GOARCH=amd64 go build -o nexusmap-linux .
GOOS=windows GOARCH=amd64 go build -o nexusmap.exe .
GOOS=darwin GOARCH=amd64 go build -o nexusmap-macos .
```

## Code Conventions

- **No Go frameworks** — standard library `net/http` only
- **No ORM** — raw SQL queries with `database/sql`
- **Handler pattern:** `func(w http.ResponseWriter, r *http.Request)` — methods on `*Server` struct
- **Error responses:** `serverError(w, err)` for 500, `badRequest(w, msg)` for 400
- **JSON responses:** `writeJSON(w, data)` for success, `jsonError(w, msg, code)` for errors
- **Frontend:** vanilla JavaScript, no frameworks. Event delegation via `data-action` attributes.

## Adding a Scan Profile

Edit `internal/nmap/validate.go` — add to the `defaultProfiles` slice:

```go
{
    Name:        "my-custom-profile",
    Description: "Scan with custom settings",
    Command:     "-sV -p 80,443,8080",
    Category:    "web",
    SortOrder:   50,
    IsBuiltin:   true,
},
```

## Web Frontend

- **CSS:** Single `app.css` with CSS custom properties for theming. Dark theme is default, light theme via `[data-theme="light"]` overrides.
- **SVG Icons:** Single sprite sheet at `web/icons/sprite.svg`. Add icons as `<symbol>` elements and reference with `<use href="#icon-name"/>`.
- **Event handling:** Global event delegation in `app.js` catches `data-action` clicks and calls `window[actionName]()`.
- **Pages are server-rendered HTML** with Go's `html/template` for escaping.

## Testing

```bash
# Run all tests
go test ./...

# With coverage
go test -cover ./...

# Verbose
go test -v ./...
```

## Release Workflow

The `.github/workflows/release.yml` automatically builds for Linux, Windows, and macOS when a tag is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers GitHub Actions to build binaries and create a release page.
