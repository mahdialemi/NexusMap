package db

import (
	"strings"
	"time"
)

func (d *DB) GetScans(projectID int) ([]Scan, error) {
	rows, err := d.Query(`
		SELECT s.id, s.project_id, s.profile, s.target, s.nmap_command, s.status, s.confirmed, s.progress,
			   COALESCE(s.phase, ''), s.note, s.started_at, s.completed_at,
			   (SELECT COUNT(*) FROM hosts h WHERE h.scan_id = s.id) as host_count,
			   (SELECT COUNT(*) FROM ports p JOIN hosts h ON h.id = p.host_id WHERE h.scan_id = s.id) as port_count,
			   s.schedule_id, ss.trigger_type, ss.scheduled_at, ss.depends_on_scan_id, ss.name
		FROM scans s
		LEFT JOIN scan_schedules ss ON ss.id = s.schedule_id
		WHERE s.project_id = ? ORDER BY s.started_at DESC`, projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scans := []Scan{}
	for rows.Next() {
		var s Scan
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Profile, &s.Target, &s.NmapCommand, &s.Status, &s.Confirmed, &s.Progress, &s.Phase, &s.Note, &s.StartedAt, &s.CompletedAt, &s.HostCount, &s.PortCount, &s.ScheduleID, &s.ScheduleTriggerType, &s.ScheduleScheduledAt, &s.ScheduleDependsOn, &s.ScheduleName); err != nil {
			return nil, err
		}
		scans = append(scans, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scans, nil
}

func (d *DB) GetImportHistory(projectID int) ([]Scan, error) {
	rows, err := d.Query(`
		SELECT s.id, s.project_id, s.profile, s.target, s.nmap_command, s.status, s.confirmed, s.progress,
			   COALESCE(s.phase, ''), s.note, s.started_at, s.completed_at,
			   (SELECT COUNT(*) FROM hosts h WHERE h.scan_id = s.id) as host_count,
			   (SELECT COUNT(*) FROM ports p JOIN hosts h ON h.id = p.host_id WHERE h.scan_id = s.id) as port_count,
			   s.schedule_id, ss.trigger_type, ss.scheduled_at, ss.depends_on_scan_id, ss.name
		FROM scans s
		LEFT JOIN scan_schedules ss ON ss.id = s.schedule_id
		WHERE s.project_id = ? AND s.profile = 'import' ORDER BY s.started_at DESC`, projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	scans := []Scan{}
	for rows.Next() {
		var s Scan
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Profile, &s.Target, &s.NmapCommand, &s.Status, &s.Confirmed, &s.Progress, &s.Phase, &s.Note, &s.StartedAt, &s.CompletedAt, &s.HostCount, &s.PortCount, &s.ScheduleID, &s.ScheduleTriggerType, &s.ScheduleScheduledAt, &s.ScheduleDependsOn, &s.ScheduleName); err != nil {
			return nil, err
		}
		scans = append(scans, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scans, nil
}

func (d *DB) CreateScan(projectID int, profile, target, nmapCommand string, scheduleID *int) (int64, error) {
	var sid interface{}
	if scheduleID != nil {
		sid = *scheduleID
	}
	result, err := d.Exec(
		"INSERT INTO scans (project_id, profile, target, nmap_command, schedule_id, status) VALUES (?, ?, ?, ?, ?, 'running')",
		projectID, profile, target, nmapCommand, sid,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (d *DB) CreatePendingScan(projectID int, profile, target, nmapCommand, note string) (int64, error) {
	result, err := d.Exec(
		"INSERT INTO scans (project_id, profile, target, nmap_command, note, status) VALUES (?, ?, ?, ?, ?, 'pending')",
		projectID, profile, target, nmapCommand, note,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (d *DB) UpdateScanStatus(id int, status string, progress int, phase string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if status == "completed" || status == "error" || status == "cancelled" {
		_, err := d.Exec("UPDATE scans SET status = ?, progress = ?, phase = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?", status, progress, phase, id)
		if err != nil {
			return err
		}
		// Update project's updated_at to reflect latest activity
		var projectID int
		if err := d.QueryRow("SELECT project_id FROM scans WHERE id = ?", id).Scan(&projectID); err == nil {
			d.Exec("UPDATE projects SET updated_at = ? WHERE id = ?", now, projectID)
		}
		return nil
	}
	_, err := d.Exec("UPDATE scans SET status = ?, progress = ?, phase = ? WHERE id = ?", status, progress, phase, id)
	return err
}

func (d *DB) StartScan(id int) error {
	_, err := d.Exec("UPDATE scans SET status = 'running', progress = 0, phase = '', started_at = CURRENT_TIMESTAMP WHERE id = ?", id)
	return err
}

func (d *DB) UpdateScanProgress(id int, progress int) error {
	_, err := d.Exec("UPDATE scans SET progress = ? WHERE id = ?", progress, id)
	return err
}

func (d *DB) UpdateScanXML(id int, rawXML string) error {
	_, err := d.Exec("UPDATE scans SET raw_xml = ? WHERE id = ?", rawXML, id)
	return err
}

func (d *DB) UpdateScanOutputDir(id int, outputDir string) error {
	_, err := d.Exec("UPDATE scans SET output_dir = ? WHERE id = ?", outputDir, id)
	return err
}

func (d *DB) GetScanOutputDir(id int) (string, error) {
	var dir string
	err := d.QueryRow("SELECT output_dir FROM scans WHERE id = ?", id).Scan(&dir)
	return dir, err
}

func (d *DB) GetScanXML(id int) (string, error) {
	var xml string
	err := d.QueryRow("SELECT raw_xml FROM scans WHERE id = ?", id).Scan(&xml)
	return xml, err
}

func (d *DB) UpdateScanNmap(id int, rawNmap string) error {
	_, err := d.Exec("UPDATE scans SET raw_nmap = ? WHERE id = ?", rawNmap, id)
	return err
}

func (d *DB) UpdateScanGnmap(id int, rawGnmap string) error {
	_, err := d.Exec("UPDATE scans SET raw_gnmap = ? WHERE id = ?", rawGnmap, id)
	return err
}

func (d *DB) GetScanNmap(id int) (string, error) {
	var data string
	err := d.QueryRow("SELECT raw_nmap FROM scans WHERE id = ?", id).Scan(&data)
	return data, err
}

func (d *DB) GetScanGnmap(id int) (string, error) {
	var data string
	err := d.QueryRow("SELECT raw_gnmap FROM scans WHERE id = ?", id).Scan(&data)
	return data, err
}

func (d *DB) GetAllScans(projectID int) ([]Scan, error) {
	rows, err := d.Query("SELECT id, project_id, profile, target, nmap_command, status, confirmed, progress, note, started_at, completed_at FROM scans WHERE project_id = ? AND status = 'completed' ORDER BY id", projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scans []Scan
	for rows.Next() {
		var s Scan
		if err := rows.Scan(&s.ID, &s.ProjectID, &s.Profile, &s.Target, &s.NmapCommand, &s.Status, &s.Confirmed, &s.Progress, &s.Note, &s.StartedAt, &s.CompletedAt); err != nil {
			return nil, err
		}
		scans = append(scans, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scans, nil
}

func (d *DB) DeleteScan(id int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	profile := d.getScanProfile(id)

	rows, err := tx.Query("SELECT DISTINCT ip FROM hosts WHERE scan_id = ?", id)
	if err != nil {
		return err
	}
	defer rows.Close()

	var ips []string
	for rows.Next() {
		var ip string
		if err := rows.Scan(&ip); err != nil {
			return err
		}
		ips = append(ips, ip)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, ip := range ips {
		var otherCount int
		tx.QueryRow("SELECT COUNT(*) FROM hosts WHERE ip = ? AND scan_id != ?", ip, id).Scan(&otherCount)

		if otherCount > 0 {
			if _, err := tx.Exec(`
				UPDATE consolidated_hosts
				SET discovery_methods = TRIM(REPLACE(',' || COALESCE(discovery_methods,'') || ',', ',' || ? || ',', ','), ','),
				    last_scan_id = (SELECT COALESCE((SELECT scan_id FROM hosts WHERE ip = ? AND scan_id != ? ORDER BY scan_id DESC LIMIT 1), 0))
				WHERE ip = ?`, profile, ip, id, ip); err != nil {
				return err
			}
			if _, err := tx.Exec(`
				UPDATE consolidated_ports
				SET last_scan_id = (SELECT COALESCE((SELECT scan_id FROM hosts WHERE ip = ? AND scan_id != ? ORDER BY scan_id DESC LIMIT 1), 0))
				WHERE ip = ? AND last_scan_id = ?`, ip, id, ip, id); err != nil {
				return err
			}
			if _, err := tx.Exec(`
				UPDATE live_hosts
				SET discovery_methods = TRIM(REPLACE(',' || COALESCE(discovery_methods,'') || ',', ',' || ? || ',', ','), ',')
				WHERE ip = ?`, profile, ip); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM live_hosts WHERE ip = ? AND (discovery_methods IS NULL OR discovery_methods = '')", ip); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec("DELETE FROM consolidated_hosts WHERE ip = ?", ip); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM consolidated_ports WHERE ip = ?", ip); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM live_hosts WHERE ip = ?", ip); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM consolidated_edits WHERE ip = ?", ip); err != nil {
				return err
			}
			if _, err := tx.Exec("DELETE FROM consolidated_notes WHERE ip = ?", ip); err != nil {
				return err
			}
		}
	}

	if _, err := tx.Exec("DELETE FROM ports WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM host_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM port_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM hosts WHERE scan_id = ?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM scans WHERE id = ?", id); err != nil {
		return err
	}

	return tx.Commit()
}

func (d *DB) GetScan(id int) (*Scan, error) {
	var s Scan
	err := d.QueryRow(
		`SELECT s.id, s.project_id, s.profile, s.target, s.nmap_command, s.status, s.confirmed, s.progress,
				COALESCE(s.phase, ''), s.note, s.output_dir, s.started_at, s.completed_at,
				s.schedule_id, ss.trigger_type, ss.scheduled_at, ss.depends_on_scan_id, ss.name
		FROM scans s
		LEFT JOIN scan_schedules ss ON ss.id = s.schedule_id
		WHERE s.id = ?`,
		id,
	).Scan(&s.ID, &s.ProjectID, &s.Profile, &s.Target, &s.NmapCommand, &s.Status, &s.Confirmed, &s.Progress, &s.Phase, &s.Note, &s.OutputDir, &s.StartedAt, &s.CompletedAt, &s.ScheduleID, &s.ScheduleTriggerType, &s.ScheduleScheduledAt, &s.ScheduleDependsOn, &s.ScheduleName)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (d *DB) GetScanProjectID(scanID int) (int, error) {
	var projectID int
	err := d.QueryRow("SELECT project_id FROM scans WHERE id = ?", scanID).Scan(&projectID)
	return projectID, err
}

func (d *DB) GetScanProgress(id int) (*ScanStatus, error) {
	var s ScanStatus
	err := d.QueryRow(`
		SELECT s.status, s.progress, COALESCE(s.phase, ''),
			COALESCE((SELECT COUNT(*) FROM hosts WHERE scan_id = s.id), 0),
			COALESCE((SELECT COUNT(*) FROM ports WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = s.id)), 0)
		FROM scans s WHERE s.id = ?`, id,
	).Scan(&s.Status, &s.Progress, &s.Phase, &s.Hosts, &s.Ports)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (d *DB) ConfirmScan(scanID int) error {
	var projectID int
	if err := d.QueryRow("SELECT project_id FROM scans WHERE id = ?", scanID).Scan(&projectID); err != nil {
		return err
	}

	rows, err := d.Query(`
		SELECT h.id, h.ip, h.mac, h.hostname, h.os, h.status,
			   COALESCE(p.id, 0), COALESCE(p.port, 0), COALESCE(p.protocol, ''), COALESCE(p.state, ''), COALESCE(p.service, ''), COALESCE(p.version, ''), COALESCE(p.product, ''), COALESCE(p.extra_info, '')
		FROM hosts h
		LEFT JOIN ports p ON p.host_id = h.id
		WHERE h.scan_id = ?
		ORDER BY h.id
	`, scanID)
	if err != nil {
		return err
	}
	defer rows.Close()

	isDiscovery := isDiscoveryProfile(d.getScanProfile(scanID))
	method := d.getScanProfile(scanID)

	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	upsertHostStmt, err := tx.Prepare(`
		INSERT INTO consolidated_hosts (ip, mac, hostname, os, status, discovery_methods, first_seen, last_seen, last_scan_id)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
		ON CONFLICT(ip) DO UPDATE SET
			mac = CASE WHEN excluded.mac != '' THEN excluded.mac ELSE consolidated_hosts.mac END,
			hostname = CASE WHEN excluded.hostname != '' THEN excluded.hostname ELSE consolidated_hosts.hostname END,
			os = CASE WHEN excluded.os != '' THEN excluded.os ELSE consolidated_hosts.os END,
			status = CASE WHEN excluded.status != 'unknown' THEN excluded.status ELSE consolidated_hosts.status END,
			discovery_methods = CASE
				WHEN consolidated_hosts.discovery_methods LIKE '%' || excluded.discovery_methods || '%' THEN consolidated_hosts.discovery_methods
				WHEN consolidated_hosts.discovery_methods = '' THEN excluded.discovery_methods
				ELSE consolidated_hosts.discovery_methods || ',' || excluded.discovery_methods
			END,
			last_seen = CURRENT_TIMESTAMP,
			last_scan_id = excluded.last_scan_id
	`)
	if err != nil {
		return err
	}
	defer upsertHostStmt.Close()

	upsertPortStmt, err := tx.Prepare(`
		INSERT INTO consolidated_ports (ip, port, protocol, state, service, version, product, extra_info, change_count, first_seen, last_seen, last_scan_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
		ON CONFLICT(ip, port, protocol) DO UPDATE SET
			state = excluded.state,
			service = CASE WHEN excluded.service != '' THEN excluded.service ELSE consolidated_ports.service END,
			version = CASE WHEN excluded.version != '' THEN excluded.version ELSE consolidated_ports.version END,
			product = CASE WHEN excluded.product != '' THEN excluded.product ELSE consolidated_ports.product END,
			extra_info = CASE WHEN excluded.extra_info != '' THEN excluded.extra_info ELSE consolidated_ports.extra_info END,
			change_count = consolidated_ports.change_count + CASE
				WHEN excluded.state != consolidated_ports.state THEN 1
				WHEN excluded.service != '' AND excluded.service != consolidated_ports.service THEN 1
				WHEN excluded.version != '' AND excluded.version != consolidated_ports.version THEN 1
				WHEN excluded.product != '' AND excluded.product != consolidated_ports.product THEN 1
				WHEN excluded.extra_info != '' AND excluded.extra_info != consolidated_ports.extra_info THEN 1
				ELSE 0
			END,
			last_seen = CURRENT_TIMESTAMP,
			last_scan_id = excluded.last_scan_id
	`)
	if err != nil {
		return err
	}
	defer upsertPortStmt.Close()

	upsertLiveStmt, err := tx.Prepare(`
		INSERT INTO live_hosts (ip, mac, hostname, os, status, discovery_methods, last_seen, note)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, '')
		ON CONFLICT(ip) DO UPDATE SET
			mac = CASE WHEN excluded.mac != '' THEN excluded.mac ELSE live_hosts.mac END,
			hostname = CASE WHEN excluded.hostname != '' THEN excluded.hostname ELSE live_hosts.hostname END,
			os = CASE WHEN excluded.os != '' THEN excluded.os ELSE live_hosts.os END,
			status = CASE WHEN excluded.status != 'unknown' THEN excluded.status ELSE live_hosts.status END,
			discovery_methods = CASE
				WHEN live_hosts.discovery_methods LIKE '%' || excluded.discovery_methods || '%' THEN live_hosts.discovery_methods
				WHEN live_hosts.discovery_methods = '' THEN excluded.discovery_methods
				ELSE live_hosts.discovery_methods || ',' || excluded.discovery_methods
			END,
			last_seen = CURRENT_TIMESTAMP
	`)
	if err != nil {
		return err
	}
	defer upsertLiveStmt.Close()

	// Stream through rows — no intermediate Go maps
	var lastHostID int
	for rows.Next() {
		var hID, pID, pPort int
		var hIP, hMAC, hHostname, hOS, hStatus string
		var pProtocol, pState, pService, pVersion, pProduct, pExtraInfo string

		if err := rows.Scan(&hID, &hIP, &hMAC, &hHostname, &hOS, &hStatus,
			&pID, &pPort, &pProtocol, &pState, &pService, &pVersion, &pProduct, &pExtraInfo); err != nil {
			return err
		}

		if hID != lastHostID {
			if _, err := upsertHostStmt.Exec(hIP, hMAC, hHostname, hOS, hStatus, method, scanID); err != nil {
				return err
			}
			if isDiscovery {
				if _, err := upsertLiveStmt.Exec(hIP, hMAC, hHostname, hOS, hStatus, method); err != nil {
					return err
				}
			}
			lastHostID = hID
		}
		if pID != 0 {
			if _, err := upsertPortStmt.Exec(hIP, pPort, pProtocol, pState, pService, pVersion, pProduct, pExtraInfo, scanID); err != nil {
				return err
			}
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if _, err := tx.Exec("UPDATE scans SET confirmed = 1 WHERE id = ?", scanID); err != nil {
		return err
	}

	// Update project's updated_at to reflect latest activity
	if _, err := tx.Exec("UPDATE projects SET updated_at = ? WHERE id = ?",
		time.Now().UTC().Format(time.RFC3339), projectID); err != nil {
		return err
	}

	return tx.Commit()
}

func (d *DB) RejectScan(scanID int) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM ports WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", scanID); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM host_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", scanID); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM port_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", scanID); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM hosts WHERE scan_id = ?", scanID); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE scans SET status = 'rejected', confirmed = -1 WHERE id = ?", scanID); err != nil {
		return err
	}

	return tx.Commit()
}

func (d *DB) ConfirmAllPending(projectID int) (int, error) {
	rows, err := d.Query("SELECT id FROM scans WHERE project_id = ? AND status = 'completed' AND confirmed IS NULL", projectID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return 0, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, id := range ids {
		if err := d.ConfirmScan(id); err != nil {
			return 0, err
		}
	}
	return len(ids), nil
}

func (d *DB) getScanProfile(scanID int) string {
	var profile string
	if err := d.QueryRow("SELECT profile FROM scans WHERE id = ?", scanID).Scan(&profile); err != nil {
		return ""
	}
	return profile
}

func isDiscoveryProfile(profile string) bool {
	p := strings.ToLower(profile)
	return strings.Contains(p, "discovery") || strings.Contains(p, "ping") ||
		strings.HasPrefix(p, "live")
}
