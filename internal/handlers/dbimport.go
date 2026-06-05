package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

func (s *Server) HandleDBImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	action := r.URL.Query().Get("action")
	if action == "preview" {
		s.handleDBImportPreview(w, r)
		return
	}
	s.handleDBImportExecute(w, r)
}

func (s *Server) handleDBImportPreview(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[DBImport] panic in preview: %v", rec)
			jsonResponse(w, 500, map[string]string{"error": fmt.Sprintf("server error: %v", rec)})
		}
	}()

	log.Printf("[DBImport] preview started")

	r.ParseMultipartForm(50 << 20)
	file, header, err := r.FormFile("file")
	if err != nil {
		log.Printf("[DBImport] no file: %v", err)
		jsonResponse(w, 400, map[string]string{"error": "no file uploaded"})
		return
	}
	defer file.Close()

	log.Printf("[DBImport] file: %s, size: %d", header.Filename, header.Size)

	tmpDir := os.TempDir()
	tmpPath := filepath.Join(tmpDir, fmt.Sprintf("nexusmap-import-%d.db", time.Now().UnixNano()))

	srcFile, err := os.Create(tmpPath)
	if err != nil {
		log.Printf("[DBImport] create temp %s: %v", tmpPath, err)
		jsonResponse(w, 500, map[string]string{"error": "create temp: " + err.Error()})
		return
	}

	n, err := io.Copy(srcFile, file)
	if err != nil {
		srcFile.Close()
		os.Remove(tmpPath)
		log.Printf("[DBImport] copy: %v", err)
		jsonResponse(w, 500, map[string]string{"error": "save file: " + err.Error()})
		return
	}
	log.Printf("[DBImport] copied %d bytes", n)

	if err := srcFile.Close(); err != nil {
		os.Remove(tmpPath)
		log.Printf("[DBImport] close: %v", err)
		jsonResponse(w, 500, map[string]string{"error": "close: " + err.Error()})
		return
	}
	defer os.Remove(tmpPath)

	connStr := tmpPath + "?mode=ro&_foreign_keys=OFF"
	log.Printf("[DBImport] opening: %s", connStr)

	srcDB, err := sql.Open("sqlite", connStr)
	if err != nil {
		log.Printf("[DBImport] open: %v", err)
		jsonResponse(w, 500, map[string]string{"error": "open db: " + err.Error()})
		return
	}
	defer srcDB.Close()

	if err := srcDB.Ping(); err != nil {
		log.Printf("[DBImport] ping: %v", err)
		jsonResponse(w, 400, map[string]string{"error": "not a valid SQLite database"})
		return
	}

	preview := map[string]int{}
	tables := []string{"projects", "scans", "hosts", "ports", "consolidated_hosts", "consolidated_ports", "port_scripts", "host_scripts", "consolidated_edits"}
	for _, t := range tables {
		var count int
		if err := srcDB.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", t)).Scan(&count); err == nil {
			preview[t] = count
		}
	}

	log.Printf("[DBImport] preview done: %+v", preview)
	jsonResponse(w, 200, preview)
}

func (s *Server) handleDBImportExecute(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[DBImport] panic in execute: %v", rec)
			jsonResponse(w, 500, map[string]string{"error": fmt.Sprintf("server error: %v", rec)})
		}
	}()

	log.Printf("[DBImport] execute started")

	r.ParseMultipartForm(50 << 20)
	file, header, err := r.FormFile("file")
	if err != nil {
		log.Printf("[DBImport] no file: %v", err)
		jsonResponse(w, 400, map[string]string{"error": "no file uploaded"})
		return
	}
	defer file.Close()

	log.Printf("[DBImport] file: %s, size: %d", header.Filename, header.Size)

	tmpDir := os.TempDir()
	tmpPath := filepath.Join(tmpDir, fmt.Sprintf("nexusmap-import-%d.db", time.Now().UnixNano()))

	dstFile, err := os.Create(tmpPath)
	if err != nil {
		log.Printf("[DBImport] create temp: %v", err)
		jsonResponse(w, 500, map[string]string{"error": "create temp: " + err.Error()})
		return
	}

	n, err := io.Copy(dstFile, file)
	if err != nil {
		dstFile.Close()
		os.Remove(tmpPath)
		log.Printf("[DBImport] copy: %v", err)
		jsonResponse(w, 500, map[string]string{"error": "save file: " + err.Error()})
		return
	}
	log.Printf("[DBImport] copied %d bytes", n)

	if err := dstFile.Close(); err != nil {
		os.Remove(tmpPath)
		jsonResponse(w, 500, map[string]string{"error": "close: " + err.Error()})
		return
	}
	defer os.Remove(tmpPath)

	srcDB, err := sql.Open("sqlite", tmpPath+"?mode=ro&_foreign_keys=OFF")
	if err != nil {
		log.Printf("[DBImport] open: %v", err)
		jsonResponse(w, 500, map[string]string{"error": "open db: " + err.Error()})
		return
	}
	defer srcDB.Close()

	if err := srcDB.Ping(); err != nil {
		log.Printf("[DBImport] ping: %v", err)
		jsonResponse(w, 400, map[string]string{"error": "not a valid SQLite database"})
		return
	}

	tx, err := s.DB.Begin()
	if err != nil {
		jsonResponse(w, 500, map[string]string{"error": "begin tx: " + err.Error()})
		return
	}
	defer tx.Rollback()

	imported := 0
	tables := []string{
		"projects", "scans", "hosts", "ports",
		"consolidated_hosts", "consolidated_ports",
		"port_scripts", "host_scripts", "consolidated_edits",
	}

	for _, table := range tables {
		rows, err := srcDB.Query(fmt.Sprintf("SELECT * FROM %s", table))
		if err != nil {
			log.Printf("[DBImport] query %s: %v", table, err)
			continue
		}

		columns, err := rows.Columns()
		if err != nil {
			rows.Close()
			continue
		}
		placeholders := ""
		for i := range columns {
			if i > 0 {
				placeholders += ","
			}
			placeholders += "?"
		}

		for rows.Next() {
			values := make([]interface{}, len(columns))
			valuePtrs := make([]interface{}, len(columns))
			for i := range values {
				valuePtrs[i] = &values[i]
			}

			if err := rows.Scan(valuePtrs...); err != nil {
				continue
			}

			query := fmt.Sprintf("INSERT OR IGNORE INTO %s VALUES (%s)", table, placeholders)
			if _, err := tx.Exec(query, values...); err == nil {
				imported++
			}
		}
		rows.Close()
	}

	if err := tx.Commit(); err != nil {
		jsonResponse(w, 500, map[string]string{"error": "commit: " + err.Error()})
		return
	}

	log.Printf("[DBImport] execute done: %d rows imported", imported)
	jsonResponse(w, 200, map[string]interface{}{
		"status":   "import_complete",
		"imported": imported,
	})
}
