package db

import (
	"fmt"
	"os"
)

type DBStats struct {
	Tables       []TableInfo `json:"tables"`
	TotalRows    int         `json:"total_rows"`
	TotalUsers   int         `json:"total_users"`
	TotalProjects int        `json:"total_projects"`
	TotalScans   int         `json:"total_scans"`
	DBSize       int64       `json:"db_size_bytes"`
	DBSizePretty string      `json:"db_size_pretty"`
	VacuumSize   int64       `json:"vacuum_size"`
}

type TableInfo struct {
	Name  string `json:"name"`
	Rows  int    `json:"rows"`
	Index string `json:"index_count"`
}

func (d *DB) GetDBStats() (*DBStats, error) {
	stats := &DBStats{}

	rows, err := d.Query(`
		SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, t := range tables {
		var count int
		if err := d.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", t)).Scan(&count); err != nil {
			continue
		}

		var idxCount int
		if err := d.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='%s'", t)).Scan(&idxCount); err != nil {
			idxCount = 0
		}

		stats.Tables = append(stats.Tables, TableInfo{
			Name:  t,
			Rows:  count,
			Index: fmt.Sprintf("%d", idxCount),
		})
		stats.TotalRows += count
	}

	info, err := os.Stat(d.DBPath)
	if err == nil {
		stats.DBSize = info.Size()
		stats.DBSizePretty = formatSize(info.Size())
	}

	var vacuumSize int64
	if err := d.QueryRow("PRAGMA page_count").Scan(&vacuumSize); err == nil {
		var pageSize int64
		if err := d.QueryRow("PRAGMA page_size").Scan(&pageSize); err == nil {
			stats.VacuumSize = vacuumSize * pageSize
		}
	}

	return stats, nil
}

func (d *DB) ResetDatabase() error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	tables := []string{
		"host_scripts", "port_scripts", "consolidated_edits", "live_hosts",
		"consolidated_ports", "consolidated_hosts", "ports", "hosts",
		"scans", "projects", "sessions", "login_attempts",
	}

	for _, t := range tables {
		if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %s", t)); err != nil {
			return fmt.Errorf("delete %s: %w", t, err)
		}
	}

	if _, err := tx.Exec("INSERT INTO users (username, password_hash, role, created_at) VALUES ('admin', '$2a$10$5T5H3H3H3H3H3H3H3H3H3O5H3H3H3H3H3H3H3H3H3H3H3H3H3H3H3', 'admin', datetime('now'))"); err != nil {
		// ignore error
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	if _, err := d.Exec("VACUUM"); err != nil {
		// ignore error
	}

	return nil
}

func (d *DB) FactoryReset() (string, error) {
	tx, err := d.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	tables := []string{
		"host_scripts", "port_scripts", "consolidated_edits", "live_hosts",
		"consolidated_ports", "consolidated_hosts", "ports", "hosts",
		"scans", "projects", "sessions", "login_attempts", "users", "profiles",
	}

	for _, t := range tables {
		if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %s", t)); err != nil {
			return "", fmt.Errorf("delete %s: %w", t, err)
		}
	}

	rawPassword := generateRandomPassword()
	hash, err := hashPassword(rawPassword)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(
		"INSERT INTO users (username, password_hash, role, must_change_password, created_at) VALUES ('admin', ?, 'admin', 1, datetime('now'))",
		hash,
	); err != nil {
		return "", err
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	if _, err := d.Exec("VACUUM"); err != nil {
		// ignore
	}

	return rawPassword, nil
}

func (d *DB) VacuumDatabase() (int64, int64, error) {
	info, err := os.Stat(d.DBPath)
	if err != nil {
		return 0, 0, err
	}
	before := info.Size()

	if _, err := d.Exec("VACUUM"); err != nil {
		return before, 0, err
	}

	info, err = os.Stat(d.DBPath)
	if err != nil {
		return before, 0, err
	}
	after := info.Size()

	return before, after, nil
}

func formatSize(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

type ActivityEntry struct {
	ID        int    `json:"id"`
	Action    string `json:"action"`
	Details   string `json:"details"`
	Username  string `json:"username"`
	CreatedAt string `json:"created_at"`
}

func (d *DB) LogActivity(action, details, username string) error {
	_, err := d.Exec("INSERT INTO activity_log (action, details, username) VALUES (?, ?, ?)", action, details, username)
	return err
}

func (d *DB) PruneOldScans(days int) (int, error) {
	rows, err := d.Query("SELECT id, output_dir FROM scans WHERE completed_at IS NOT NULL AND completed_at < datetime('now', ?)", fmt.Sprintf("-%d days", days))
	if err != nil {
		return 0, err
	}
	var ids []int
	var dirs []string
	for rows.Next() {
		var id int
		var dir string
		if err := rows.Scan(&id, &dir); err != nil {
			continue
		}
		ids = append(ids, id)
		if dir != "" {
			dirs = append(dirs, dir)
		}
	}
	rows.Close()

	if len(ids) == 0 {
		return 0, nil
	}

	for _, dir := range dirs {
		os.RemoveAll(dir)
	}

	for _, id := range ids {
		d.Exec("DELETE FROM host_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", id)
		d.Exec("DELETE FROM port_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", id)
		d.Exec("DELETE FROM ports WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", id)
		d.Exec("DELETE FROM hosts WHERE scan_id = ?", id)
		d.Exec("DELETE FROM scans WHERE id = ?", id)
	}

	return len(ids), nil
}

func (d *DB) GetActivityLog(limit, offset int) ([]ActivityEntry, int, error) {
	var total int
	d.QueryRow("SELECT COUNT(*) FROM activity_log").Scan(&total)
	rows, err := d.Query("SELECT id, action, details, username, created_at FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?", limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var entries []ActivityEntry
	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(&e.ID, &e.Action, &e.Details, &e.Username, &e.CreatedAt); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return entries, total, nil
}
