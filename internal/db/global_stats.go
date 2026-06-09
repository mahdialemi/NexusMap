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

	return &s, nil
}
