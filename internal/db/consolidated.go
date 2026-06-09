package db

import (
	"fmt"
	"strings"
)

func (d *DB) GetConsolidatedPorts(projectID int) ([]ConsolidatedPort, error) {
	result, err := d.GetConsolidatedPortsPaged(projectID, 1, 100000, "", "", "", false)
	if err != nil {
		return nil, err
	}
	return result.Ports, nil
}

func (d *DB) GetConsolidatedPortsPaged(projectID, page, limit int, search, state, service string, hideClosed bool) (*PaginatedPorts, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 50
	}
	offset := (page - 1) * limit

	args := []interface{}{projectID}
	var wheres []string
	if search != "" {
		wheres = append(wheres, "(cp.ip LIKE ? OR cp.service LIKE ? OR ch.hostname LIKE ? OR ch.os LIKE ?)")
		args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}
	if state != "" {
		wheres = append(wheres, "cp.state = ?")
		args = append(args, state)
	}
	if service != "" {
		wheres = append(wheres, "cp.service LIKE ?")
		args = append(args, "%"+service+"%")
	}
	if hideClosed {
		wheres = append(wheres, "cp.state != 'closed'")
	}
	whereClause := ""
	if len(wheres) > 0 {
		whereClause = " WHERE " + wheres[0]
		for i := 1; i < len(wheres); i++ {
			whereClause += " AND " + wheres[i]
		}
	}

	var total int
	if err := d.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT 1 FROM consolidated_ports cp
			INNER JOIN hosts h ON h.ip = cp.ip INNER JOIN scans s ON s.id = h.scan_id AND s.project_id = ?
			LEFT JOIN consolidated_hosts ch ON ch.ip = cp.ip`+whereClause+`
			GROUP BY cp.ip, cp.port, cp.protocol
		)`, append([]interface{}{projectID}, args[1:]...)...).Scan(&total); err != nil {
		return nil, err
	}

	args = append(args, limit, offset)
	rows, err := d.Query(`
		SELECT DISTINCT cp.ip, COALESCE(ch.mac, ''), COALESCE(ch.hostname, ''), COALESCE(ch.os, ''), COALESCE(ch.status, ''),
			   cp.port, cp.protocol, cp.state, cp.service, cp.version, cp.product, cp.extra_info,
			   cp.change_count, strftime('%Y-%m-%dT%H:%M:%SZ', cp.first_seen), strftime('%Y-%m-%dT%H:%M:%SZ', cp.last_seen), cp.last_scan_id,
			   COALESCE(cn.note, '')
		FROM consolidated_ports cp
		INNER JOIN hosts h ON h.ip = cp.ip
		INNER JOIN scans s ON s.id = h.scan_id AND s.project_id = ?
		LEFT JOIN consolidated_hosts ch ON ch.ip = cp.ip
		LEFT JOIN consolidated_notes cn ON cn.ip = cp.ip AND cn.port = cp.port AND cn.protocol = cp.protocol
		`+whereClause+`
		GROUP BY cp.ip, cp.port, cp.protocol
		ORDER BY cp.ip, cp.port LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ConsolidatedPort
	for rows.Next() {
		var p ConsolidatedPort
		if err := rows.Scan(&p.IP, &p.MAC, &p.Hostname, &p.OS, &p.HostStatus, &p.Port, &p.Protocol, &p.State, &p.Service, &p.Version, &p.Product, &p.ExtraInfo, &p.ChangeCount, &p.FirstSeen, &p.LastSeen, &p.LastScanID, &p.NotePreview); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &PaginatedPorts{
		Ports: result,
		Total: total,
		Page:  page,
		Limit: limit,
	}, nil
}

func (d *DB) UpdateConsolidatedPortField(ip string, port int, protocol, field, value string) error {
	hostFields := map[string]bool{"mac": true, "hostname": true, "os": true}
	portFields := map[string]bool{"state": true, "service": true, "version": true, "product": true, "extra_info": true}

	if field == "note" {
		return d.SetPortNote(ip, port, protocol, value)
	}

	if _, ok := hostFields[field]; !ok && !portFields[field] {
		return fmt.Errorf("invalid field: %s", field)
	}

	var oldVal string
	if hostFields[field] {
		query := "SELECT " + field + " FROM consolidated_hosts WHERE ip = ?"
		if err := d.QueryRow(query, ip).Scan(&oldVal); err != nil {
			// ignore
		}
		updQuery := "UPDATE consolidated_hosts SET " + field + " = ? WHERE ip = ?"
		if _, err := d.Exec(updQuery, value, ip); err != nil {
			return err
		}
		if value != "" {
			liveQuery := "UPDATE live_hosts SET " + field + " = ? WHERE ip = ?"
			d.Exec(liveQuery, value, ip)
		}
		_, err := d.Exec(`
			INSERT INTO consolidated_edits (ip, port, protocol, field, old_value, new_value)
			VALUES (?, 0, '', ?, ?, ?)
		`, ip, field, oldVal, value)
		return err
	}

	selQuery := "SELECT " + field + " FROM consolidated_ports WHERE ip = ? AND port = ? AND protocol = ?"
	if err := d.QueryRow(selQuery, ip, port, protocol).Scan(&oldVal); err != nil {
		// ignore
	}
	updQuery := "UPDATE consolidated_ports SET " + field + " = ?, change_count = change_count + 1, last_seen = CURRENT_TIMESTAMP WHERE ip = ? AND port = ? AND protocol = ?"
	if _, err := d.Exec(updQuery, value, ip, port, protocol); err != nil {
		return err
	}

	_, err := d.Exec(`
		INSERT INTO consolidated_edits (ip, port, protocol, field, old_value, new_value)
		VALUES (?, ?, ?, ?, ?, ?)
	`, ip, port, protocol, field, oldVal, value)
	return err
}

func (d *DB) GetConsolidatedEditHistory(ip, port, protocol string) ([]ConsolidatedEdit, error) {
	rows, err := d.Query(`
		SELECT id, ip, port, protocol, field, old_value, new_value, COALESCE(applied, 1), strftime('%Y-%m-%dT%H:%M:%SZ', edited_at)
		FROM consolidated_edits
		WHERE ip = ? AND port = ? AND protocol = ?
		ORDER BY id DESC
	`, ip, port, protocol)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edits []ConsolidatedEdit
	for rows.Next() {
		var e ConsolidatedEdit
		if err := rows.Scan(&e.EditID, &e.IP, &e.Port, &e.Protocol, &e.Field, &e.OldValue, &e.NewValue, &e.Applied, &e.EditedAt); err != nil {
			return nil, err
		}
		edits = append(edits, e)
	}
	return edits, nil
}

func (d *DB) GetHostEditHistory(ip string) ([]ConsolidatedEdit, error) {
	rows, err := d.Query(`
		SELECT id, ip, port, protocol, field, old_value, new_value, COALESCE(applied, 1), strftime('%Y-%m-%dT%H:%M:%SZ', edited_at)
		FROM consolidated_edits
		WHERE ip = ? AND port = 0 AND protocol = ''
		ORDER BY id DESC
	`, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edits []ConsolidatedEdit
	for rows.Next() {
		var e ConsolidatedEdit
		if err := rows.Scan(&e.EditID, &e.IP, &e.Port, &e.Protocol, &e.Field, &e.OldValue, &e.NewValue, &e.Applied, &e.EditedAt); err != nil {
			return nil, err
		}
		edits = append(edits, e)
	}
	return edits, nil
}

var hostEditFields = map[string]bool{"mac": true, "hostname": true, "os": true}

func (d *DB) RevertHostEdit(editID int, ip string) error {
	hostFields := hostEditFields

	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var edit ConsolidatedEdit
	err = tx.QueryRow(`
		SELECT field, old_value, new_value FROM consolidated_edits WHERE id = ? AND port = 0
	`, editID).Scan(&edit.Field, &edit.OldValue, &edit.NewValue)
	if err != nil {
		return err
	}

	if !hostFields[edit.Field] {
		return fmt.Errorf("invalid field: %s", edit.Field)
	}

	_, err = tx.Exec(fmt.Sprintf("UPDATE consolidated_hosts SET %s = ? WHERE ip = ?", edit.Field), edit.OldValue, ip)
	if err != nil {
		return err
	}

	if edit.OldValue != "" {
		tx.Exec(fmt.Sprintf("UPDATE live_hosts SET %s = ? WHERE ip = ?", edit.Field), edit.OldValue, ip)
	}

	_, err = tx.Exec("UPDATE consolidated_edits SET applied = 0 WHERE id = ?", editID)
	return tx.Commit()
}

func (d *DB) RevertConsolidatedEdit(editID int, ip string, port int, protocol string) error {
	hostFields := map[string]bool{"mac": true, "hostname": true, "os": true}
	portFields := map[string]bool{"state": true, "service": true, "version": true, "product": true, "extra_info": true}

	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var edit ConsolidatedEdit
	err = tx.QueryRow(`
		SELECT field, old_value, new_value FROM consolidated_edits WHERE id = ?
	`, editID).Scan(&edit.Field, &edit.OldValue, &edit.NewValue)
	if err != nil {
		return err
	}

	targetField := edit.Field
	if !hostFields[targetField] && !portFields[targetField] {
		return fmt.Errorf("invalid field: %s", targetField)
	}
	if hostFields[targetField] {
		_, err = tx.Exec(fmt.Sprintf("UPDATE consolidated_hosts SET %s = ? WHERE ip = ?", targetField), edit.OldValue, ip)
	} else {
		_, err = tx.Exec(fmt.Sprintf("UPDATE consolidated_ports SET %s = ?, change_count = change_count + 1, last_seen = CURRENT_TIMESTAMP WHERE ip = ? AND port = ? AND protocol = ?", targetField), edit.OldValue, ip, port, protocol)
	}
	if err != nil {
		return err
	}

	_, err = tx.Exec("UPDATE consolidated_edits SET applied = 0 WHERE id = ?", editID)
	return tx.Commit()
}

func (d *DB) ApplyConsolidatedEdit(editID int, ip string, port int, protocol string) error {
	hostFields := map[string]bool{"mac": true, "hostname": true, "os": true}
	portFields := map[string]bool{"state": true, "service": true, "version": true, "product": true, "extra_info": true}

	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var edit ConsolidatedEdit
	err = tx.QueryRow(`
		SELECT field, old_value, new_value FROM consolidated_edits WHERE id = ?
	`, editID).Scan(&edit.Field, &edit.OldValue, &edit.NewValue)
	if err != nil {
		return err
	}

	targetField := edit.Field
	if !hostFields[targetField] && !portFields[targetField] {
		return fmt.Errorf("invalid field: %s", targetField)
	}
	if hostFields[targetField] {
		_, err = tx.Exec(fmt.Sprintf("UPDATE consolidated_hosts SET %s = ? WHERE ip = ?", targetField), edit.NewValue, ip)
	} else {
		_, err = tx.Exec(fmt.Sprintf("UPDATE consolidated_ports SET %s = ?, change_count = change_count + 1, last_seen = CURRENT_TIMESTAMP WHERE ip = ? AND port = ? AND protocol = ?", targetField), edit.NewValue, ip, port, protocol)
	}
	if err != nil {
		return err
	}

	_, err = tx.Exec("UPDATE consolidated_edits SET applied = 1 WHERE id = ?", editID)
	return tx.Commit()
}

func (d *DB) GetConsolidatedHosts(projectID int) ([]ConsolidatedHost, error) {
	rows, err := d.Query(`
		SELECT ch.ip, COALESCE(ch.mac, ''), COALESCE(ch.hostname, ''), COALESCE(ch.os, ''), COALESCE(ch.status, ''), COALESCE(ch.discovery_methods, ''),
			   strftime('%Y-%m-%dT%H:%M:%SZ', ch.first_seen), strftime('%Y-%m-%dT%H:%M:%SZ', ch.last_seen), ch.last_scan_id
		FROM consolidated_hosts ch
		WHERE EXISTS (
			SELECT 1 FROM hosts h
			JOIN scans s ON s.id = h.scan_id
			WHERE s.project_id = ? AND h.ip = ch.ip
		)
		ORDER BY ch.ip`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ConsolidatedHost
	seen := make(map[string]bool)
	for rows.Next() {
		var h ConsolidatedHost
		if err := rows.Scan(&h.IP, &h.MAC, &h.Hostname, &h.OS, &h.Status, &h.DiscoveryMethods, &h.FirstSeen, &h.LastSeen, &h.LastScanID); err != nil {
			return nil, err
		}
		if !seen[h.IP] {
			seen[h.IP] = true
			result = append(result, h)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (d *DB) GetPortHistory(projectID int, ip string, port int, protocol string) ([]PortHistoryEntry, error) {
	rows, err := d.Query(`
		SELECT DISTINCT p.port, s.id, s.profile, s.target, p.state, p.service, p.version, p.product, p.extra_info,
			   strftime('%Y-%m-%dT%H:%M:%SZ', s.started_at)
		FROM ports p
		JOIN hosts h ON h.id = p.host_id
		JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND h.ip = ? AND p.port = ? AND p.protocol = ?
		ORDER BY s.started_at DESC, p.state DESC`, projectID, ip, port, protocol)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []PortHistoryEntry
	for rows.Next() {
		var e PortHistoryEntry
		var dummyPort int
		if err := rows.Scan(&dummyPort, &e.ScanID, &e.Profile, &e.Target, &e.State, &e.Service, &e.Version, &e.Product, &e.ExtraInfo, &e.StartedAt); err != nil {
			return nil, err
		}
		if len(result) == 0 || e.ScanID != result[len(result)-1].ScanID || e.State != result[len(result)-1].State || e.Service != result[len(result)-1].Service {
			result = append(result, e)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

type BulkPortItem struct {
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
}

func (d *DB) DeleteConsolidatedPorts(projectID int, ports []BulkPortItem) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("DELETE FROM consolidated_ports WHERE ip = ? AND port = ? AND protocol = ?")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range ports {
		if _, err := stmt.Exec(p.IP, p.Port, p.Protocol); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) RevertConsolidatedPort(ip string, port int, protocol, state, service, version, product, extraInfo string) error {
	_, err := d.Exec(`
		UPDATE consolidated_ports SET
			state = ?, service = ?, version = ?, product = ?, extra_info = ?,
			change_count = change_count + 1, last_seen = CURRENT_TIMESTAMP
		WHERE ip = ? AND port = ? AND protocol = ?`,
		state, service, version, product, extraInfo, ip, port, protocol)
	return err
}

func (d *DB) GetHighRiskPortDetails(projectID int) ([]ConsolidatedPort, error) {
	highRiskPorts := []string{"21", "22", "23", "25", "53", "110", "135", "139", "143", "443", "445", "993", "995", "1433", "1521", "3306", "3389", "5432", "5900", "6379", "8080", "8443", "27017"}
	placeholders := ""
	args := []interface{}{}
	for i, p := range highRiskPorts {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args = append(args, p)
	}
	query := fmt.Sprintf(`
		SELECT cp.ip, COALESCE(ch.mac, ''), COALESCE(ch.hostname, ''), COALESCE(ch.os, ''), COALESCE(ch.status, ''),
			   cp.port, cp.protocol, cp.state, cp.service, cp.version, cp.product, cp.extra_info,
			   cp.change_count, strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ', cp.first_seen), strftime('%%Y-%%m-%%dT%%H:%%M:%%SZ', cp.last_seen), cp.last_scan_id
		FROM consolidated_ports cp
		LEFT JOIN consolidated_hosts ch ON ch.ip = cp.ip
		WHERE cp.port IN (%s) AND cp.state = 'open'
		AND cp.ip IN (SELECT DISTINCT ip FROM hosts WHERE scan_id IN (SELECT id FROM scans WHERE project_id = ?))
		ORDER BY cp.port, cp.ip
	`, placeholders)
	args = append(args, projectID)

	rows, err := d.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []ConsolidatedPort
	for rows.Next() {
		var p ConsolidatedPort
		if err := rows.Scan(&p.IP, &p.MAC, &p.Hostname, &p.OS, &p.HostStatus, &p.Port, &p.Protocol, &p.State, &p.Service, &p.Version, &p.Product, &p.ExtraInfo, &p.ChangeCount, &p.FirstSeen, &p.LastSeen, &p.LastScanID, &p.NotePreview); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (d *DB) GetConsolidatedEdits(projectID int) ([]ConsolidatedEdit, error) {
	rows, err := d.Query(`
		SELECT ce.id, ce.ip, ce.port, ce.protocol, ce.field, ce.old_value, ce.new_value,
			   COALESCE(ce.applied, 1), strftime('%Y-%m-%dT%H:%M:%SZ', ce.edited_at)
		FROM consolidated_edits ce
		WHERE ce.ip IN (SELECT DISTINCT ip FROM hosts WHERE scan_id IN (SELECT id FROM scans WHERE project_id = ?))
		ORDER BY ce.edited_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edits []ConsolidatedEdit
	for rows.Next() {
		var e ConsolidatedEdit
		if err := rows.Scan(&e.EditID, &e.IP, &e.Port, &e.Protocol, &e.Field, &e.OldValue, &e.NewValue, &e.Applied, &e.EditedAt); err != nil {
			return nil, err
		}
		edits = append(edits, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return edits, nil
}

func (d *DB) GetHostEdits(projectID int) ([]ConsolidatedEdit, error) {
	rows, err := d.Query(`
		SELECT ce.id, ce.ip, ce.port, ce.protocol, ce.field, ce.old_value, ce.new_value,
			   COALESCE(ce.applied, 1), strftime('%Y-%m-%dT%H:%M:%SZ', ce.edited_at)
		FROM consolidated_edits ce
		WHERE ce.port = 0 AND ce.protocol = ''
		AND ce.ip IN (SELECT DISTINCT ip FROM hosts WHERE scan_id IN (SELECT id FROM scans WHERE project_id = ?))
		ORDER BY ce.edited_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var edits []ConsolidatedEdit
	for rows.Next() {
		var e ConsolidatedEdit
		if err := rows.Scan(&e.EditID, &e.IP, &e.Port, &e.Protocol, &e.Field, &e.OldValue, &e.NewValue, &e.Applied, &e.EditedAt); err != nil {
			return nil, err
		}
		edits = append(edits, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return edits, nil
}

func (d *DB) GetPortNote(ip string, port int, protocol string) (*ConsolidatedNote, error) {
	var n ConsolidatedNote
	err := d.QueryRow(`
		SELECT id, ip, port, protocol, note, created_at, updated_at
		FROM consolidated_notes WHERE ip = ? AND port = ? AND protocol = ?`,
		ip, port, protocol).Scan(&n.ID, &n.IP, &n.Port, &n.Protocol, &n.Note, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

func (d *DB) SetPortNote(ip string, port int, protocol string, note string) error {
	_, err := d.Exec(`
		INSERT INTO consolidated_notes (ip, port, protocol, note, updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(ip, port, protocol) DO UPDATE SET
			note = excluded.note,
			updated_at = CURRENT_TIMESTAMP`,
		ip, port, protocol, note)
	return err
}

func (d *DB) DeletePortNote(ip string, port int, protocol string) error {
	_, err := d.Exec(`DELETE FROM consolidated_notes WHERE ip = ? AND port = ? AND protocol = ?`, ip, port, protocol)
	return err
}

func (d *DB) GetConsolidatedFieldValues(projectID int, field, query string) ([]string, error) {
	meta, ok := consolidatedFields[field]
	if !ok {
		return nil, fmt.Errorf("unknown field: %s", field)
	}

	var colWhere string
	switch meta.Table {
	case "cp":
		colWhere = "cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?)"
	case "ch":
		colWhere = "EXISTS (SELECT 1 FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=? AND h.ip=ch.ip)"
	case "cn":
		colWhere = "cn.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?)"
	default:
		return nil, fmt.Errorf("unknown table: %s", meta.Table)
	}

	// For number fields, cast to text for LIKE matching
	var colExpr string
	if meta.FieldType == "number" {
		colExpr = fmt.Sprintf("CAST(%s AS TEXT)", meta.Column)
	} else {
		colExpr = meta.Column
	}

	args := []interface{}{projectID}
	sql := fmt.Sprintf("SELECT DISTINCT %s FROM %s WHERE %s AND %s != ''", colExpr, tableForMeta(meta.Table), colWhere, meta.Column)
	if query != "" {
		sql += fmt.Sprintf(" AND %s LIKE ?", colExpr)
		args = append(args, "%"+query+"%")
	}
	sql += fmt.Sprintf(" ORDER BY %s LIMIT 50", colExpr)

	rows, err := d.Query(sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vals []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		vals = append(vals, v)
	}
	return vals, nil
}

func tableForMeta(table string) string {
	switch table {
	case "cp":
		return "consolidated_ports cp"
	case "ch":
		return "consolidated_hosts ch"
	case "cn":
		return "consolidated_notes cn"
	default:
		return "consolidated_ports cp"
	}
}

// field metadata for filters
type fieldMeta struct {
	Column    string
	Table     string // cp, ch, cn
	FieldType string // string, enum, number, date
	ValidOps  []string
}

var consolidatedFields = map[string]fieldMeta{
	"ip":          {"cp.ip", "cp", "string", []string{"eq", "neq", "contains", "begins_with", "ends_with", "is_empty", "is_not_empty"}},
	"mac":         {"ch.mac", "ch", "string", []string{"eq", "neq", "contains", "begins_with", "ends_with", "is_empty", "is_not_empty"}},
	"hostname":    {"ch.hostname", "ch", "string", []string{"eq", "neq", "contains", "begins_with", "ends_with", "is_empty", "is_not_empty"}},
	"os":          {"ch.os", "ch", "enum", []string{"eq", "neq", "contains", "in", "not_in", "is_empty", "is_not_empty"}},
	"host_status": {"ch.status", "ch", "enum", []string{"eq", "neq", "in", "not_in"}},
	"port":        {"cp.port", "cp", "number", []string{"eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "between"}},
	"protocol":    {"cp.protocol", "cp", "enum", []string{"eq", "neq", "in", "not_in"}},
	"state":       {"cp.state", "cp", "enum", []string{"eq", "neq", "in", "not_in", "contains"}},
	"service":     {"cp.service", "cp", "enum", []string{"eq", "neq", "contains", "begins_with", "ends_with", "in", "not_in", "is_empty", "is_not_empty"}},
	"version":     {"cp.version", "cp", "enum", []string{"eq", "neq", "contains", "begins_with", "ends_with", "in", "not_in", "is_empty", "is_not_empty"}},
	"product":     {"cp.product", "cp", "enum", []string{"eq", "neq", "contains", "begins_with", "ends_with", "in", "not_in", "is_empty", "is_not_empty"}},
	"extra_info":  {"cp.extra_info", "cp", "string", []string{"eq", "neq", "contains", "begins_with", "ends_with", "is_empty", "is_not_empty"}},
	"change_count": {"cp.change_count", "cp", "number", []string{"eq", "neq", "gt", "gte", "lt", "lte", "between"}},
	"first_seen":  {"cp.first_seen", "cp", "date", []string{"gt", "gte", "lt", "lte", "between", "eq", "neq"}},
	"last_seen":   {"cp.last_seen", "cp", "date", []string{"gt", "gte", "lt", "lte", "between", "eq", "neq"}},
	"note":        {"cn.note", "cn", "string", []string{"eq", "neq", "contains", "begins_with", "ends_with", "is_empty", "is_not_empty"}},
}

func (d *DB) GetConsolidatedFilterOptions(projectID int) (*FilterOptionsResponse, error) {
	res := &FilterOptionsResponse{Fields: make(map[string]FieldOption)}

	// String fields — just return type, no values list
	for name, meta := range consolidatedFields {
		if meta.FieldType == "string" || meta.FieldType == "date" {
			res.Fields[name] = FieldOption{Type: meta.FieldType}
		}
	}

	// Enum fields — get DISTINCT values
	enumFields := []struct {
		name  string
		query string
	}{
		{"os", "SELECT DISTINCT ch.os FROM consolidated_hosts ch WHERE ch.os != '' AND EXISTS (SELECT 1 FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=? AND h.ip=ch.ip) ORDER BY ch.os"},
		{"host_status", "SELECT DISTINCT ch.status FROM consolidated_hosts ch WHERE ch.status != '' AND EXISTS (SELECT 1 FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=? AND h.ip=ch.ip) ORDER BY ch.status"},
		{"state", "SELECT DISTINCT cp.state FROM consolidated_ports cp WHERE cp.state != '' AND cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?) ORDER BY cp.state"},
		{"protocol", "SELECT DISTINCT cp.protocol FROM consolidated_ports cp WHERE cp.protocol != '' AND cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?) ORDER BY cp.protocol"},
		{"service", "SELECT DISTINCT cp.service FROM consolidated_ports cp WHERE cp.service != '' AND cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?) ORDER BY cp.service"},
		{"version", "SELECT DISTINCT cp.version FROM consolidated_ports cp WHERE cp.version != '' AND cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?) ORDER BY cp.version"},
		{"product", "SELECT DISTINCT cp.product FROM consolidated_ports cp WHERE cp.product != '' AND cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?) ORDER BY cp.product"},
	}

	for _, ef := range enumFields {
		rows, err := d.Query(ef.query, projectID)
		if err != nil {
			return nil, err
		}
		var vals []string
		for rows.Next() {
			var v string
			if err := rows.Scan(&v); err != nil {
				rows.Close()
				return nil, err
			}
			if v != "" {
				vals = append(vals, v)
			}
		}
		rows.Close()
		res.Fields[ef.name] = FieldOption{Type: "enum", Values: vals}
	}

	// Number fields with min/max
	var portMin, portMax int
	d.QueryRow("SELECT MIN(cp.port), MAX(cp.port) FROM consolidated_ports cp WHERE cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?)", projectID).Scan(&portMin, &portMax)
	res.Fields["port"] = FieldOption{Type: "number", Min: &portMin, Max: &portMax}

	var ccMin, ccMax int
	d.QueryRow("SELECT MIN(cp.change_count), MAX(cp.change_count) FROM consolidated_ports cp WHERE cp.ip IN (SELECT DISTINCT h.ip FROM hosts h JOIN scans s ON s.id=h.scan_id WHERE s.project_id=?)", projectID).Scan(&ccMin, &ccMax)
	res.Fields["change_count"] = FieldOption{Type: "number", Min: &ccMin, Max: &ccMax}

	return res, nil
}

func (d *DB) GetConsolidatedPortsFiltered(projectID int, req *PortsQueryRequest) (*PaginatedPorts, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 {
		req.Limit = 50
	}
	offset := (req.Page - 1) * req.Limit
	filterMode := req.FilterMode
	if filterMode != "or" {
		filterMode = "and"
	}

	args := []interface{}{projectID}
	var allWheres []string
	joinNeeded := make(map[string]bool)

	// search
	if req.Search != "" {
		allWheres = append(allWheres, "(cp.ip LIKE ? OR cp.service LIKE ? OR ch.hostname LIKE ? OR ch.os LIKE ?)")
		s := "%" + req.Search + "%"
		args = append(args, s, s, s, s)
	}

	// hide closed ports
	if req.HideClosed {
		allWheres = append(allWheres, "cp.state != 'closed'")
	}

	// Process filters: either groups or flat list
	if len(req.Groups) > 0 {
		for _, g := range req.Groups {
			groupMode := g.GroupMode
			if groupMode != "or" {
				groupMode = "and"
			}
			groupWheres := buildFilterClauses(g.Filters, &args, joinNeeded)
			if len(groupWheres) > 0 {
				allWheres = append(allWheres, "("+strings.Join(groupWheres, " "+groupMode+" ")+")")
			}
		}
	} else if len(req.Filters) > 0 {
		flatWheres := buildFilterClauses(req.Filters, &args, joinNeeded)
		allWheres = append(allWheres, flatWheres...)
	}

	whereClause := ""
	if len(allWheres) > 0 {
		whereClause = " WHERE " + strings.Join(allWheres, " "+filterMode+" ")
	}

	joins := "INNER JOIN hosts h ON h.ip = cp.ip INNER JOIN scans s ON s.id = h.scan_id AND s.project_id = ?"
	if joinNeeded["ch"] {
		joins += " LEFT JOIN consolidated_hosts ch ON ch.ip = cp.ip"
	} else {
		joins += " LEFT JOIN consolidated_hosts ch ON ch.ip = cp.ip"
	}
	if joinNeeded["cn"] {
		joins += " LEFT JOIN consolidated_notes cn ON cn.ip = cp.ip AND cn.port = cp.port AND cn.protocol = cp.protocol"
	} else {
		joins += " LEFT JOIN consolidated_notes cn ON cn.ip = cp.ip AND cn.port = cp.port AND cn.protocol = cp.protocol"
	}

	// total count
	var total int
	if err := d.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT 1 FROM consolidated_ports cp
			`+joins+` `+whereClause+`
			GROUP BY cp.ip, cp.port, cp.protocol
		)`, args...).Scan(&total); err != nil {
		return nil, err
	}

	// data query
	fullArgs := append(args, req.Limit, offset)
	rows, err := d.Query(`
		SELECT DISTINCT cp.ip, COALESCE(ch.mac, ''), COALESCE(ch.hostname, ''), COALESCE(ch.os, ''), COALESCE(ch.status, ''),
			   cp.port, cp.protocol, cp.state, cp.service, cp.version, cp.product, cp.extra_info,
			   cp.change_count, strftime('%Y-%m-%dT%H:%M:%SZ', cp.first_seen), strftime('%Y-%m-%dT%H:%M:%SZ', cp.last_seen), cp.last_scan_id,
			   COALESCE(cn.note, '')
		FROM consolidated_ports cp
		`+joins+` `+whereClause+`
		GROUP BY cp.ip, cp.port, cp.protocol
		ORDER BY cp.ip, cp.port LIMIT ? OFFSET ?`, fullArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []ConsolidatedPort
	for rows.Next() {
		var p ConsolidatedPort
		if err := rows.Scan(&p.IP, &p.MAC, &p.Hostname, &p.OS, &p.HostStatus, &p.Port, &p.Protocol, &p.State, &p.Service, &p.Version, &p.Product, &p.ExtraInfo, &p.ChangeCount, &p.FirstSeen, &p.LastSeen, &p.LastScanID, &p.NotePreview); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &PaginatedPorts{
		Ports: result,
		Total: total,
		Page:  req.Page,
		Limit: req.Limit,
	}, nil
}

func buildFilterClauses(filters []FilterQuery, args *[]interface{}, joinNeeded map[string]bool) []string {
	var wheres []string
	for _, f := range filters {
		meta, ok := consolidatedFields[f.Field]
		if !ok {
			continue
		}
		// mark table joins
		if meta.Table == "ch" {
			joinNeeded["ch"] = true
		}
		if meta.Table == "cn" {
			joinNeeded["cn"] = true
		}

		var clause string
		switch f.Op {
		case "eq":
			clause = meta.Column + " = ?"
			*args = append(*args, f.Value)
		case "neq":
			clause = meta.Column + " != ?"
			*args = append(*args, f.Value)
		case "contains":
			clause = meta.Column + " LIKE ?"
			*args = append(*args, "%"+f.Value+"%")
		case "begins_with":
			clause = meta.Column + " LIKE ?"
			*args = append(*args, f.Value+"%")
		case "ends_with":
			clause = meta.Column + " LIKE ?"
			*args = append(*args, "%"+f.Value)
		case "gt":
			clause = meta.Column + " > ?"
			*args = append(*args, f.Value)
		case "gte":
			clause = meta.Column + " >= ?"
			*args = append(*args, f.Value)
		case "lt":
			clause = meta.Column + " < ?"
			*args = append(*args, f.Value)
		case "lte":
			clause = meta.Column + " <= ?"
			*args = append(*args, f.Value)
		case "in":
			if len(f.Values) == 0 {
				continue
			}
			ph := make([]string, len(f.Values))
			for i, v := range f.Values {
				ph[i] = "?"
				*args = append(*args, v)
			}
			clause = meta.Column + " IN (" + strings.Join(ph, ",") + ")"
		case "not_in":
			if len(f.Values) == 0 {
				continue
			}
			ph := make([]string, len(f.Values))
			for i, v := range f.Values {
				ph[i] = "?"
				*args = append(*args, v)
			}
			clause = meta.Column + " NOT IN (" + strings.Join(ph, ",") + ")"
		case "between":
			if f.Min != nil && f.Max != nil {
				clause = meta.Column + " BETWEEN ? AND ?"
				*args = append(*args, *f.Min, *f.Max)
			}
		case "is_empty":
			clause = "(" + meta.Column + " = '' OR " + meta.Column + " IS NULL)"
		case "is_not_empty":
			clause = "(" + meta.Column + " != '' AND " + meta.Column + " IS NOT NULL)"
		}
		if clause != "" {
			wheres = append(wheres, clause)
		}
	}
	return wheres
}
