package main

import (
	"compress/gzip"
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/mahdialemi/NexusMap/internal/auth"
	"github.com/mahdialemi/NexusMap/internal/banner"
	"github.com/mahdialemi/NexusMap/internal/db"
	"github.com/mahdialemi/NexusMap/internal/handlers"
	"github.com/mahdialemi/NexusMap/internal/nmap"
	"github.com/mahdialemi/NexusMap/internal/version"

	_ "modernc.org/sqlite"
)

//go:embed web
var webFS embed.FS

type gzipResponseWriter struct {
	http.ResponseWriter
	Writer io.Writer
}

func (g *gzipResponseWriter) Write(b []byte) (int, error) {
	return g.Writer.Write(b)
}

func (g *gzipResponseWriter) Flush() {
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func handleCheckUpdate(w http.ResponseWriter, r *http.Request) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.github.com/repos/mahdialemi/NexusMap/releases/latest")
	latest := ""
	if err == nil {
		defer resp.Body.Close()
		var rel struct {
			TagName string `json:"tag_name"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&rel); err == nil {
			latest = rel.TagName
		}
	}
	updateAvailable := latest != "" && latest != version.Version
	json.NewEncoder(w).Encode(map[string]interface{}{
		"current":          version.Version,
		"latest":           latest,
		"update_available": updateAvailable,
	})
}

func main() {
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)

	port := flag.Int("port", 9090, "HTTP port")
	bind := flag.String("bind", "127.0.0.1", "Bind address (0.0.0.0, 127.0.0.1, etc.)")
	dbPath := flag.String("db", filepath.Join(exeDir, "scanner.db"), "Database path")
	adminPassword := flag.String("admin-password", "", "Set admin password (generated randomly if empty)")
	nmapPath := flag.String("nmap-path", "", "Path to nmap binary (default: look up in PATH)")
	maxBody := flag.Int64("max-body", 33554432, "Maximum request body size in bytes (default: 32 MiB)")
	showVersion := flag.Bool("version", false, "Print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println("NexusMap", version.Version)
		os.Exit(0)
	}

	fmt.Print(banner.Art)

	nmapBin := *nmapPath
	if nmapBin == "" {
		var err error
		nmapBin, err = exec.LookPath("nmap")
		if err != nil {
			log.Fatal("nmap not found in PATH.\nPlease install nmap from https://nmap.org/download and ensure it's in your PATH, or use -nmap-path flag")
		}
	}

	out, err := exec.Command(nmapBin, "-V").Output()
	if err == nil {
		log.Printf("nmap detected: %s", strings.SplitN(string(out), "\n", 2)[0])
	}

	appDB, err := db.New(*dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer appDB.CloseDB()

	if err := appDB.Init(); err != nil {
		log.Fatal(err)
	}
	if pwd, err := appDB.SeedAdmin(*adminPassword); err != nil {
		log.Printf("Seed admin warning: %v", err)
	} else if pwd != "" {
		displayPassword := pwd
		if *adminPassword != "" {
			displayPassword = strings.Repeat("*", len(pwd))
		}
		log.Printf("==========================================")
		log.Printf("  Admin user: admin")
		log.Printf("  Password: %s", displayPassword)
		log.Printf("  You MUST change it on first login.")
		log.Printf("==========================================")
	}
	if err := appDB.SeedProfiles(); err != nil {
		log.Printf("Seed profiles warning: %v", err)
	}

	authSvc := auth.New(appDB.DB)
	authSvc.StartCleanupRoutine()

	scansDir := filepath.Join(exeDir, "scans")
	os.MkdirAll(scansDir, 0755)
	nmapRunner := nmap.New(scansDir, nmapBin)

	webSubFS, _ := fs.Sub(webFS, "web")

	sseBroker := handlers.NewSSEBroker()
	srv := &handlers.Server{
		DB:         appDB,
		AuthSvc:    authSvc,
		NmapRunner: nmapRunner,
		WebFS:      webSubFS,
		SSE:        sseBroker,
	}

	csrf := auth.CSRFMiddleware(authSvc)

	mux := http.NewServeMux()

	mux.Handle("/static/", http.StripPrefix("/static/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		http.FileServer(http.FS(webSubFS)).ServeHTTP(w, r)
	})))

	mux.HandleFunc("/login", srv.HandlePage("login.html"))
	mux.HandleFunc("/change-password", auth.Middleware(authSvc, srv.HandlePage("change-password.html")))
	mux.HandleFunc("/", auth.Middleware(authSvc, srv.HandlePage("index.html")))
	mux.HandleFunc("/dashboard", auth.Middleware(authSvc, srv.HandlePage("dashboard.html")))
	mux.HandleFunc("/project/{id}", auth.Middleware(authSvc, srv.HandlePage("project.html")))
	mux.HandleFunc("/project/{pid}/scan/{sid}", auth.Middleware(authSvc, srv.HandlePage("results.html")))
	mux.HandleFunc("/admin", auth.Middleware(authSvc, auth.RequireAdmin(srv.HandlePage("users.html"))))

	mux.HandleFunc("/api/login", handlers.RateLimitMiddleware(srv.HandleLogin, handlers.AuthRateLimiter))
	mux.HandleFunc("/api/logout", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleLogout)))
	mux.HandleFunc("/api/me", auth.APIAuthMiddleware(authSvc, srv.HandleMe))
	mux.HandleFunc("/api/change-password", csrf(auth.APIAuthMiddleware(authSvc, handlers.RateLimitMiddleware(srv.HandleChangePassword, handlers.AuthRateLimiter))))
	mux.HandleFunc("/api/csrf-token", auth.APIAuthMiddleware(authSvc, srv.HandleCSRFToken))

	mux.HandleFunc("/api/projects", csrf(auth.APIAuthMiddleware(authSvc, handlers.RateLimitMiddleware(srv.HandleProjects, handlers.ApiRateLimiter))))
	mux.HandleFunc("/api/projects/{id}", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleProjectByID)))
	mux.HandleFunc("/api/projects/{id}/status", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleProjectStatus)))
	mux.HandleFunc("/api/projects/{id}/pin", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleToggleProjectPin)))
	mux.HandleFunc("/api/projects/{id}/duplicate", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleDuplicateProject)))
	mux.HandleFunc("/api/projects/{id}/scans", auth.APIAuthMiddleware(authSvc, srv.HandleProjectScans))
	mux.HandleFunc("/api/projects/bulk/status", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleBulkProjectStatus)))
	mux.HandleFunc("/api/projects/bulk/delete", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleBulkProjectDelete)))
	mux.HandleFunc("/api/projects/{id}/schedules", auth.APIAuthMiddleware(authSvc, srv.HandleGetSchedules))
	mux.HandleFunc("/api/projects/{id}/schedules/create", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleCreateSchedule)))
	mux.HandleFunc("/api/projects/{id}/schedules/{schedule_id}/delete", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleDeleteSchedule)))
	mux.HandleFunc("/api/tags", auth.APIAuthMiddleware(authSvc, srv.HandleTagCloud))

	mux.HandleFunc("/api/scans/create", csrf(auth.APIAuthMiddleware(authSvc, handlers.RateLimitMiddleware(srv.HandleCreateScan, handlers.ApiRateLimiter))))
	mux.HandleFunc("/api/scans/{id}/run", csrf(auth.APIAuthMiddleware(authSvc, handlers.RateLimitMiddleware(srv.HandleRunScan, handlers.ApiRateLimiter))))
	mux.HandleFunc("/api/scans/{id}/stop", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleStopScan)))
	mux.HandleFunc("/api/scans/{id}/confirm", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleConfirmScan)))
	mux.HandleFunc("/api/projects/{id}/scans/confirm-all", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleConfirmAllScans)))
	mux.HandleFunc("/api/scans/{id}/reject", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleRejectScan)))

	mux.HandleFunc("/api/scans/backfill", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleBackfillScripts)))
	mux.HandleFunc("/api/scans/{id}/backfill", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleBackfillSingleScan)))
	mux.HandleFunc("/api/scans/compare", auth.APIAuthMiddleware(authSvc, srv.HandleScanCompare))
	mux.HandleFunc("/api/scans/{id}/log", auth.APIAuthMiddleware(authSvc, srv.HandleScanLog))
	mux.HandleFunc("/api/scans/{id}/status", auth.APIAuthMiddleware(authSvc, srv.HandleScanStatus))
	mux.HandleFunc("/api/scans/{id}/results", auth.APIAuthMiddleware(authSvc, srv.HandleScanResults))
	mux.HandleFunc("/api/scans/{id}/download/xml", auth.APIAuthMiddleware(authSvc, srv.HandleDownloadXML))
	mux.HandleFunc("/api/scans/{id}/download/nmap", auth.APIAuthMiddleware(authSvc, srv.HandleDownloadNmap))
	mux.HandleFunc("/api/scans/{id}/download/gnmap", auth.APIAuthMiddleware(authSvc, srv.HandleDownloadGnmap))
	mux.HandleFunc("/api/scans/{id}", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleScanByID)))

	mux.HandleFunc("/api/projects/{id}/consolidated/hosts", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedHosts))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedPorts))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/update", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedPortUpdate)))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/history", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedPortHistory))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/revert", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedPortRevert)))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/edits/{editId}/revert", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleRevertConsolidatedEdit)))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/edits/{editId}/apply", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleApplyConsolidatedEdit)))
	mux.HandleFunc("/api/projects/{id}/consolidated/hosts/edits", auth.APIAuthMiddleware(authSvc, srv.HandleHostEdits))
	mux.HandleFunc("/api/projects/{id}/consolidated/hosts/edits/{editId}/revert", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleRevertHostEdit)))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/edits", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedEdits))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/bulk-delete", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedBulkDelete)))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/xlsx", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedExportXLSX))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/json", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedExportJSON))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/txt", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedExportTXT))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/sizes", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedExportSizes))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/scripts/xlsx", auth.APIAuthMiddleware(authSvc, srv.HandleScriptsExportXLSX))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/scripts/txt", auth.APIAuthMiddleware(authSvc, srv.HandleScriptsExportTXT))
	mux.HandleFunc("/api/projects/{id}/consolidated/export/scripts/sizes", auth.APIAuthMiddleware(authSvc, srv.HandleScriptsExportSizes))
	mux.HandleFunc("/api/projects/{id}/consolidated/scripts", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedScripts))
	mux.HandleFunc("/api/projects/{id}/consolidated/notes/all", auth.APIAuthMiddleware(authSvc, srv.HandleGetProjectNotes))
	mux.HandleFunc("/api/projects/{id}/consolidated/notes", auth.APIAuthMiddleware(authSvc, srv.HandleGetPortNote))
	mux.HandleFunc("/api/projects/{id}/consolidated/notes/set", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleSetPortNote)))
	mux.HandleFunc("/api/projects/{id}/consolidated/notes/delete", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleDeletePortNote)))
	mux.HandleFunc("/api/projects/{id}/consolidated/filter-options", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedFilterOptions))
	mux.HandleFunc("/api/projects/{id}/consolidated/field-values", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedFieldValues))
	mux.HandleFunc("/api/projects/{id}/consolidated/ports/query", auth.APIAuthMiddleware(authSvc, srv.HandleConsolidatedPortsQuery))

	mux.HandleFunc("/api/scans/{id}/scripts", auth.APIAuthMiddleware(authSvc, srv.HandleScanScripts))

	// Live hosts routes (specific first, then general)
	mux.HandleFunc("/api/projects/{id}/live/ping", auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostPing))
	mux.HandleFunc("/api/projects/{id}/live/status", auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostStatus))
	mux.HandleFunc("/api/projects/{id}/live/delete", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostDelete)))
	mux.HandleFunc("/api/projects/{id}/live/bulk-delete", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostBulkDelete)))
	mux.HandleFunc("/api/projects/{id}/live/bulk-status", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostBulkStatus)))
	mux.HandleFunc("/api/projects/{id}/live/detail", auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostDetail))
	mux.HandleFunc("/api/projects/{id}/live/update-field", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostUpdateField)))
	mux.HandleFunc("/api/live/export/{id}", auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostExport))
	mux.HandleFunc("/api/live/export/{id}/sizes", auth.APIAuthMiddleware(authSvc, srv.HandleLiveHostExportSizes))
	mux.HandleFunc("/api/projects/{id}/live", auth.APIAuthMiddleware(authSvc, srv.HandleLiveHosts))
	mux.HandleFunc("/api/projects/{id}/topology", auth.APIAuthMiddleware(authSvc, srv.HandleTopology))

	mux.HandleFunc("/api/results", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleResults)))
	mux.HandleFunc("/api/results/{id}", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleResultByID)))
	mux.HandleFunc("/api/results/{id}/revert", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleRevertResult)))
	mux.HandleFunc("/api/results/bulk", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleBulkUpdate)))

	mux.HandleFunc("/api/import/{project_id}/preview", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleImportPreview)))
	mux.HandleFunc("/api/import/{project_id}", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleImport)))
	mux.HandleFunc("/api/import/{project_id}/history", auth.APIAuthMiddleware(authSvc, srv.HandleImportHistory))
	mux.HandleFunc("/api/scan/profiles", csrf(auth.APIAuthMiddleware(authSvc, srv.HandleScanProfiles)))
	mux.HandleFunc("/api/scan/nse", auth.APIAuthMiddleware(authSvc, srv.HandleNSEFinder))
	mux.HandleFunc("/api/export/{scan_id}/{format}", auth.APIAuthMiddleware(authSvc, srv.HandleUnifiedExport))
	mux.HandleFunc("/api/export/{scan_id}/availability", auth.APIAuthMiddleware(authSvc, srv.HandleExportAvailability))

	mux.HandleFunc("/api/users", csrf(auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(handlers.RateLimitMiddleware(srv.HandleUsers, handlers.ApiRateLimiter)))))
	mux.HandleFunc("/api/users/{id}", csrf(auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(handlers.RateLimitMiddleware(srv.HandleUserByID, handlers.ApiRateLimiter)))))

	mux.HandleFunc("/api/db/stats", auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleDBManagement)))
	mux.HandleFunc("/api/db/backup", auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleDBManagement)))
	mux.HandleFunc("/api/db/activity", auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleDBManagement)))
	mux.HandleFunc("/api/db/factory-reset", csrf(auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleFactoryReset))))
	mux.HandleFunc("/api/db/import/preview", csrf(auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleDBImport))))
	mux.HandleFunc("/api/db/import", csrf(auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleDBImport))))
	mux.HandleFunc("/api/db/health", auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleHealth)))
	mux.HandleFunc("/api/db", csrf(auth.APIAuthMiddleware(authSvc, auth.RequireAdmin(srv.HandleDBManagement))))
	mux.HandleFunc("/api/projects/{id}/stats", auth.APIAuthMiddleware(authSvc, srv.HandleProjectStats))
	mux.HandleFunc("/api/stats/global", auth.APIAuthMiddleware(authSvc, srv.HandleGlobalStats))
	mux.HandleFunc("/api/events", auth.APIAuthMiddleware(authSvc, srv.SSE.HandleSSE))
	mux.HandleFunc("/api/version", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"version": version.Version})
	})
	mux.HandleFunc("/api/check-update", handleCheckUpdate)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'")
		if r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		// Body size limit
		r.Body = http.MaxBytesReader(w, r.Body, *maxBody)

		// Gzip compression for API responses
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") && !strings.Contains(r.URL.Path, "/events") {
			w.Header().Set("Content-Encoding", "gzip")
			gz := gzip.NewWriter(w)
			defer gz.Close()
			gzw := &gzipResponseWriter{ResponseWriter: w, Writer: gz}
			mux.ServeHTTP(gzw, r)
			return
		}
		mux.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	log.Printf("Database: %s", *dbPath)
	log.Printf("NexusMap %s starting on http://%s", version.Version, addr)

	go srv.BackfillAllScripts()
	go srv.StartScheduler()

	httpSrv := &http.Server{Addr: addr, Handler: handler, ReadTimeout: 30 * time.Second, WriteTimeout: 300 * time.Second, IdleTimeout: 120 * time.Second}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		sig := <-stop
		log.Printf("Received %s, shutting down gracefully...", sig)
		nmapRunner.StopAll()
		srv.SSE.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		httpSrv.Shutdown(ctx)
		srv.ScanWG.Wait()
		appDB.CloseDB()
		log.Printf("Shutdown complete")
		os.Exit(0)
	}()

	if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
