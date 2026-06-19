package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func (s *Server) HandleDBManagement(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	uname := ""
	if user != nil {
		uname = user.Username
	}

	switch r.Method {
	case "GET":
		switch r.URL.Query().Get("action") {
		case "stats":
			stats, err := s.DB.GetDBStats()
			if err != nil {
				serverError(w, err)
				return
			}

			var userCount, projectCount, scanCount int
			s.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&userCount)
			s.DB.QueryRow("SELECT COUNT(*) FROM projects").Scan(&projectCount)
			s.DB.QueryRow("SELECT COUNT(*) FROM scans").Scan(&scanCount)

			stats.TotalUsers = userCount
			stats.TotalProjects = projectCount
			stats.TotalScans = scanCount

			jsonResponse(w, 200, stats)

		case "backup":
			s.doDBBackup(w, r)

		case "reset":
			jsonResponse(w, 200, map[string]string{"status": "ok"})

		case "activity":
			limit := 50
			offset := 0
			entries, total, err := s.DB.GetActivityLog(limit, offset)
			if err != nil {
				serverError(w, err)
				return
			}
			jsonResponse(w, 200, map[string]interface{}{"entries": entries, "total": total})

		default:
			jsonResponse(w, 400, map[string]string{"error": "invalid action"})
		}

	case "POST":
		var req struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}

		switch req.Action {
		case "reset":
			if user == nil || user.Role != "admin" {
				jsonResponse(w, 403, map[string]string{"error": "admin required"})
				return
			}
			if err := s.DB.ResetDatabase(); err != nil {
				serverError(w, err)
				return
			}
			s.LogAndNotify("reset", "Database reset by admin", uname)
			jsonResponse(w, 200, map[string]string{"status": "database_reset"})

		case "prune":
			s.handlePrune(w, r, uname)

		case "vacuum":
			if user == nil || user.Role != "admin" {
				jsonResponse(w, 403, map[string]string{"error": "admin required"})
				return
			}
			before, after, err := s.DB.VacuumDatabase()
			if err != nil {
				serverError(w, err)
				return
			}
			saved := before - after
			s.LogAndNotify("vacuum", fmt.Sprintf("DB optimized: %s → %s (saved %s)", formatSizeSimple(before), formatSizeSimple(after), formatSizeSimple(saved)), uname)
			jsonResponse(w, 200, map[string]interface{}{
				"status":    "vacuum_complete",
				"before":    before,
				"after":     after,
				"saved":     saved,
				"saved_pct": float64(saved) / float64(before) * 100,
			})

		case "factory_reset":
			if user == nil || user.Role != "admin" {
				jsonResponse(w, 403, map[string]string{"error": "admin required"})
				return
			}
			if _, err := s.DB.FactoryReset(); err != nil {
				serverError(w, err)
				return
			}
			s.LogAndNotify("factory_reset", "Factory reset performed", uname)
			jsonResponse(w, 200, map[string]string{"status": "factory_reset"})

		default:
			jsonResponse(w, 400, map[string]string{"error": "invalid action"})
		}
	}
}

func formatSizeSimple(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d B", b)
	}
	if b < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(b)/1024)
	}
	if b < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(b)/(1024*1024))
	}
	return fmt.Sprintf("%.1f GB", float64(b)/(1024*1024*1024))
}

func (s *Server) handlePrune(w http.ResponseWriter, r *http.Request, uname string) {
	var req struct {
		Days int `json:"days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Days < 1 {
		jsonResponse(w, 400, map[string]string{"error": "invalid days"})
		return
	}
	count, err := s.DB.PruneOldScans(req.Days)
	if err != nil {
		serverError(w, err)
		return
	}
	s.LogAndNotify("prune", fmt.Sprintf("Deleted %d scans older than %d days", count, req.Days), uname)
	jsonResponse(w, 200, map[string]interface{}{"status": "prune_complete", "deleted": count})
}

func (s *Server) doDBBackup(w http.ResponseWriter, r *http.Request) {
	dbPath := s.DB.DBPath
	if dbPath == "" {
		dbPath = "scanner.db"
	}

	backupName := fmt.Sprintf("nexusmap-backup-%s.db", time.Now().Format("2006-01-02-150405"))
	backupPath := filepath.Join(filepath.Dir(dbPath), backupName)

	src, err := os.Open(dbPath)
	if err != nil {
		serverError(w, err)
		return
	}
	defer src.Close()

	dst, err := os.Create(backupPath)
	if err != nil {
		serverError(w, err)
		return
	}

	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(backupPath)
		serverError(w, err)
		return
	}

	if err := dst.Close(); err != nil {
		os.Remove(backupPath)
		serverError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", backupName))
	http.ServeFile(w, r, backupPath)
	os.Remove(backupPath)
}

func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"status":  "ok",
		"version": "1.0",
		"uptime":  "N/A",
	}
	var version string
	s.DB.QueryRow("SELECT sqlite_version()").Scan(&version)
	info["sqlite_version"] = version
	jsonResponse(w, 200, info)
}

func (s *Server) HandleFactoryReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	if _, err := s.DB.FactoryReset(); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "factory_reset"})
}
