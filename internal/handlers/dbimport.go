package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	_ "modernc.org/sqlite"
)

// getColumnNames returns the list of column names for a table.
func getColumnNames(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("SELECT name FROM pragma_table_info('%s')", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		cols = append(cols, name)
	}
	return cols, nil
}

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
			jsonResponse(w, 500, map[string]string{"error": "internal server error"})
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
		serverError(w, err)
		return
	}

	n, err := io.Copy(srcFile, file)
	if err != nil {
		srcFile.Close()
		os.Remove(tmpPath)
		log.Printf("[DBImport] copy: %v", err)
		serverError(w, err)
		return
	}
	log.Printf("[DBImport] copied %d bytes", n)

	if err := srcFile.Close(); err != nil {
		os.Remove(tmpPath)
		log.Printf("[DBImport] close: %v", err)
		serverError(w, err)
		return
	}
	defer os.Remove(tmpPath)

	connStr := tmpPath + "?mode=ro&_foreign_keys=OFF"
	log.Printf("[DBImport] opening: %s", connStr)

	srcDB, err := sql.Open("sqlite", connStr)
	if err != nil {
		log.Printf("[DBImport] open: %v", err)
		serverError(w, err)
		return
	}
	defer srcDB.Close()

	if err := srcDB.Ping(); err != nil {
		log.Printf("[DBImport] ping: %v", err)
		jsonResponse(w, 400, map[string]string{"error": "not a valid SQLite database"})
		return
	}

	preview := map[string]int{}
	tables := []string{"projects", "scans", "hosts", "ports", "consolidated_hosts", "consolidated_ports", "port_scripts", "host_scripts", "consolidated_edits", "consolidated_notes", "scan_schedules"}
	hasKnownTable := false
	for _, t := range tables {
		var count int
		if err := srcDB.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", t)).Scan(&count); err == nil {
			preview[t] = count
			if count > 0 {
				hasKnownTable = true
			}
		}
	}

	if !hasKnownTable {
		log.Printf("[DBImport] not a nexusmap database")
		jsonResponse(w, 400, map[string]string{"error": "not a NexusMap database"})
		return
	}

	log.Printf("[DBImport] preview done: %+v", preview)
	jsonResponse(w, 200, preview)
}

func (s *Server) handleDBImportExecute(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[DBImport] panic in execute: %v", rec)
			jsonResponse(w, 500, map[string]string{"error": "internal server error"})
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
		serverError(w, err)
		return
	}

	n, err := io.Copy(dstFile, file)
	if err != nil {
		dstFile.Close()
		os.Remove(tmpPath)
		log.Printf("[DBImport] copy: %v", err)
		serverError(w, err)
		return
	}
	log.Printf("[DBImport] copied %d bytes", n)

	if err := dstFile.Close(); err != nil {
		os.Remove(tmpPath)
		serverError(w, err)
		return
	}
	defer os.Remove(tmpPath)

	srcDB, err := sql.Open("sqlite", tmpPath+"?mode=ro&_foreign_keys=OFF")
	if err != nil {
		log.Printf("[DBImport] open: %v", err)
		serverError(w, err)
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
		serverError(w, err)
		return
	}
	defer tx.Rollback()

	imported := 0
	tables := []string{
		"projects", "scans", "hosts", "ports",
		"consolidated_hosts", "consolidated_ports",
		"port_scripts", "host_scripts", "consolidated_edits",
		"consolidated_notes", "scan_schedules",
	}

	// Verify this is a nexusmap database
	hasKnown := false
	for _, table := range tables {
		var n int
		if err := srcDB.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&n); err == nil && n > 0 {
			hasKnown = true
			break
		}
	}
	if !hasKnown {
		log.Printf("[DBImport] not a nexusmap database")
		jsonResponse(w, 400, map[string]string{"error": "not a NexusMap database"})
		return
	}

	for _, table := range tables {
		// Get destination columns
		dstCols, err := getColumnNames(s.DB.DB, table)
		if err != nil {
			log.Printf("[DBImport] dst columns %s: %v", table, err)
			continue
		}
		dstSet := make(map[string]bool, len(dstCols))
		for _, c := range dstCols {
			dstSet[c] = true
		}

		// Get source columns
		srcCols, err := getColumnNames(srcDB, table)
		if err != nil {
			log.Printf("[DBImport] src columns %s: %v", table, err)
			continue
		}

		// Intersection — only columns that exist in both
		var common []string
		for _, c := range srcCols {
			if dstSet[c] {
				common = append(common, c)
			}
		}
		if len(common) == 0 {
			log.Printf("[DBImport] no common columns for %s, skipping", table)
			continue
		}
		sort.Strings(common)

		// Build column list and placeholders
		colList := ""
		placeholders := ""
		for i, c := range common {
			if i > 0 {
				colList += ", "
				placeholders += ", "
			}
			colList += c
			placeholders += "?"
		}

		rows, err := srcDB.Query(fmt.Sprintf("SELECT %s FROM %s", colList, table))
		if err != nil {
			log.Printf("[DBImport] query %s: %v", table, err)
			continue
		}

		for rows.Next() {
			values := make([]interface{}, len(common))
			valuePtrs := make([]interface{}, len(common))
			for i := range values {
				valuePtrs[i] = &values[i]
			}

			if err := rows.Scan(valuePtrs...); err != nil {
				continue
			}

			query := fmt.Sprintf("INSERT OR IGNORE INTO %s (%s) VALUES (%s)", table, colList, placeholders)
			if _, err := tx.Exec(query, values...); err == nil {
				imported++
			}
		}
		rows.Close()
	}

	if err := tx.Commit(); err != nil {
		serverError(w, err)
		return
	}

	log.Printf("[DBImport] execute done: %d rows imported", imported)
	jsonResponse(w, 200, map[string]interface{}{
		"status":   "import_complete",
		"imported": imported,
	})
}
