package db

import (
	"database/sql"
	"strings"
	"time"
)

const projectCols = `p.id, p.name, p.description,
	COALESCE(p.status, 'active'), COALESCE(p.priority, 'medium'),
	COALESCE(p.tags, ''), COALESCE(p.client, ''), p.owner_id,
	COALESCE(u.username, ''), p.due_date, p.created_at, p.updated_at,
	COALESCE(p.is_pinned, 0)`

const projectCountCols = `,
	(SELECT COUNT(*) FROM scans WHERE project_id = p.id),
	(SELECT COUNT(*) FROM scans WHERE project_id = p.id AND confirmed = 1),
	(SELECT MAX(started_at) FROM scans WHERE project_id = p.id),
	COALESCE((SELECT status FROM scans WHERE project_id = p.id ORDER BY started_at DESC LIMIT 1), '')`

func scanProject(scanner interface {
	Scan(dest ...interface{}) error
}, withCounts bool) (Project, error) {
	var p Project
	var ownerID sql.NullInt64
	var dueDate sql.NullString
	var lastScan sql.NullString
	var updatedAt sql.NullString
	var isPinned sql.NullInt64

	args := []interface{}{
		&p.ID, &p.Name, &p.Description, &p.Status, &p.Priority,
		&p.Tags, &p.Client, &ownerID, &p.OwnerName,
		&dueDate, &p.CreatedAt, &updatedAt, &isPinned,
	}
	if withCounts {
		args = append(args, &p.ScanCount, &p.ConfirmedCount, &lastScan, &p.LastScanStatus)
	}

	if err := scanner.Scan(args...); err != nil {
		return p, err
	}

	if ownerID.Valid {
		v := int(ownerID.Int64)
		p.OwnerID = &v
	}
	if dueDate.Valid {
		p.DueDate = &dueDate.String
	}
	if isPinned.Valid && isPinned.Int64 == 1 {
		p.IsPinned = true
	}
	if lastScan.Valid && lastScan.String != "" {
		if t, err := time.Parse(time.RFC3339, lastScan.String); err == nil {
			p.LastScanAt = &t
		} else if t, err := time.Parse("2006-01-02 15:04:05", lastScan.String); err == nil {
			p.LastScanAt = &t
		}
	}
	if updatedAt.Valid {
		if t, err := time.Parse(time.RFC3339, updatedAt.String); err == nil {
			p.UpdatedAt = t
		} else if t, err := time.Parse("2006-01-02 15:04:05", updatedAt.String); err == nil {
			p.UpdatedAt = t
		} else {
			p.UpdatedAt = p.CreatedAt
		}
	} else {
		p.UpdatedAt = p.CreatedAt
	}
	return p, nil
}

func (d *DB) GetProjects() ([]Project, error) {
	rows, err := d.Query(`SELECT ` + projectCols + projectCountCols + `
		FROM projects p
		LEFT JOIN users u ON p.owner_id = u.id
		ORDER BY p.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		p, err := scanProject(rows, true)
		if err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, nil
}

type ProjectFilter struct {
	Status   string
	Priority string
	OwnerID  int
	Search   string
}

func (d *DB) GetProjectsFiltered(f ProjectFilter) ([]Project, error) {
	clauses := []string{}
	args := []interface{}{}

	if f.Status != "" {
		clauses = append(clauses, "p.status = ?")
		args = append(args, f.Status)
	}
	if f.Priority != "" {
		clauses = append(clauses, "p.priority = ?")
		args = append(args, f.Priority)
	}
	if f.OwnerID > 0 {
		clauses = append(clauses, "p.owner_id = ?")
		args = append(args, f.OwnerID)
	}
	if f.Search != "" {
		terms := strings.Fields(f.Search)
		var searchClauses []string
		for _, term := range terms {
			searchClauses = append(searchClauses, "(p.name LIKE ? OR p.tags LIKE ?)")
			args = append(args, "%"+term+"%", "%"+term+"%")
		}
		clauses = append(clauses, "("+strings.Join(searchClauses, " OR ")+")")
	}

	where := ""
	if len(clauses) > 0 {
		where = " WHERE " + strings.Join(clauses, " AND ")
	}

	rows, err := d.Query(`SELECT `+projectCols+projectCountCols+`
		FROM projects p
		LEFT JOIN users u ON p.owner_id = u.id`+where+`
		ORDER BY p.created_at DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		p, err := scanProject(rows, true)
		if err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return projects, nil
}

func (d *DB) GetProject(id int) (*Project, error) {
	p, err := scanProject(d.QueryRow(`SELECT `+projectCols+projectCountCols+`
		FROM projects p
		LEFT JOIN users u ON p.owner_id = u.id
		WHERE p.id = ?`, id), true)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func normalizeOwnerID(ownerID *int) interface{} {
	if ownerID == nil || *ownerID == 0 {
		return nil
	}
	return *ownerID
}

func (d *DB) CreateProject(name, description, status, priority, tags, client string, ownerID *int, dueDate *string) (int64, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if status == "" {
		status = "active"
	}
	if priority == "" {
		priority = "medium"
	}

	// Find the lowest unused project ID
	var nextID int64
	err := d.QueryRow(`
		SELECT COALESCE(MIN(t.id + 1), 1) FROM (
			SELECT 0 AS id
			UNION ALL
			SELECT id FROM projects
		) t WHERE NOT EXISTS (SELECT 1 FROM projects WHERE id = t.id + 1)
	`).Scan(&nextID)
	if err != nil {
		return 0, err
	}

	_, err = d.Exec(`INSERT INTO projects (id, name, description, status, priority, tags, client, owner_id, due_date, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		nextID, name, description, status, priority, tags, client, normalizeOwnerID(ownerID), dueDate, now)
	if err != nil {
		// Race condition — fall back to auto-increment
		result, err2 := d.Exec(`INSERT INTO projects (name, description, status, priority, tags, client, owner_id, due_date, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			name, description, status, priority, tags, client, normalizeOwnerID(ownerID), dueDate, now)
		if err2 != nil {
			return 0, err2
		}
		return result.LastInsertId()
	}
	return nextID, nil
}

func (d *DB) UpdateProject(id int, name, description, status, priority, tags, client string, ownerID *int, dueDate *string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := d.Exec(`UPDATE projects
		SET name = ?, description = ?, status = ?, priority = ?, tags = ?, client = ?, owner_id = ?, due_date = ?, updated_at = ?
		WHERE id = ?`,
		name, description, status, priority, tags, client, normalizeOwnerID(ownerID), dueDate, now, id)
	return err
}

func (d *DB) UpdateProjectStatus(id int, status string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := d.Exec("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?", status, now, id)
	return err
}

func (d *DB) BulkUpdateProjectStatus(ids []int, status string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	stmt, err := tx.Prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?")
	if err != nil {
		return err
	}
	defer stmt.Close()
	for _, id := range ids {
		if _, err := stmt.Exec(status, now, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) BulkDeleteProjects(ids []int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range ids {
		if err := d.deleteProjectTx(tx, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) deleteProjectTx(tx *sql.Tx, id int) error {
	if _, err := tx.Exec("DELETE FROM hosts WHERE scan_id IN (SELECT id FROM scans WHERE project_id = ?)", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM scans WHERE project_id = ?", id); err != nil {
		return err
	}
	for _, q := range []string{
		"DELETE FROM consolidated_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_hosts.ip)",
		"DELETE FROM consolidated_ports WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_ports.ip)",
		"DELETE FROM live_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = live_hosts.ip)",
		"DELETE FROM consolidated_notes WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_notes.ip)",
		"DELETE FROM consolidated_edits WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_edits.ip)",
	} {
		if _, err := tx.Exec(q); err != nil {
			return err
		}
	}
	if _, err := tx.Exec("DELETE FROM projects WHERE id = ?", id); err != nil {
		return err
	}
	return nil
}

func (d *DB) DuplicateProject(id int, newName string) (int64, error) {
	orig, err := d.GetProject(id)
	if err != nil {
		return 0, err
	}
	return d.CreateProject(newName, orig.Description, orig.Status, orig.Priority, orig.Tags, orig.Client, orig.OwnerID, orig.DueDate)
}

func (d *DB) ToggleProjectPin(id int) (bool, error) {
	var current int
	err := d.QueryRow("SELECT COALESCE(is_pinned, 0) FROM projects WHERE id = ?", id).Scan(&current)
	if err != nil {
		return false, err
	}
	newVal := 0
	if current == 0 {
		newVal = 1
	}
	now := time.Now().UTC().Format(time.RFC3339)
	_, err = d.Exec("UPDATE projects SET is_pinned = ?, updated_at = ? WHERE id = ?", newVal, now, id)
	if err != nil {
		return false, err
	}
	return newVal == 1, nil
}

func (d *DB) DeleteProject(id int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := d.deleteProjectTx(tx, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *DB) GetProjectStats(projectID int) (*ProjectStatsResponse, error) {
	resp := &ProjectStatsResponse{
		ScanStatusBreakdown: make(map[string]int),
		PortStateBreakdown:  make(map[string]int),
	}

	p, err := d.GetProject(projectID)
	if err != nil {
		return nil, err
	}
	resp.Project = *p

	for _, st := range []string{"completed", "running", "pending", "error", "cancelled", "rejected"} {
		var cnt int
		d.QueryRow("SELECT COUNT(*) FROM scans WHERE project_id = ? AND status = ?", projectID, st).Scan(&cnt)
		resp.ScanStatusBreakdown[st] = cnt
	}

	for _, st := range []string{"open", "closed", "filtered"} {
		var cnt int
		d.QueryRow(`SELECT COUNT(*) FROM (
			SELECT h.ip, p.port, p.protocol
			FROM ports p
			INNER JOIN hosts h ON h.id = p.host_id
			INNER JOIN scans s ON s.id = h.scan_id
			WHERE s.project_id = ? AND s.confirmed = 1 AND p.state = ?
			GROUP BY h.ip, p.port, p.protocol
		)`, projectID, st).Scan(&cnt)
		resp.PortStateBreakdown[st] = cnt
	}

	rows, err := d.Query(`
		SELECT p.service, CAST(p.port AS INTEGER) as port, COUNT(DISTINCT h.ip || ':' || p.port || '/' || p.protocol) as cnt
		FROM ports p
		INNER JOIN hosts h ON h.id = p.host_id
		INNER JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND s.confirmed = 1 AND p.state = 'open' AND p.service != ''
		GROUP BY p.service, p.port ORDER BY cnt DESC LIMIT 5
	`, projectID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var sc ServiceCount
			if err := rows.Scan(&sc.Service, &sc.Port, &sc.Count); err == nil {
				resp.TopServices = append(resp.TopServices, sc)
			}
		}
		if err := rows.Err(); err != nil {
			return resp, err
		}
	}
	if resp.TopServices == nil {
		resp.TopServices = []ServiceCount{}
	}

	d.QueryRow(`SELECT COUNT(DISTINCT h.ip) FROM hosts h
		INNER JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND s.confirmed = 1`, projectID).Scan(&resp.HostCount)

	d.QueryRow(`SELECT COUNT(*) FROM (
		SELECT h.ip, p.port, p.protocol
		FROM ports p
		INNER JOIN hosts h ON h.id = p.host_id
		INNER JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND s.confirmed = 1 AND p.state = 'open'
		GROUP BY h.ip, p.port, p.protocol
	)`, projectID).Scan(&resp.OpenPortCount)

	d.QueryRow(`SELECT COUNT(*) FROM (
		SELECT h.ip, p.port, p.protocol
		FROM ports p
		INNER JOIN hosts h ON h.id = p.host_id
		INNER JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND s.confirmed = 1 AND p.state = 'open'
			AND p.port IN (21,22,23,25,53,110,135,139,143,443,445,993,995,1433,1521,3306,3389,5432,5900,6379,8080,8443,27017)
		GROUP BY h.ip, p.port, p.protocol
	)`, projectID).Scan(&resp.HighRiskPortCount)

	scans, err := d.GetScans(projectID)
	if err == nil {
		if len(scans) > 5 {
			scans = scans[:5]
		}
		resp.RecentScans = scans
	} else {
		resp.RecentScans = []Scan{}
	}

	rows2, err := d.Query(`
		SELECT DATE(started_at) as day, COUNT(*) as cnt
		FROM scans WHERE project_id = ? AND status = 'completed'
		AND started_at >= DATE('now', '-30 days')
		GROUP BY DATE(started_at) ORDER BY day
	`, projectID)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var dc DayCount
			if err := rows2.Scan(&dc.Date, &dc.Count); err == nil {
				resp.ScanActivity = append(resp.ScanActivity, dc)
			}
		}
		if err := rows2.Err(); err != nil {
			return resp, err
		}
	}
	if resp.ScanActivity == nil {
		resp.ScanActivity = []DayCount{}
	}

	return resp, nil
}
