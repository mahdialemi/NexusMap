package db

func (d *DB) GetGlobalStats() (*GlobalStats, error) {
	var s GlobalStats

	row := d.QueryRow(`
		SELECT
			COUNT(*) as total_projects,
			COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active_projects,
			COALESCE(SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END), 0) as archived_projects,
			COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_projects
		FROM projects
	`)
	if err := row.Scan(&s.TotalProjects, &s.ActiveProjects, &s.ArchivedProjects, &s.CompletedProjects); err != nil {
		return nil, err
	}

	row2 := d.QueryRow(`
		SELECT
			COUNT(*) as total_scans,
			COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) as running_scans,
			COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_scans,
			COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as failed_scans
		FROM scans
	`)
	if err := row2.Scan(&s.TotalScans, &s.RunningScans, &s.CompletedScans, &s.FailedScans); err != nil {
		return nil, err
	}

	row3 := d.QueryRow(`
		SELECT
			(SELECT COUNT(*) FROM consolidated_hosts) as total_hosts,
			(SELECT COUNT(*) FROM consolidated_ports) as total_ports,
			(SELECT COUNT(DISTINCT service) FROM consolidated_ports WHERE service IS NOT NULL AND service != '') as unique_services,
			(SELECT COUNT(*) FROM live_hosts) as total_live_hosts
	`)
	if err := row3.Scan(&s.TotalHosts, &s.TotalPorts, &s.UniqueServices, &s.TotalLiveHosts); err != nil {
		return nil, err
	}

	d.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT cp.ip, cp.port, cp.protocol
			FROM consolidated_ports cp
			WHERE cp.state = 'open'
			GROUP BY cp.ip, cp.port, cp.protocol
		)
	`).Scan(&s.OpenPortCount)

	d.QueryRow(`
		SELECT COUNT(*) FROM (
			SELECT cp.ip, cp.port, cp.protocol
			FROM consolidated_ports cp
			WHERE cp.state = 'open' AND cp.port IN (21,22,23,25,53,110,135,139,143,443,445,993,995,1433,1521,3306,3389,5432,5900,6379,8080,8443,27017)
			GROUP BY cp.ip, cp.port, cp.protocol
		)
	`).Scan(&s.HighRiskPortCount)

	// Scan activity last 30 days
	rowsSA, err := d.Query(`
		SELECT DATE(started_at) as day, COUNT(*) as cnt
		FROM scans WHERE status = 'completed'
		AND started_at >= DATE('now', '-30 days')
		GROUP BY DATE(started_at) ORDER BY day
	`)
	if err == nil {
		defer rowsSA.Close()
		for rowsSA.Next() {
			var dc DayCount
			if err := rowsSA.Scan(&dc.Date, &dc.Count); err == nil {
				s.ScanActivity = append(s.ScanActivity, dc)
			}
		}
	}
	if s.ScanActivity == nil {
		s.ScanActivity = []DayCount{}
	}

	// Top services
	rowsTS, err := d.Query(`
		SELECT cp.service, CAST(cp.port AS INTEGER) as port, COUNT(DISTINCT cp.ip) as cnt
		FROM consolidated_ports cp
		WHERE cp.state = 'open' AND cp.service != ''
		GROUP BY cp.service, cp.port ORDER BY cnt DESC LIMIT 10
	`)
	if err == nil {
		defer rowsTS.Close()
		for rowsTS.Next() {
			var sc ServiceCount
			if err := rowsTS.Scan(&sc.Service, &sc.Port, &sc.Count); err == nil {
				s.TopServices = append(s.TopServices, sc)
			}
		}
	}
	if s.TopServices == nil {
		s.TopServices = []ServiceCount{}
	}

	// Top ports
	rowsTP, err := d.Query(`
		SELECT CAST(cp.port AS INTEGER) as port, cp.protocol, cp.service, COUNT(DISTINCT cp.ip) as cnt
		FROM consolidated_ports cp
		WHERE cp.state = 'open'
		GROUP BY cp.port, cp.protocol, cp.service ORDER BY cnt DESC LIMIT 10
	`)
	if err == nil {
		defer rowsTP.Close()
		for rowsTP.Next() {
			var pc PortCount
			if err := rowsTP.Scan(&pc.Port, &pc.Protocol, &pc.Service, &pc.Count); err == nil {
				s.TopPorts = append(s.TopPorts, pc)
			}
		}
	}
	if s.TopPorts == nil {
		s.TopPorts = []PortCount{}
	}

	// Recent scans
	rowsRS, err := d.Query(`
		SELECT s.id, s.project_id, s.profile, s.target, s.status, s.started_at, s.completed_at, p.name
		FROM scans s
		LEFT JOIN projects p ON p.id = s.project_id
		ORDER BY s.started_at DESC LIMIT 10
	`)
	if err == nil {
		defer rowsRS.Close()
		for rowsRS.Next() {
			var sc Scan
			var pName string
			if err := rowsRS.Scan(&sc.ID, &sc.ProjectID, &sc.Profile, &sc.Target, &sc.Status, &sc.StartedAt, &sc.CompletedAt, &pName); err == nil {
				sc.Target = pName + " / " + sc.Target
				s.RecentScans = append(s.RecentScans, sc)
			}
		}
	}
	if s.RecentScans == nil {
		s.RecentScans = []Scan{}
	}

	// Scan status breakdown
	s.ScanStatusBreakdown = make(map[string]int)
	for _, st := range []string{"running", "completed", "error", "pending", "cancelled"} {
		var cnt int
		d.QueryRow("SELECT COUNT(*) FROM scans WHERE status = ?", st).Scan(&cnt)
		s.ScanStatusBreakdown[st] = cnt
	}

	// Port state breakdown
	s.PortStateBreakdown = make(map[string]int)
	for _, st := range []string{"open", "closed", "filtered"} {
		var cnt int
		d.QueryRow("SELECT COUNT(*) FROM consolidated_ports WHERE state = ?", st).Scan(&cnt)
		s.PortStateBreakdown[st] = cnt
	}

	// Top OS
	rowsOS, err := d.Query(`
		SELECT os, COUNT(*) as cnt FROM consolidated_hosts
		WHERE os IS NOT NULL AND os != ''
		GROUP BY os ORDER BY cnt DESC LIMIT 8
	`)
	if err == nil {
		defer rowsOS.Close()
		for rowsOS.Next() {
			var oc OSCount
			if err := rowsOS.Scan(&oc.OS, &oc.Count); err == nil {
				s.TopOS = append(s.TopOS, oc)
			}
		}
	}
	if s.TopOS == nil {
		s.TopOS = []OSCount{}
	}

	// Projects by priority
	s.ProjectsByPriority = make(map[string]int)
	for _, pr := range []string{"critical", "high", "medium", "low"} {
		var cnt int
		d.QueryRow("SELECT COUNT(*) FROM projects WHERE priority = ?", pr).Scan(&cnt)
		s.ProjectsByPriority[pr] = cnt
	}

	// Scans per project
	rowsSP, err := d.Query(`
		SELECT s.project_id, p.name, COUNT(*) as cnt
		FROM scans s
		LEFT JOIN projects p ON p.id = s.project_id
		GROUP BY s.project_id ORDER BY cnt DESC LIMIT 10
	`)
	if err == nil {
		defer rowsSP.Close()
		for rowsSP.Next() {
			var psc ProjectScanCount
			if err := rowsSP.Scan(&psc.ProjectID, &psc.ProjectName, &psc.Count); err == nil {
				s.ScansPerProject = append(s.ScansPerProject, psc)
			}
		}
	}
	if s.ScansPerProject == nil {
		s.ScansPerProject = []ProjectScanCount{}
	}

	// Recent activity
	rowsRA, err := d.Query(`
		SELECT id, action, details, username, created_at
		FROM activity_log ORDER BY created_at DESC LIMIT 10
	`)
	if err == nil {
		defer rowsRA.Close()
		for rowsRA.Next() {
			var ae ActivityEntry
			if err := rowsRA.Scan(&ae.ID, &ae.Action, &ae.Details, &ae.Username, &ae.CreatedAt); err == nil {
				s.RecentActivity = append(s.RecentActivity, ae)
			}
		}
	}
	if s.RecentActivity == nil {
		s.RecentActivity = []ActivityEntry{}
	}

	return &s, nil
}
