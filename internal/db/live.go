package db

func (d *DB) GetLiveHosts(projectID int) ([]LiveHost, error) {
	rows, err := d.Query(`
		SELECT DISTINCT h.ip,
			   COALESCE(NULLIF(lh.mac, ''), COALESCE(NULLIF(ch.mac, ''), COALESCE(h.mac, ''))),
			   COALESCE(NULLIF(lh.hostname, ''), COALESCE(NULLIF(ch.hostname, ''), COALESCE(h.hostname, ''))),
			   COALESCE(NULLIF(lh.os, ''), COALESCE(NULLIF(ch.os, ''), COALESCE(h.os, ''))),
			   COALESCE(NULLIF(lh.status, 'unknown'), COALESCE(NULLIF(ch.status, 'unknown'), COALESCE(h.status, 'unknown'))),
			   COALESCE(lh.discovery_methods, ch.discovery_methods, ''),
			   strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(lh.last_seen, s.started_at)),
			   COALESCE(lh.note, '')
		FROM hosts h
		JOIN scans s ON s.id = h.scan_id
		LEFT JOIN live_hosts lh ON lh.ip = h.ip
		LEFT JOIN consolidated_hosts ch ON ch.ip = h.ip
		WHERE s.project_id = ? AND s.confirmed = 1
		ORDER BY h.ip`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []LiveHost
	seen := make(map[string]bool)
	for rows.Next() {
		var h LiveHost
		if err := rows.Scan(&h.IP, &h.MAC, &h.Hostname, &h.OS, &h.Status, &h.DiscoveryMethods, &h.LastSeen, &h.Note); err != nil {
			return nil, err
		}
		if !seen[h.IP] {
			seen[h.IP] = true
			result = append(result, h)
		}
	}
	return result, nil
}

func (d *DB) UpdateLiveHostStatus(ip, status, note string) error {
	_, err := d.Exec(`
		UPDATE live_hosts SET status = ?, note = ?, last_seen = CURRENT_TIMESTAMP WHERE ip = ?`,
		status, note, ip)
	return err
}

func (d *DB) DeleteLiveHost(ip string) error {
	_, err := d.Exec("DELETE FROM live_hosts WHERE ip = ?", ip)
	return err
}

func (d *DB) UpdateLiveHostField(ip, field, value string) error {
	_, err := d.Exec("UPDATE live_hosts SET "+field+" = ?, last_seen = CURRENT_TIMESTAMP WHERE ip = ?", value, ip)
	return err
}

func (d *DB) GetLiveHostDetail(projectID int, ip string) (*LiveHost, error) {
	row := d.QueryRow(`
		SELECT DISTINCT h.ip,
			   COALESCE(NULLIF(lh.mac, ''), COALESCE(NULLIF(ch.mac, ''), COALESCE(h.mac, ''))),
			   COALESCE(NULLIF(lh.hostname, ''), COALESCE(NULLIF(ch.hostname, ''), COALESCE(h.hostname, ''))),
			   COALESCE(NULLIF(lh.os, ''), COALESCE(NULLIF(ch.os, ''), COALESCE(h.os, ''))),
			   COALESCE(NULLIF(lh.status, 'unknown'), COALESCE(NULLIF(ch.status, 'unknown'), COALESCE(h.status, 'unknown'))),
			   COALESCE(lh.discovery_methods, ch.discovery_methods, ''),
			   strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(lh.last_seen, s.started_at)),
			   COALESCE(lh.note, '')
		FROM hosts h
		JOIN scans s ON s.id = h.scan_id
		LEFT JOIN live_hosts lh ON lh.ip = h.ip
		LEFT JOIN consolidated_hosts ch ON ch.ip = h.ip
		WHERE s.project_id = ? AND s.confirmed = 1 AND h.ip = ?
		LIMIT 1`, projectID, ip)
	var h LiveHost
	if err := row.Scan(&h.IP, &h.MAC, &h.Hostname, &h.OS, &h.Status, &h.DiscoveryMethods, &h.LastSeen, &h.Note); err != nil {
		return nil, err
	}
	return &h, nil
}

func (d *DB) GetHostPorts(projectID int, ip string) ([]map[string]interface{}, error) {
	rows, err := d.Query(`
		SELECT cp.port, cp.protocol, cp.state, cp.service, cp.version, cp.product, cp.extra_info
		FROM consolidated_ports cp
		JOIN hosts h ON h.ip = cp.ip
		JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND cp.ip = ? AND cp.state = 'open' AND s.confirmed = 1
		GROUP BY cp.port, cp.protocol
		ORDER BY cp.port`, projectID, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {
		var port, state, protocol, service, version, product, extraInfo string
		if err := rows.Scan(&port, &protocol, &state, &service, &version, &product, &extraInfo); err != nil {
			return nil, err
		}
		result = append(result, map[string]interface{}{
			"port":       port,
			"protocol":   protocol,
			"state":      state,
			"service":    service,
			"version":    version,
			"product":    product,
			"extra_info": extraInfo,
		})
	}
	return result, nil
}

func (d *DB) GetHostScripts(projectID int, ip string) ([]map[string]interface{}, error) {
	rows, err := d.Query(`
		SELECT ps.script_id, COALESCE(MAX(ps.output), ''), 'port' as type, CAST(p.port AS TEXT), p.protocol
		FROM port_scripts ps
		JOIN hosts h ON h.id = ps.host_id
		JOIN ports p ON p.id = ps.port_id
		JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND h.ip = ? AND s.confirmed = 1
		GROUP BY ps.script_id, p.port, p.protocol
		UNION ALL
		SELECT hs.script_id, COALESCE(MAX(hs.output), ''), 'host' as type, '0', '' as protocol
		FROM host_scripts hs
		JOIN hosts h ON h.id = hs.host_id
		JOIN scans s ON s.id = h.scan_id
		WHERE s.project_id = ? AND h.ip = ? AND s.confirmed = 1
		GROUP BY hs.script_id
		ORDER BY 4, 1`, projectID, ip, projectID, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {
		var scriptID, output, scriptType, port, protocol string
		if err := rows.Scan(&scriptID, &output, &scriptType, &port, &protocol); err != nil {
			return nil, err
		}
		result = append(result, map[string]interface{}{
			"script_id": scriptID,
			"output":    output,
			"type":      scriptType,
			"port":      port,
			"protocol":  protocol,
		})
	}
	return result, nil
}

func (d *DB) GetHostScans(projectID int, ip string) ([]map[string]interface{}, error) {
	rows, err := d.Query(`
		SELECT s.id, s.profile, s.target, s.status, s.phase,
			   strftime('%Y-%m-%dT%H:%M:%SZ', s.started_at) as started_at,
			   strftime('%Y-%m-%dT%H:%M:%SZ', s.completed_at) as completed_at
		FROM scans s
		JOIN hosts h ON h.scan_id = s.id
		WHERE s.project_id = ? AND h.ip = ? AND s.confirmed = 1
		ORDER BY s.started_at DESC`, projectID, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]interface{}
	for rows.Next() {
		var id, profile, target, status, phase, startedAt string
		var completedAt *string
		if err := rows.Scan(&id, &profile, &target, &status, &phase, &startedAt, &completedAt); err != nil {
			return nil, err
		}
		r := map[string]interface{}{
			"id":         id,
			"profile":    profile,
			"target":     target,
			"status":     status,
			"phase":      phase,
			"started_at": startedAt,
		}
		if completedAt != nil {
			r["completed_at"] = *completedAt
		}
		result = append(result, r)
	}
	return result, nil
}
