package db

import (
	"database/sql"
	"strings"
	"time"
)

const projectCols = `p.id, p.name, p.description,
	COALESCE(p.status, 'active'), COALESCE(p.priority, 'medium'),
	COALESCE(p.tags, ''), COALESCE(p.client, ''), p.owner_id,
	COALESCE(u.username, ''), p.due_date, p.created_at, p.updated_at`

const projectCountCols = `,
	(SELECT COUNT(*) FROM scans WHERE project_id = p.id),
	(SELECT MAX(started_at) FROM scans WHERE project_id = p.id)`

func scanProject(scanner interface {
	Scan(dest ...interface{}) error
}, withCounts bool) (Project, error) {
	var p Project
	var ownerID sql.NullInt64
	var dueDate sql.NullString
	var lastScan sql.NullString
	var updatedAt sql.NullString

	args := []interface{}{
		&p.ID, &p.Name, &p.Description, &p.Status, &p.Priority,
		&p.Tags, &p.Client, &ownerID, &p.OwnerName,
		&dueDate, &p.CreatedAt, &updatedAt,
	}
	if withCounts {
		args = append(args, &p.ScanCount, &lastScan)
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
	result, err := d.Exec(`INSERT INTO projects (name, description, status, priority, tags, client, owner_id, due_date, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		name, description, status, priority, tags, client, normalizeOwnerID(ownerID), dueDate, now)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
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

func (d *DB) DeleteProject(id int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Delete hosts belonging to this project's scans (cascades to ports)
	if _, err := tx.Exec("DELETE FROM hosts WHERE scan_id IN (SELECT id FROM scans WHERE project_id = ?)", id); err != nil {
		return err
	}

	if _, err := tx.Exec("DELETE FROM scans WHERE project_id = ?", id); err != nil {
		return err
	}

	// Clean orphaned consolidated data (hosts are now gone)
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

	return tx.Commit()
}
