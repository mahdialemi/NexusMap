package db

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
	DBPath string
}

func New(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_busy_timeout=5000&_cache_size=-8192&_foreign_keys=ON&_synchronous=NORMAL&_mmap_size=268435456")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA cache_size=-8192",
		"PRAGMA foreign_keys=ON",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA mmap_size=268435456",
		"PRAGMA temp_store=MEMORY",
	} {
		if _, err := conn.Exec(pragma); err != nil {
			log.Printf("db pragma %s: %v", pragma, err)
		}
	}
	conn.SetMaxOpenConns(12)
	conn.SetMaxIdleConns(4)
	conn.SetConnMaxLifetime(30 * time.Minute)
	return &DB{conn, dbPath}, nil
}

func (d *DB) Init() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'user',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			must_change_password INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			csrf_token TEXT DEFAULT '',
			created_at TEXT DEFAULT (datetime('now')),
			last_active TEXT DEFAULT (datetime('now')),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`ALTER TABLE sessions ADD COLUMN csrf_token TEXT DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS password_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS projects (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS scans (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id INTEGER NOT NULL,
			profile TEXT NOT NULL DEFAULT 'custom',
			target TEXT NOT NULL,
			nmap_command TEXT NOT NULL DEFAULT '',
			raw_xml TEXT DEFAULT '',
			output_dir TEXT DEFAULT '',
			status TEXT NOT NULL DEFAULT 'running',
			confirmed INTEGER DEFAULT 0,
			progress INTEGER DEFAULT 0,
			note TEXT DEFAULT '',
			started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			completed_at DATETIME,
			FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS hosts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			scan_id INTEGER NOT NULL,
			ip TEXT NOT NULL,
			mac TEXT DEFAULT '',
			hostname TEXT DEFAULT '',
			os TEXT DEFAULT '',
			status TEXT DEFAULT 'unknown',
			vendor TEXT DEFAULT '',
			note TEXT DEFAULT '',
			original_data TEXT DEFAULT '',
			is_modified INTEGER DEFAULT 0,
			FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS ports (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			host_id INTEGER NOT NULL,
			port INTEGER NOT NULL,
			protocol TEXT NOT NULL DEFAULT 'tcp',
			state TEXT NOT NULL DEFAULT 'unknown',
			service TEXT DEFAULT '',
			version TEXT DEFAULT '',
			extra_info TEXT DEFAULT '',
			cpe TEXT DEFAULT '',
			product TEXT DEFAULT '',
			reason TEXT DEFAULT '',
			note TEXT DEFAULT '',
			original_data TEXT DEFAULT '',
			is_modified INTEGER DEFAULT 0,
			FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS consolidated_hosts (
			ip TEXT PRIMARY KEY,
			mac TEXT DEFAULT '',
			hostname TEXT DEFAULT '',
			os TEXT DEFAULT '',
			status TEXT DEFAULT 'unknown',
			discovery_methods TEXT DEFAULT '',
			first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_scan_id INTEGER DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS consolidated_ports (
			ip TEXT NOT NULL,
			port INTEGER NOT NULL,
			protocol TEXT NOT NULL DEFAULT 'tcp',
			state TEXT NOT NULL DEFAULT 'unknown',
			service TEXT DEFAULT '',
			version TEXT DEFAULT '',
			product TEXT DEFAULT '',
			extra_info TEXT DEFAULT '',
			change_count INTEGER DEFAULT 1,
			first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_scan_id INTEGER DEFAULT 0,
			PRIMARY KEY (ip, port, protocol)
		)`,
		`CREATE TABLE IF NOT EXISTS live_hosts (
			ip TEXT PRIMARY KEY,
			mac TEXT DEFAULT '',
			hostname TEXT DEFAULT '',
			os TEXT DEFAULT '',
			status TEXT DEFAULT 'unknown',
			discovery_methods TEXT DEFAULT '',
			last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
			note TEXT DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS login_attempts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			ip TEXT DEFAULT '',
			attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			success INTEGER DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_hosts_scan ON hosts(scan_id)`,
		`CREATE INDEX IF NOT EXISTS idx_ports_host ON ports(host_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_ports_ip ON consolidated_ports(ip)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_ports_state ON consolidated_ports(state)`,
		`ALTER TABLE scans ADD COLUMN confirmed INTEGER DEFAULT 0`,
		`CREATE TABLE IF NOT EXISTS consolidated_edits (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ip TEXT NOT NULL,
			port INTEGER NOT NULL,
			protocol TEXT NOT NULL DEFAULT 'tcp',
			field TEXT NOT NULL,
			old_value TEXT DEFAULT '',
			new_value TEXT DEFAULT '',
			applied INTEGER DEFAULT 1,
			edited_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_edits_ip ON consolidated_edits(ip, port, protocol)`,
		`ALTER TABLE consolidated_edits ADD COLUMN applied INTEGER DEFAULT 1`,
		`CREATE TABLE IF NOT EXISTS port_scripts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			host_id INTEGER NOT NULL,
			port_id INTEGER NOT NULL,
			script_id TEXT NOT NULL,
			output TEXT DEFAULT '',
			FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE,
			FOREIGN KEY (port_id) REFERENCES ports(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS host_scripts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			host_id INTEGER NOT NULL,
			script_id TEXT NOT NULL,
			output TEXT DEFAULT '',
			FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_port_scripts_host ON port_scripts(host_id)`,
		`CREATE INDEX IF NOT EXISTS idx_host_scripts_host ON host_scripts(host_id)`,
		`CREATE INDEX IF NOT EXISTS idx_hosts_ip ON hosts(ip)`,
		`CREATE INDEX IF NOT EXISTS idx_hosts_scan_ip ON hosts(scan_id, ip)`,
		`CREATE INDEX IF NOT EXISTS idx_ports_port ON ports(port, protocol)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_ports_service ON consolidated_ports(service)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_ports_ip_state ON consolidated_ports(ip, state)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_ports_last_seen ON consolidated_ports(last_seen)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_hosts_ip ON consolidated_hosts(ip)`,
		`CREATE INDEX IF NOT EXISTS idx_scans_status_project ON scans(status, project_id)`,
		`CREATE INDEX IF NOT EXISTS idx_scans_project_started ON scans(project_id, started_at)`,
		`CREATE INDEX IF NOT EXISTS idx_live_hosts_ip ON live_hosts(ip)`,
		`CREATE INDEX IF NOT EXISTS idx_port_scripts_port ON port_scripts(port_id)`,
		`CREATE INDEX IF NOT EXISTS idx_port_scripts_scan ON port_scripts(host_id, port_id)`,
		`CREATE INDEX IF NOT EXISTS idx_consolidated_edits_ip_field ON consolidated_edits(ip, field)`,
		`CREATE TABLE IF NOT EXISTS activity_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			action TEXT NOT NULL,
			details TEXT DEFAULT '',
			username TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at)`,
		`ALTER TABLE scans ADD COLUMN raw_nmap TEXT DEFAULT ''`,
		`ALTER TABLE scans ADD COLUMN raw_gnmap TEXT DEFAULT ''`,
		`ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active'`,
		`ALTER TABLE projects ADD COLUMN priority TEXT DEFAULT 'medium'`,
		`ALTER TABLE projects ADD COLUMN tags TEXT DEFAULT ''`,
		`ALTER TABLE projects ADD COLUMN client TEXT DEFAULT ''`,
		`ALTER TABLE projects ADD COLUMN owner_id INTEGER REFERENCES users(id)`,
		`ALTER TABLE projects ADD COLUMN due_date TEXT`,
		`ALTER TABLE projects ADD COLUMN updated_at DATETIME`,
		`ALTER TABLE scans ADD COLUMN phase TEXT DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS profiles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT DEFAULT '',
			command TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT 'Custom',
			sort_order INTEGER DEFAULT 0,
			is_builtin INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS consolidated_notes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			ip TEXT NOT NULL,
			port INTEGER NOT NULL,
			protocol TEXT NOT NULL DEFAULT 'tcp',
			note TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(ip, port, protocol)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)`,
		`CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempted_at)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active)`,
		`CREATE INDEX IF NOT EXISTS idx_scans_completed ON scans(completed_at)`,
		`CREATE INDEX IF NOT EXISTS idx_hosts_ip_scan ON hosts(ip, scan_id)`,
		`ALTER TABLE consolidated_ports ADD COLUMN label TEXT DEFAULT ''`,
		`ALTER TABLE consolidated_hosts ADD COLUMN label TEXT DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS scan_schedules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id INTEGER NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			profile TEXT NOT NULL DEFAULT 'custom',
			target TEXT NOT NULL,
			interval_minutes INTEGER NOT NULL DEFAULT 60,
			next_run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_run_at DATETIME,
			enabled INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
		)`,
		`ALTER TABLE scan_schedules ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'time'`,
		`ALTER TABLE scan_schedules ADD COLUMN scheduled_at DATETIME`,
		`ALTER TABLE scan_schedules ADD COLUMN depends_on_scan_id INTEGER REFERENCES scans(id) ON DELETE SET NULL`,
		`ALTER TABLE scan_schedules ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`,
		`CREATE TABLE IF NOT EXISTS migration_flags (
			name TEXT PRIMARY KEY,
			applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`ALTER TABLE scans ADD COLUMN schedule_id INTEGER REFERENCES scan_schedules(id) ON DELETE SET NULL`,
		`ALTER TABLE projects ADD COLUMN is_pinned INTEGER DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'`,
		`ALTER TABLE users ADD COLUMN lang TEXT DEFAULT 'en'`,
	}

	for i, sql := range migrations {
		if _, err := d.Exec(sql); err != nil {
			if strings.Contains(sql, "ALTER TABLE") {
				continue
			}
			return fmt.Errorf("migration %d: %w", i, err)
		}
	}

	// Orphan cleanup — runs every startup
	for _, q := range []string{
		"DELETE FROM consolidated_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_hosts.ip)",
		"DELETE FROM consolidated_ports WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_ports.ip)",
		"DELETE FROM live_hosts WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = live_hosts.ip)",
		"DELETE FROM consolidated_notes WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_notes.ip)",
		"DELETE FROM consolidated_edits WHERE NOT EXISTS (SELECT 1 FROM hosts WHERE hosts.ip = consolidated_edits.ip)",
	} {
		d.Exec(q) // ignore errors
	}

	// Run structural migrations (PK recreation, dedup, unique indexes) only once
	var dedupDone int
	d.QueryRow("SELECT 1 FROM migration_flags WHERE name = 'dedup_v2'").Scan(&dedupDone)

	if dedupDone == 0 {
		// Check and recreate consolidated_ports if PRIMARY KEY is missing
		var createSQL string
		if pErr := d.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='consolidated_ports'").Scan(&createSQL); pErr != nil {
			log.Printf("Error checking consolidated_ports schema: %v", pErr)
		} else if createSQL != "" && !containsIgnoreCase(createSQL, "primary key") {
			log.Printf("consolidated_ports PRIMARY KEY missing, recreating...")
			if _, pErr := d.Exec(`
				CREATE TABLE consolidated_ports_new (
					ip TEXT NOT NULL,
					port INTEGER NOT NULL,
					protocol TEXT NOT NULL DEFAULT 'tcp',
					state TEXT NOT NULL DEFAULT 'unknown',
					service TEXT DEFAULT '',
					version TEXT DEFAULT '',
					product TEXT DEFAULT '',
					extra_info TEXT DEFAULT '',
					change_count INTEGER DEFAULT 1,
					first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
					last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
					last_scan_id INTEGER DEFAULT 0,
					PRIMARY KEY (ip, port, protocol)
				)
			`); pErr == nil {
				if _, pErr := d.Exec(`
					INSERT OR IGNORE INTO consolidated_ports_new
					SELECT ip, port, protocol, state, service, version, product, extra_info, change_count, first_seen, last_seen, last_scan_id
					FROM consolidated_ports
					GROUP BY ip, port, protocol
				`); pErr == nil {
					_, _ = d.Exec("DROP TABLE consolidated_ports")
					_, _ = d.Exec("ALTER TABLE consolidated_ports_new RENAME TO consolidated_ports")
					log.Printf("consolidated_ports recreated with proper PRIMARY KEY")
				}
			}
		}

		// Deduplicate consolidated_ports
		var totalRows, distinctRows int
		if pErr := d.QueryRow("SELECT COUNT(*) FROM consolidated_ports").Scan(&totalRows); pErr == nil {
			if pErr := d.QueryRow("SELECT COUNT(*) FROM (SELECT ip, port, protocol FROM consolidated_ports GROUP BY ip, port, protocol)").Scan(&distinctRows); pErr == nil {
				if dupCount := totalRows - distinctRows; dupCount > 0 {
					if _, pErr := d.Exec(`
						CREATE TABLE consolidated_ports_new (
							ip TEXT NOT NULL,
							port INTEGER NOT NULL,
							protocol TEXT NOT NULL DEFAULT 'tcp',
							state TEXT NOT NULL DEFAULT 'unknown',
							service TEXT DEFAULT '',
							version TEXT DEFAULT '',
							product TEXT DEFAULT '',
							extra_info TEXT DEFAULT '',
							change_count INTEGER DEFAULT 1,
							first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
							last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
							last_scan_id INTEGER DEFAULT 0,
							PRIMARY KEY (ip, port, protocol)
						)
					`); pErr == nil {
						if _, pErr := d.Exec(`
							INSERT OR IGNORE INTO consolidated_ports_new
							SELECT ip, port, protocol, state, service, version, product, extra_info,
								MAX(change_count) as change_count,
								MIN(first_seen) as first_seen,
								MAX(last_seen) as last_seen,
								MAX(last_scan_id) as last_scan_id
							FROM consolidated_ports
							GROUP BY ip, port, protocol
						`); pErr == nil {
							_, _ = d.Exec("DROP TABLE consolidated_ports")
							_, _ = d.Exec("ALTER TABLE consolidated_ports_new RENAME TO consolidated_ports")
						} else {
							_, _ = d.Exec("DROP TABLE IF EXISTS consolidated_ports_new")
						}
					}
				}
			}
		}

		// Check and recreate consolidated_hosts if PRIMARY KEY is missing
		var hostCreateSQL string
		if pErr := d.QueryRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='consolidated_hosts'").Scan(&hostCreateSQL); pErr == nil {
			if hostCreateSQL != "" && !containsIgnoreCase(hostCreateSQL, "primary key") {
				if _, pErr := d.Exec(`
					CREATE TABLE consolidated_hosts_new (
						ip TEXT PRIMARY KEY,
						mac TEXT DEFAULT '',
						hostname TEXT DEFAULT '',
						os TEXT DEFAULT '',
						status TEXT DEFAULT 'unknown',
						discovery_methods TEXT DEFAULT '',
						first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
						last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
						last_scan_id INTEGER DEFAULT 0
					)
				`); pErr == nil {
					if _, pErr := d.Exec(`
						INSERT OR IGNORE INTO consolidated_hosts_new
						SELECT ip, mac, hostname, os, status, discovery_methods, first_seen, last_seen, last_scan_id
						FROM consolidated_hosts
						GROUP BY ip
					`); pErr == nil {
						_, _ = d.Exec("DROP TABLE consolidated_hosts")
						_, _ = d.Exec("ALTER TABLE consolidated_hosts_new RENAME TO consolidated_hosts")
					}
				}
			}
		}
		var hostTotal, hostDistinct int
		if pErr := d.QueryRow("SELECT COUNT(*) FROM consolidated_hosts").Scan(&hostTotal); pErr == nil {
			if pErr := d.QueryRow("SELECT COUNT(*) FROM (SELECT ip FROM consolidated_hosts GROUP BY ip)").Scan(&hostDistinct); pErr == nil {
				if hostDupCount := hostTotal - hostDistinct; hostDupCount > 0 {
					if _, pErr := d.Exec(`
						CREATE TABLE consolidated_hosts_new (
							ip TEXT PRIMARY KEY,
							mac TEXT DEFAULT '',
							hostname TEXT DEFAULT '',
							os TEXT DEFAULT '',
							status TEXT DEFAULT 'unknown',
							discovery_methods TEXT DEFAULT '',
							first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
							last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
							last_scan_id INTEGER DEFAULT 0
						)
					`); pErr == nil {
						if _, pErr := d.Exec(`
							INSERT OR IGNORE INTO consolidated_hosts_new
							SELECT ip, mac, hostname, os, status, discovery_methods,
								MIN(first_seen) as first_seen,
								MAX(last_seen) as last_seen,
								MAX(last_scan_id) as last_scan_id
							FROM consolidated_hosts
							GROUP BY ip
						`); pErr == nil {
							_, _ = d.Exec("DROP TABLE consolidated_hosts")
							_, _ = d.Exec("ALTER TABLE consolidated_hosts_new RENAME TO consolidated_hosts")
						} else {
							_, _ = d.Exec("DROP TABLE IF EXISTS consolidated_hosts_new")
						}
					}
				}
			}
		}

		// Deduplicate ports
		var portTotal, portDistinct int
		if pErr := d.QueryRow("SELECT COUNT(*) FROM ports").Scan(&portTotal); pErr == nil {
			if pErr := d.QueryRow("SELECT COUNT(*) FROM (SELECT host_id, port, protocol FROM ports GROUP BY host_id, port, protocol)").Scan(&portDistinct); pErr == nil {
				if portDupCount := portTotal - portDistinct; portDupCount > 0 {
					if _, pErr := d.Exec(`
						CREATE TABLE ports_new (
							id INTEGER PRIMARY KEY AUTOINCREMENT,
							host_id INTEGER NOT NULL,
							port INTEGER NOT NULL,
							protocol TEXT NOT NULL DEFAULT 'tcp',
							state TEXT NOT NULL DEFAULT 'unknown',
							service TEXT DEFAULT '',
							version TEXT DEFAULT '',
							extra_info TEXT DEFAULT '',
							cpe TEXT DEFAULT '',
							product TEXT DEFAULT '',
							reason TEXT DEFAULT '',
							note TEXT DEFAULT '',
							original_data TEXT DEFAULT '',
							is_modified INTEGER DEFAULT 0,
							FOREIGN KEY (host_id) REFERENCES hosts(id) ON DELETE CASCADE
						)
					`); pErr == nil {
						if _, pErr := d.Exec(`
							INSERT INTO ports_new (id, host_id, port, protocol, state, service, version, extra_info, cpe, product, reason, note, original_data, is_modified)
							SELECT MIN(id), host_id, port, protocol, state, service, version, extra_info, cpe, product, reason, note, original_data, MAX(is_modified)
							FROM ports
							GROUP BY host_id, port, protocol
						`); pErr == nil {
							_, _ = d.Exec("DROP TABLE ports")
							_, _ = d.Exec("ALTER TABLE ports_new RENAME TO ports")
						} else {
							_, _ = d.Exec("DROP TABLE IF EXISTS ports_new")
						}
					}
				}
			}
		}

		// Deduplicate port_scripts and add unique index
		if _, pErr := d.Exec(`
			DELETE FROM port_scripts WHERE id NOT IN (
				SELECT MIN(id) FROM port_scripts GROUP BY host_id, port_id, script_id
			)
		`); pErr != nil {
			log.Printf("Error deduplicating port_scripts: %v", pErr)
		}
		d.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_port_scripts_unique ON port_scripts(host_id, port_id, script_id)")

		// Deduplicate host_scripts and add unique index
		if _, pErr := d.Exec(`
			DELETE FROM host_scripts WHERE id NOT IN (
				SELECT MIN(id) FROM host_scripts GROUP BY host_id, script_id
			)
		`); pErr != nil {
			log.Printf("Error deduplicating host_scripts: %v", pErr)
		}
		d.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_host_scripts_unique ON host_scripts(host_id, script_id)")

		d.Exec("INSERT OR IGNORE INTO migration_flags (name) VALUES ('dedup_v2')")
	}

	// Backfill schedule_v2: populate trigger_type, scheduled_at from existing data
	var schedFlag int
	d.QueryRow("SELECT 1 FROM migration_flags WHERE name = 'schedule_v2'").Scan(&schedFlag)
	if schedFlag == 0 {
		d.Exec("UPDATE scan_schedules SET trigger_type = 'time', scheduled_at = next_run_at, status = CASE WHEN enabled = 1 THEN 'pending' ELSE 'completed' END WHERE scheduled_at IS NULL")
		d.Exec("INSERT OR IGNORE INTO migration_flags (name) VALUES ('schedule_v2')")
	}

	return nil
}

func containsIgnoreCase(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}

func (d *DB) SeedAdmin(adminPassword string) (string, error) {
	var count int
	err := d.QueryRow("SELECT COUNT(*) FROM users WHERE username = 'admin'").Scan(&count)
	if err != nil {
		return "", err
	}
	if count > 0 {
		return "", nil
	}

	rawPassword := adminPassword
	if rawPassword == "" {
		rawPassword = generateRandomPassword()
	}
	hash, err := hashPassword(rawPassword)
	if err != nil {
		return "", err
	}
	_, err = d.Exec(
		"INSERT INTO users (username, password_hash, role, must_change_password) VALUES (?, ?, 'admin', 1)",
		"admin", hash,
	)
	return rawPassword, err
}

func generateRandomPassword() string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_=+[]{}<>?/"
	b := make([]byte, 16)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}

func (d *DB) SeedProfiles() error {
	var count int
	err := d.QueryRow("SELECT COUNT(*) FROM profiles").Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	profiles := []struct {
		name, desc, cmd, cat string
		order                int
	}{
		{"ARP Discovery", "ARP ping (same subnet)", "nmap -sn -PR <TARGET>", "Network Discovery", 1},
		{"ICMP Discovery", "ICMP echo/timestamp/netmask", "nmap -PE -PM -PP -sn -n <TARGET>", "Network Discovery", 2},
		{"TCP SYN Ping", "SYN to common ports", "nmap -PS22,80,443,445,3389 <TARGET>", "Network Discovery", 3},
		{"TCP ACK Ping", "ACK to ports 80,443", "nmap -PA80,443 <TARGET>", "Network Discovery", 4},
		{"TCP Discovery", "SYN host discovery", "nmap -sn -PS22,80,443,445 <TARGET>", "Network Discovery", 5},
		{"UDP Discovery", "UDP scan fast mode", "nmap -sU -sV --version-intensity 0 -F -n <TARGET>", "Network Discovery", 6},
		{"UDP Ping", "UDP to common ports", "nmap -PU53,67,68,69,123,135,137,161,500 <TARGET>", "Network Discovery", 7},
		{"SCTP Discovery", "SCTP INIT scan", "nmap -T4 -sY -n --open -Pn <TARGET>", "Network Discovery", 8},
		{"SCTP Ping", "SCTP INIT ping", "nmap -PY <TARGET>", "Network Discovery", 9},
		{"Default", "TCP SYN + Version, top 1000", "nmap -sS -sV -T4 --top-ports 1000 <TARGET>", "Port Scanning", 10},
		{"Quick TCP", "Fast scan, top 100 ports", "nmap -F -T4 <TARGET>", "Port Scanning", 11},
		{"Fast Top 1000", "Version + OS + Scripts", "nmap -sV -sC -O -T4 -n -Pn <TARGET>", "Port Scanning", 12},
		{"Full Port Scan", "All 65535 + OS + version", "nmap -sV -sC -O -T4 -n -Pn -p- <TARGET>", "Port Scanning", 13},
		{"Stealth SYN", "All ports, high rate", "nmap -sS -p- -T4 --min-rate 1000 <TARGET>", "Port Scanning", 14},
		{"Full Connect", "TCP connect all ports", "nmap -sT -p- <TARGET>", "Port Scanning", 15},
		{"Version Only", "Service version detection", "nmap -sV <TARGET>", "Port Scanning", 16},
		{"OS Fingerprint", "Aggressive OS detection", "nmap -O --osscan-guess <TARGET>", "Port Scanning", 17},
		{"Aggressive -A", "OS + version + scripts", "nmap -A <TARGET>", "Port Scanning", 18},
		{"Default Scripts", "NSE default scripts", "nmap -sC <TARGET>", "Port Scanning", 19},
		{"UDP Fast", "Fast UDP, version intensity 0", "nmap -sU -sV --version-intensity 0 -n -F -T4 <TARGET>", "UDP Scanning", 20},
		{"UDP Version", "UDP with scripts + version", "nmap -sU -sV -sC -n -F -T4 <TARGET>", "UDP Scanning", 21},
		{"UDP Common", "20 most common UDP ports", "nmap -sU -p 53,67,68,69,123,135,137,138,139,161,162,445,500,514,520,631,1434,1900,4500,5353 <TARGET>", "UDP Scanning", 22},
		{"UDP Top 1000", "Top 1000 UDP ports", "nmap -sU -sV --version-intensity 0 -n -T4 <TARGET>", "UDP Scanning", 23},
		{"Fragmentation", "Packet fragmentation (-f)", "nmap -f <TARGET>", "IDS/IPS Evasion", 24},
		{"FIN Scan", "FIN flag only (evasion)", "sudo nmap -sF <TARGET>", "IDS/IPS Evasion", 25},
		{"XMAS Scan", "FIN+PSH+URG flags", "sudo nmap -sX <TARGET>", "IDS/IPS Evasion", 26},
		{"NULL Scan", "No flags set", "sudo nmap -sN <TARGET>", "IDS/IPS Evasion", 27},
		{"ACK Scan", "Firewall detection", "sudo nmap -sA <TARGET>", "IDS/IPS Evasion", 28},
		{"Window Scan", "TCP window scan", "sudo nmap -sW <TARGET>", "IDS/IPS Evasion", 29},
		{"Maimon Scan", "FIN+ACK probe", "sudo nmap -sM <TARGET>", "IDS/IPS Evasion", 30},
		{"Decoys", "10 random decoy IPs", "nmap -D RND:10 <TARGET>", "IDS/IPS Evasion", 31},
		{"Source Port", "Spoof source port 53", "nmap -g 53 <TARGET>", "IDS/IPS Evasion", 32},
		{"Paranoid T0", "Slowest timing (IDS evasion)", "nmap -T0 <TARGET>", "IDS/IPS Evasion", 33},
		{"Sneaky T1", "Slow timing (IDS evasion)", "nmap -T1 <TARGET>", "IDS/IPS Evasion", 34},
		{"Polite T2", "Reduced bandwidth", "nmap -T2 <TARGET>", "IDS/IPS Evasion", 35},
		{"Data Length", "Append 200 bytes random", "nmap --data-length 200 <TARGET>", "IDS/IPS Evasion", 36},
		{"MAC Spoof", "Random MAC address", "nmap --spoof-mac 0 <TARGET>", "IDS/IPS Evasion", 37},
		{"Idle/Zombie", "Zombie scan (requires -sI)", "nmap -sI <ZOMBIE> <TARGET>", "IDS/IPS Evasion", 38},
		{"Live Discovery", "Host discovery only (-sn)", "nmap -sn -PE -PP -PM <TARGET>", "Common", 39},
		{"Full TCP", "All 65535 TCP ports", "nmap -p- -T4 --open <TARGET>", "Common", 40},
		{"UDP Scan", "Top 100 UDP ports", "nmap -sU -T4 --top-ports 100 <TARGET>", "Common", 41},
		{"TCP + UDP", "Top 100 of both", "nmap -sS -sU -T4 --top-ports 100 <TARGET>", "Common", 42},
		{"Comprehensive", "Full scan with OS + version", "nmap -A -T4 -p- --open <TARGET>", "Common", 43},
	}

	for _, p := range profiles {
		_, err = d.Exec(
			"INSERT INTO profiles (name, description, command, category, sort_order, is_builtin) VALUES (?, ?, ?, ?, ?, 1)",
			p.name, p.desc, p.cmd, p.cat, p.order,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

func (d *DB) CloseDB() {
	if err := d.Close(); err != nil {
		log.Printf("db close error: %v", err)
	}
}
