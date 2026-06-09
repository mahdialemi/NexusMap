package db

func (d *DB) GetScanScripts(scanID int) ([]PortScript, []HostScript, error) {
	psRows, err := d.Query(`
		SELECT ps.id, ps.host_id, ps.port_id, ps.script_id, ps.output
		FROM port_scripts ps
		JOIN ports p ON p.id = ps.port_id
		JOIN hosts h ON h.id = ps.host_id
		WHERE h.scan_id = ?
		ORDER BY h.ip, p.port, ps.script_id`, scanID)
	if err != nil {
		return nil, nil, err
	}
	defer psRows.Close()

	var portScripts []PortScript
	for psRows.Next() {
		var ps PortScript
		if err := psRows.Scan(&ps.ID, &ps.HostID, &ps.PortID, &ps.ScriptID, &ps.Output); err != nil {
			return nil, nil, err
		}
		portScripts = append(portScripts, ps)
	}
	if err := psRows.Err(); err != nil {
		return nil, nil, err
	}

	hsRows, err := d.Query(`
		SELECT hs.id, hs.host_id, hs.script_id, hs.output
		FROM host_scripts hs
		JOIN hosts h ON h.id = hs.host_id
		WHERE h.scan_id = ?
		ORDER BY h.ip, hs.script_id`, scanID)
	if err != nil {
		return nil, nil, err
	}
	defer hsRows.Close()

	var hostScripts []HostScript
	for hsRows.Next() {
		var hs HostScript
		if err := hsRows.Scan(&hs.ID, &hs.HostID, &hs.ScriptID, &hs.Output); err != nil {
			return nil, nil, err
		}
		hostScripts = append(hostScripts, hs)
	}
	if err := hsRows.Err(); err != nil {
		return nil, nil, err
	}

	return portScripts, hostScripts, nil
}

func (d *DB) GetScanScriptsForExport(scanID int) ([]ScanScriptExport, error) {
	rows, err := d.Query(`
		SELECT h.ip, p.port, p.protocol, p.service, p.state, ps.script_id, ps.output, 'port' as type
		FROM port_scripts ps
		JOIN ports p ON p.id = ps.port_id
		JOIN hosts h ON h.id = ps.host_id
		WHERE h.scan_id = ?
		UNION ALL
		SELECT h.ip, 0, '', '', '', hs.script_id, hs.output, 'host' as type
		FROM host_scripts hs
		JOIN hosts h ON h.id = hs.host_id
		WHERE h.scan_id = ?
		ORDER BY ip, port, script_id`, scanID, scanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scripts []ScanScriptExport
	for rows.Next() {
		var s ScanScriptExport
		if err := rows.Scan(&s.IP, &s.Port, &s.Protocol, &s.Service, &s.State, &s.ScriptID, &s.Output, &s.Type); err != nil {
			return nil, err
		}
		scripts = append(scripts, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scripts, nil
}

func (d *DB) GetPortScriptsByHostIP(ip string) ([]PortScript, error) {
	rows, err := d.Query(`
		SELECT ps.id, ps.host_id, ps.port_id, ps.script_id, ps.output
		FROM port_scripts ps
		JOIN hosts h ON h.id = ps.host_id
		WHERE h.ip = ?
		ORDER BY ps.script_id`, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scripts []PortScript
	for rows.Next() {
		var ps PortScript
		if err := rows.Scan(&ps.ID, &ps.HostID, &ps.PortID, &ps.ScriptID, &ps.Output); err != nil {
			return nil, err
		}
		scripts = append(scripts, ps)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scripts, nil
}

func (d *DB) GetHostScriptsByHostIP(ip string) ([]HostScript, error) {
	rows, err := d.Query(`
		SELECT hs.id, hs.host_id, hs.script_id, hs.output
		FROM host_scripts hs
		JOIN hosts h ON h.id = hs.host_id
		WHERE h.ip = ?
		ORDER BY hs.script_id`, ip)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scripts []HostScript
	for rows.Next() {
		var hs HostScript
		if err := rows.Scan(&hs.ID, &hs.HostID, &hs.ScriptID, &hs.Output); err != nil {
			return nil, err
		}
		scripts = append(scripts, hs)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return scripts, nil
}

func (d *DB) GetConsolidatedScriptsPaged(projectID, page, limit int, search string) (*PaginatedScripts, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 50
	}
	offset := (page - 1) * limit

	baseQuery := `
		FROM port_scripts ps3
		JOIN hosts h3 ON h3.id = ps3.host_id
		JOIN ports p3 ON p3.id = ps3.port_id
		JOIN scans s3 ON s3.id = h3.scan_id AND s3.project_id = ?`

	whereClause := ""
	countArgs := []interface{}{projectID}
	queryArgs := []interface{}{projectID}
	if search != "" {
		whereClause = " AND (h3.ip LIKE ? OR ps3.script_id LIKE ? OR p3.port LIKE ?)"
		searchArgs := []interface{}{"%" + search + "%", "%" + search + "%", "%" + search + "%"}
		countArgs = append(countArgs, searchArgs...)
	}

	var total int
	if err := d.QueryRow(`SELECT COUNT(*) FROM (SELECT 1`+baseQuery+whereClause+`
		GROUP BY h3.ip, p3.port, p3.protocol, ps3.script_id)`, countArgs...).Scan(&total); err != nil {
		return nil, err
	}

	if search != "" {
		queryArgs = append(queryArgs, "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}
	queryArgs = append(queryArgs, limit, offset)

	var searchWhere string
	if search != "" {
		searchWhere = " WHERE h3.ip LIKE ? OR ps3.script_id LIKE ? OR p3.port LIKE ?"
	}

	rows, err := d.Query(`
		SELECT dedup.ip, dedup.port, dedup.protocol,
			COALESCE(cp.service, ''), COALESCE(cp.state, ''),
			dedup.script_id, dedup.output, COALESCE(cp.extra_info, '')
		FROM (
			SELECT h3.ip, p3.port, p3.protocol, ps3.script_id, ps3.output,
				ROW_NUMBER() OVER (
					PARTITION BY h3.ip, p3.port, p3.protocol, ps3.script_id
					ORDER BY ps3.id DESC
				) as rn
			FROM port_scripts ps3
			JOIN hosts h3 ON h3.id = ps3.host_id
			JOIN ports p3 ON p3.id = ps3.port_id
			JOIN scans s3 ON s3.id = h3.scan_id AND s3.project_id = ?`+searchWhere+`
		) dedup
		LEFT JOIN consolidated_ports cp ON cp.ip = dedup.ip AND cp.port = dedup.port AND cp.protocol = dedup.protocol
		WHERE dedup.rn = 1
		ORDER BY dedup.ip, dedup.port, dedup.script_id
		LIMIT ? OFFSET ?`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scripts []ConsolidatedScript
	for rows.Next() {
		var cs ConsolidatedScript
		if err := rows.Scan(&cs.IP, &cs.Port, &cs.Protocol, &cs.Service, &cs.State, &cs.ScriptID, &cs.Output, &cs.ExtraInfo); err != nil {
			return nil, err
		}
		scripts = append(scripts, cs)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &PaginatedScripts{Scripts: scripts, Total: total, Page: page, Limit: limit}, nil
}

func (d *DB) GetConsolidatedScripts(projectID int) ([]ConsolidatedScript, error) {
	result, err := d.GetConsolidatedScriptsPaged(projectID, 1, 100000, "")
	if err != nil {
		return nil, err
	}
	return result.Scripts, nil
}

func (d *DB) DeleteScanScripts(scanID int) error {
	_, err := d.Exec(`
		DELETE FROM port_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)`, scanID)
	if err != nil {
		return err
	}
	_, err = d.Exec(`
		DELETE FROM host_scripts WHERE host_id IN (SELECT id FROM hosts WHERE scan_id = ?)`, scanID)
	return err
}
