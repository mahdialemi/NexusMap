package db

import (
	"database/sql"
)

func (d *DB) GetSchedules(projectID int) ([]ScanSchedule, error) {
	rows, err := d.Query(`
		SELECT id, project_id, COALESCE(name,''), profile, target,
			COALESCE(trigger_type,'time'), scheduled_at, depends_on_scan_id,
			COALESCE(status,'pending'), next_run_at, last_run_at, created_at
		FROM scan_schedules WHERE project_id = ? ORDER BY id`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ScanSchedule
	for rows.Next() {
		var s ScanSchedule
		var lastRun sql.NullString
		var scheduledAt, nextRun sql.NullString
		var depScanID sql.NullInt64
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Profile, &s.Target,
			&s.TriggerType, &scheduledAt, &depScanID,
			&s.Status, &nextRun, &lastRun, &s.CreatedAt); err != nil {
			return nil, err
		}
		if scheduledAt.Valid {
			s.ScheduledAt = &scheduledAt.String
		}
		if nextRun.Valid {
			s.NextRunAt = &nextRun.String
		}
		if lastRun.Valid {
			s.LastRunAt = &lastRun.String
		}
		if depScanID.Valid {
			v := int(depScanID.Int64)
			s.DependsOnScanID = &v
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) CreateSchedule(projectID int, name, profile, target, triggerType, scheduledAt string, dependsOnScanID *int) (int64, error) {
	if name == "" {
		name = target
	}
	var nextRun, depVal interface{}
	if triggerType == "time" && scheduledAt != "" {
		nextRun = scheduledAt
	}
	if dependsOnScanID != nil {
		depVal = *dependsOnScanID
	}
	res, err := d.Exec(
		`INSERT INTO scan_schedules (project_id, name, profile, target, trigger_type, scheduled_at, depends_on_scan_id, next_run_at, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
		projectID, name, profile, target, triggerType, ifStr(scheduledAt), depVal, nextRun)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *DB) UpdateSchedule(id int, name, profile, target, triggerType, scheduledAt string, dependsOnScanID *int, status string) error {
	var nextRun, depVal interface{}
	if triggerType == "time" && scheduledAt != "" {
		nextRun = scheduledAt
	}
	if dependsOnScanID != nil {
		depVal = *dependsOnScanID
	}
	_, err := d.Exec(
		`UPDATE scan_schedules SET name=?, profile=?, target=?, trigger_type=?, scheduled_at=?, depends_on_scan_id=?, next_run_at=?, status=?
		 WHERE id=?`,
		name, profile, target, triggerType, ifStr(scheduledAt), depVal, nextRun, status, id)
	return err
}

func (d *DB) DeleteSchedule(id int) error {
	_, err := d.Exec("DELETE FROM scan_schedules WHERE id=?", id)
	return err
}

func (d *DB) GetDueSchedules() ([]ScanSchedule, error) {
	rows, err := d.Query(`
		SELECT id, project_id, COALESCE(name,''), profile, target,
			COALESCE(trigger_type,'time'), scheduled_at, depends_on_scan_id,
			COALESCE(status,'pending'), next_run_at, last_run_at, created_at
		FROM scan_schedules
		WHERE status = 'pending'
		  AND ((trigger_type = 'time' AND next_run_at <= datetime('now'))
			OR (trigger_type = 'dependency'))
		ORDER BY next_run_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ScanSchedule
	for rows.Next() {
		var s ScanSchedule
		var lastRun sql.NullString
		var scheduledAt, nextRun sql.NullString
		var depScanID sql.NullInt64
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Profile, &s.Target,
			&s.TriggerType, &scheduledAt, &depScanID,
			&s.Status, &nextRun, &lastRun, &s.CreatedAt); err != nil {
			return nil, err
		}
		if scheduledAt.Valid {
			s.ScheduledAt = &scheduledAt.String
		}
		if nextRun.Valid {
			s.NextRunAt = &nextRun.String
		}
		if lastRun.Valid {
			s.LastRunAt = &lastRun.String
		}
		if depScanID.Valid {
			v := int(depScanID.Int64)
			s.DependsOnScanID = &v
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (d *DB) MarkScheduleRun(id int) error {
	_, err := d.Exec("UPDATE scan_schedules SET status = 'completed', last_run_at = datetime('now') WHERE id = ?", id)
	return err
}

func nullableStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func ifStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
