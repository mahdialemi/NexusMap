package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

func (d *DB) SaveResults(scanID int, hosts []Host, ports []Port) (map[string]int64, map[string]int64, error) {
	tx, err := d.Begin()
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()

	stmtHost, err := tx.Prepare("INSERT INTO hosts (scan_id, ip, mac, hostname, os, status, vendor, original_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		return nil, nil, err
	}
	defer stmtHost.Close()

	stmtPort, err := tx.Prepare("INSERT INTO ports (host_id, port, protocol, state, service, version, extra_info, cpe, product, reason, original_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		return nil, nil, err
	}
	defer stmtPort.Close()

	hostMap := make(map[string]int64)
	for _, h := range hosts {
		originalJSON, _ := json.Marshal(h)
		result, err := stmtHost.Exec(scanID, h.IP, h.MAC, h.Hostname, h.OS, h.Status, h.Vendor, string(originalJSON))
		if err != nil {
			return nil, nil, err
		}
		hid, _ := result.LastInsertId()
		hostMap[h.IP] = hid
	}

	portMap := make(map[string]int64)
	seenPorts := make(map[string]bool)
	for _, p := range ports {
		hid, ok := hostMap[p.IP]
		if !ok {
			continue
		}
		key := fmt.Sprintf("%s:%d:%s", p.IP, p.Port, p.Protocol)
		if seenPorts[key] {
			continue
		}
		seenPorts[key] = true
		originalJSON, _ := json.Marshal(p)
		if _, err := stmtPort.Exec(hid, p.Port, p.Protocol, p.State, p.Service, p.Version, p.ExtraInfo, p.CPE, p.Product, p.Reason, string(originalJSON)); err != nil {
			return nil, nil, err
		}
		portMap[key] = hid
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	return hostMap, portMap, nil
}

func (d *DB) SavePortScripts(hostMap map[string]int64, portScripts []PortScript) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("INSERT INTO port_scripts (host_id, port_id, script_id, output) VALUES (?, ?, ?, ?)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, ps := range portScripts {
		hid, ok := hostMap[ps.IP]
		if !ok {
			continue
		}
		var pid int64
		row := tx.QueryRow("SELECT id FROM ports WHERE host_id = ? AND port = ? AND protocol = ? LIMIT 1", hid, ps.Port, ps.Protocol)
		if err := row.Scan(&pid); err != nil {
			continue
		}
		if _, err := stmt.Exec(hid, pid, ps.ScriptID, ps.Output); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *DB) SaveHostScripts(hostMap map[string]int64, hostScripts []HostScript) error {
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("INSERT INTO host_scripts (host_id, script_id, output) VALUES (?, ?, ?)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, hs := range hostScripts {
		hid, ok := hostMap[hs.IP]
		if !ok {
			continue
		}
		if _, err := stmt.Exec(hid, hs.ScriptID, hs.Output); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *DB) GetResults(scanID int) ([]ResultRow, error) {
	rows, err := d.Query(`
		SELECT h.id as host_id, p.id as port_id, h.ip, h.mac, h.hostname, h.os, h.status,
			p.port, p.protocol, p.state, p.service, p.version, p.extra_info, p.product, p.reason, p.is_modified
		FROM ports p
		JOIN hosts h ON p.host_id = h.id
		WHERE h.scan_id = ?
		ORDER BY h.ip, p.port`, scanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []ResultRow{}
	for rows.Next() {
		var r ResultRow
		if err := rows.Scan(&r.HostID, &r.PortID, &r.IP, &r.MAC, &r.Hostname, &r.OS, &r.HostStatus,
			&r.Port, &r.Protocol, &r.State, &r.Service, &r.Version, &r.ExtraInfo, &r.Product, &r.Reason, &r.IsModified); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, nil
}

func (d *DB) GetResultsPaginated(scanID, page, limit int) (*PaginatedResults, error) {
	var total int
	err := d.QueryRow("SELECT COUNT(*) FROM ports p JOIN hosts h ON p.host_id = h.id WHERE h.scan_id = ?", scanID).Scan(&total)
	if err != nil {
		return nil, err
	}

	offset := (page - 1) * limit
	rows, err := d.Query(`
		SELECT h.id as host_id, p.id as port_id, h.ip, h.mac, h.hostname, h.os, h.status,
			p.port, p.protocol, p.state, p.service, p.version, p.extra_info, p.product, p.reason, p.is_modified
		FROM ports p
		JOIN hosts h ON p.host_id = h.id
		WHERE h.scan_id = ?
		ORDER BY h.ip, p.port
		LIMIT ? OFFSET ?`, scanID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []ResultRow{}
	for rows.Next() {
		var r ResultRow
		if err := rows.Scan(&r.HostID, &r.PortID, &r.IP, &r.MAC, &r.Hostname, &r.OS, &r.HostStatus,
			&r.Port, &r.Protocol, &r.State, &r.Service, &r.Version, &r.ExtraInfo, &r.Product, &r.Reason, &r.IsModified); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return &PaginatedResults{Results: results, Total: total, Page: page, Limit: limit}, nil
}

func (d *DB) UpdateResultField(table string, id int, field string, value string) error {
	validTables := map[string]bool{"hosts": true, "ports": true}
	if !validTables[table] {
		return fmt.Errorf("invalid table: %s", table)
	}
	validFields := map[string]bool{
		"ip": true, "mac": true, "hostname": true, "os": true, "status": true, "note": true, "vendor": true,
		"port": true, "protocol": true, "state": true, "service": true, "version": true, "extra_info": true,
		"cpe": true, "product": true, "reason": true,
	}
	if !validFields[field] {
		return fmt.Errorf("invalid field: %s", field)
	}
	query := fmt.Sprintf("UPDATE %s SET %s = ?, is_modified = 1 WHERE id = ?", table, field)
	_, err := d.Exec(query, value, id)
	return err
}

func (d *DB) RevertResultField(table string, id int, field string) error {
	validTables := map[string]bool{"hosts": true, "ports": true}
	if !validTables[table] {
		return fmt.Errorf("invalid table: %s", table)
	}
	validFields := map[string]bool{
		"ip": true, "mac": true, "hostname": true, "os": true, "status": true, "note": true, "vendor": true,
		"port": true, "protocol": true, "state": true, "service": true, "version": true, "extra_info": true,
		"cpe": true, "product": true, "reason": true,
	}
	if !validFields[field] {
		return fmt.Errorf("invalid field: %s", field)
	}
	query := fmt.Sprintf("SELECT original_data FROM %s WHERE id = ?", table)
	var originalJSON sql.NullString
	if err := d.QueryRow(query, id).Scan(&originalJSON); err != nil {
		return err
	}
	if !originalJSON.Valid {
		return fmt.Errorf("no original data found")
	}

	var data map[string]interface{}
	if err := json.Unmarshal([]byte(originalJSON.String), &data); err != nil {
		return err
	}

	origValue, ok := data[field]
	if !ok {
		return fmt.Errorf("field %s not in original data", field)
	}

	var strVal string
	switch v := origValue.(type) {
	case string:
		strVal = v
	case float64:
		strVal = fmt.Sprintf("%.0f", v)
	default:
		strVal = fmt.Sprintf("%v", v)
	}

	query = fmt.Sprintf("UPDATE %s SET %s = ? WHERE id = ?", table, field)
	_, err := d.Exec(query, strVal, id)
	return err
}

func (d *DB) AddPort(hostID int, port int, protocol, state, service, version string) error {
	_, err := d.Exec(
		"INSERT INTO ports (host_id, port, protocol, state, service, version, is_modified) VALUES (?, ?, ?, ?, ?, ?, 1)",
		hostID, port, protocol, state, service, version,
	)
	return err
}

func (d *DB) DeletePort(id int) error {
	_, err := d.Exec("DELETE FROM ports WHERE id = ?", id)
	return err
}

func (d *DB) DeleteHost(id int) error {
	_, err := d.Exec("DELETE FROM hosts WHERE id = ?", id)
	return err
}

func (d *DB) BulkUpdatePorts(ids []int, field string, value string) error {
	if len(ids) == 0 {
		return nil
	}
	validFields := map[string]bool{
		"state": true, "service": true, "version": true, "extra_info": true, "product": true, "reason": true, "note": true,
	}
	if !validFields[field] {
		return fmt.Errorf("invalid bulk field: %s", field)
	}
	query := fmt.Sprintf("UPDATE ports SET %s = ?, is_modified = 1 WHERE id IN (", field)
	for i := range ids {
		if i > 0 {
			query += ","
		}
		query += "?"
	}
	query += ")"
	args := make([]interface{}, 0, len(ids)+1)
	args = append(args, value)
	for _, id := range ids {
		args = append(args, id)
	}
	_, err := d.Exec(query, args...)
	return err
}

func (d *DB) GetHostsForScan(scanID int) ([]Host, error) {
	rows, err := d.Query("SELECT id, scan_id, ip, mac, hostname, os, status, vendor, note FROM hosts WHERE scan_id = ?", scanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var hosts []Host
	for rows.Next() {
		var h Host
		if err := rows.Scan(&h.ID, &h.ScanID, &h.IP, &h.MAC, &h.Hostname, &h.OS, &h.Status, &h.Vendor, &h.Note); err != nil {
			return nil, err
		}
		hosts = append(hosts, h)
	}
	return hosts, nil
}

func (d *DB) GetPortsForHost(hostID int) ([]Port, error) {
	rows, err := d.Query("SELECT id, host_id, port, protocol, state, service, version, extra_info, cpe, product, reason, note, is_modified FROM ports WHERE host_id = ? ORDER BY port", hostID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ports []Port
	for rows.Next() {
		var p Port
		if err := rows.Scan(&p.ID, &p.HostID, &p.Port, &p.Protocol, &p.State, &p.Service, &p.Version, &p.ExtraInfo, &p.CPE, &p.Product, &p.Reason, &p.Note, &p.IsModified); err != nil {
			return nil, err
		}
		ports = append(ports, p)
	}
	return ports, nil
}

func (d *DB) GetHostPortMapForScan(scanID int) (map[string]int64, map[string]int64) {
	hostMap := make(map[string]int64)
	portMap := make(map[string]int64)
	rows, err := d.Query("SELECT id, ip FROM hosts WHERE scan_id = ?", scanID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var ip string
			if err := rows.Scan(&id, &ip); err != nil {
				return hostMap, portMap
			}
			hostMap[ip] = id
		}
		if err := rows.Err(); err != nil {
			return hostMap, portMap
		}
	}

	portMap = make(map[string]int64)
	rows2, err := d.Query("SELECT id, host_id, port, protocol FROM ports WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)", scanID)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var id, hostID int64
			var port int
			var protocol string
			if err := rows2.Scan(&id, &hostID, &port, &protocol); err != nil {
				return hostMap, portMap
			}
			for ip, hid := range hostMap {
				if hid == hostID {
					portMap[fmt.Sprintf("%s:%d:%s", ip, port, protocol)] = id
					break
				}
			}
		}
		if err := rows2.Err(); err != nil {
			return hostMap, portMap
		}
	}
	return hostMap, portMap
}

func (d *DB) BackfillScripts(scanID int, portScripts []PortScript, hostScripts []HostScript) (int, int, error) {
	hostMap, _ := d.GetHostPortMapForScan(scanID)
	if len(hostMap) == 0 {
		return 0, 0, fmt.Errorf("no hosts for scan %d", scanID)
	}

	psCount := 0
	if len(portScripts) > 0 {
		d.SavePortScripts(hostMap, portScripts)
		psCount = len(portScripts)
	}

	hsCount := 0
	if len(hostScripts) > 0 {
		d.SaveHostScripts(hostMap, hostScripts)
		hsCount = len(hostScripts)
	}

	return psCount, hsCount, nil
}
