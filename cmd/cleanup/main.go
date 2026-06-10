package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := "scanner.db"
	if len(os.Args) > 1 {
		dbPath = os.Args[1]
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	checks := []string{
		"SELECT COUNT(*) FROM hosts",
		"SELECT COUNT(*) FROM consolidated_hosts",
		"SELECT COUNT(*) FROM consolidated_ports",
		"SELECT COUNT(*) FROM live_hosts",
		"SELECT COUNT(*) FROM projects",
		"SELECT COUNT(*) FROM scans",
		"SELECT COUNT(*) FROM consolidated_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_hosts.ip)",
		"SELECT COUNT(*) FROM consolidated_ports WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_ports.ip)",
		"SELECT COUNT(*) FROM live_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = live_hosts.ip)",
	}

	for _, q := range checks {
		var n int
		if err := db.QueryRow(q).Scan(&n); err != nil {
			fmt.Printf("%s -> Error: %v\n", q[:50], err)
		} else {
			short := q
			if len(short) > 50 {
				short = short[:50]
			}
			fmt.Printf("%s -> %d\n", short, n)
		}
	}

	fmt.Println("\n--- If orphaned data exists, run cleanup ---")
	// Delete all hosts/consolidated that don't belong to any project
	for _, q := range []string{
		"DELETE FROM consolidated_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_hosts.ip)",
		"DELETE FROM consolidated_ports WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_ports.ip)",
		"DELETE FROM live_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = live_hosts.ip)",
		"DELETE FROM consolidated_notes WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_notes.ip)",
		"DELETE FROM consolidated_edits WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_edits.ip)",
		// Clean hosts without any project
		"DELETE FROM hosts WHERE scan_id NOT IN (SELECT id FROM scans)",
	} {
		res, err := db.Exec(q)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
		} else {
			n, _ := res.RowsAffected()
			fmt.Printf("Deleted %d rows\n", n)
		}
	}
}
