package db

import (
	"strconv"
	"time"
)

type User struct {
	ID                 int       `json:"id"`
	Username           string    `json:"username"`
	Role               string    `json:"role"`
	CreatedAt          time.Time `json:"created_at"`
	MustChangePassword bool      `json:"must_change_password"`
}

type Session struct {
	ID         string    `json:"-"`
	UserID     int       `json:"-"`
	CreatedAt  time.Time `json:"-"`
	LastActive time.Time `json:"-"`
}

type Project struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	Tags        string     `json:"tags"`
	Client      string     `json:"client"`
	OwnerID     *int       `json:"owner_id,omitempty"`
	OwnerName   string     `json:"owner_name,omitempty"`
	DueDate     *string    `json:"due_date,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	ScanCount   int        `json:"scan_count,omitempty"`
	LastScanAt  *time.Time `json:"last_scan_at,omitempty"`
}

type Scan struct {
	ID          int        `json:"id"`
	ProjectID   int        `json:"project_id"`
	Profile     string     `json:"profile"`
	Target      string     `json:"target"`
	NmapCommand string     `json:"nmap_command"`
	Status      string     `json:"status"`
	Confirmed   int        `json:"confirmed"`
	Progress    int        `json:"progress"`
	Phase       string     `json:"phase"`
	Note        string     `json:"note"`
	HostCount   int        `json:"host_count,omitempty"`
	PortCount   int        `json:"port_count,omitempty"`
	OutputDir   string     `json:"output_dir,omitempty"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type Host struct {
	ID           int    `json:"id"`
	ScanID       int    `json:"scan_id"`
	IP           string `json:"ip"`
	MAC          string `json:"mac"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Status       string `json:"status"`
	Vendor       string `json:"vendor"`
	Note         string `json:"note"`
	OriginalData string `json:"-"`
}

type Port struct {
	IP           string `json:"-"`
	ID           int    `json:"id"`
	HostID       int    `json:"host_id"`
	Port         int    `json:"port"`
	Protocol     string `json:"protocol"`
	State        string `json:"state"`
	Service      string `json:"service"`
	Version      string `json:"version"`
	ExtraInfo    string `json:"extra_info"`
	CPE          string `json:"cpe"`
	Product      string `json:"product"`
	Reason       string `json:"reason"`
	Note         string `json:"note"`
	OriginalData string `json:"-"`
	IsModified   bool   `json:"is_modified"`
}

type PortScript struct {
	ID       int    `json:"id"`
	HostID   int    `json:"host_id"`
	PortID   int    `json:"port_id"`
	ScriptID string `json:"script_id"`
	Output   string `json:"output"`
	IP       string `json:"-"`
	Port     int    `json:"-"`
	Protocol string `json:"-"`
}

type HostScript struct {
	ID       int    `json:"id"`
	HostID   int    `json:"host_id"`
	ScriptID string `json:"script_id"`
	Output   string `json:"output"`
	IP       string `json:"-"`
}

type ConsolidatedScript struct {
	IP        string `json:"ip"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	Service   string `json:"service"`
	State     string `json:"state"`
	ScriptID  string `json:"script_id"`
	Output    string `json:"output"`
	ExtraInfo string `json:"extra_info"`
}

type ResultRow struct {
	HostID     int    `json:"host_id"`
	PortID     int    `json:"port_id"`
	IP         string `json:"ip"`
	MAC        string `json:"mac"`
	Hostname   string `json:"hostname"`
	OS         string `json:"os"`
	HostStatus string `json:"host_status"`
	Port       int    `json:"port"`
	Protocol   string `json:"protocol"`
	State      string `json:"state"`
	Service    string `json:"service"`
	Version    string `json:"version"`
	ExtraInfo  string `json:"extra_info"`
	Product    string `json:"product"`
	Reason     string `json:"reason"`
	IsModified bool   `json:"is_modified"`
}

type PaginatedResults struct {
	Results []ResultRow `json:"results"`
	Total   int         `json:"total"`
	Page    int         `json:"page"`
	Limit   int         `json:"limit"`
}

type ScanStatus struct {
	Status   string `json:"status"`
	Progress int    `json:"progress"`
	Phase    string `json:"phase"`
	Output   string `json:"output"`
	Hosts    int    `json:"hosts"`
	Ports    int    `json:"ports"`
}

type ConsolidatedHost struct {
	IP               string `json:"ip"`
	MAC              string `json:"mac"`
	Hostname         string `json:"hostname"`
	OS               string `json:"os"`
	Status           string `json:"status"`
	DiscoveryMethods string `json:"discovery_methods"`
	FirstSeen        string `json:"first_seen"`
	LastSeen         string `json:"last_seen"`
	LastScanID       int    `json:"last_scan_id"`
}

type ConsolidatedPort struct {
	IP          string `json:"ip"`
	MAC         string `json:"mac"`
	Hostname    string `json:"hostname"`
	OS          string `json:"os"`
	HostStatus  string `json:"host_status"`
	Port        int    `json:"port"`
	Protocol    string `json:"protocol"`
	State       string `json:"state"`
	Service     string `json:"service"`
	Version     string `json:"version"`
	Product     string `json:"product"`
	ExtraInfo   string `json:"extra_info"`
	ChangeCount int    `json:"change_count"`
	FirstSeen   string `json:"first_seen"`
	LastSeen    string `json:"last_seen"`
	LastScanID  int    `json:"last_scan_id"`
	NotePreview string `json:"note_preview"`
}

type PaginatedPorts struct {
	Ports []ConsolidatedPort `json:"ports"`
	Total int                `json:"total"`
	Page  int                `json:"page"`
	Limit int                `json:"limit"`
}

type FilterQuery struct {
	Field      string   `json:"field"`
	Op         string   `json:"op"`
	Value      string   `json:"value,omitempty"`
	Values     []string `json:"values,omitempty"`
	Min        *int     `json:"min,omitempty"`
	Max        *int     `json:"max,omitempty"`
}

type FilterGroup struct {
	GroupMode string        `json:"group_mode"` // "and" or "or"
	Filters   []FilterQuery `json:"filters"`
}

type PortsQueryRequest struct {
	Page       int           `json:"page"`
	Limit      int           `json:"limit"`
	Search     string        `json:"search,omitempty"`
	FilterMode string        `json:"filter_mode"`          // join groups: "and" or "or"
	Filters    []FilterQuery `json:"filters,omitempty"`    // backward compat: flat list
	Groups     []FilterGroup `json:"groups,omitempty"`     // new: grouped structure
}

type FieldOption struct {
	Type   string   `json:"type"` // string, enum, number, date
	Values []string `json:"values,omitempty"`
	Min    *int     `json:"min,omitempty"`
	Max    *int     `json:"max,omitempty"`
}

type FilterOptionsResponse struct {
	Fields map[string]FieldOption `json:"fields"`
}

type ConsolidatedEdit struct {
	EditID   int    `json:"edit_id"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Field    string `json:"field"`
	OldValue string `json:"old_value"`
	NewValue string `json:"new_value"`
	Applied  int    `json:"applied"`
	EditedAt string `json:"edited_at"`
}

type ConsolidatedNote struct {
	ID        int    `json:"id"`
	IP        string `json:"ip"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	Note      string `json:"note"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type LiveHost struct {
	IP               string `json:"ip"`
	MAC              string `json:"mac"`
	Hostname         string `json:"hostname"`
	OS               string `json:"os"`
	Status           string `json:"status"`
	DiscoveryMethods string `json:"discovery_methods"`
	LastSeen         string `json:"last_seen"`
	Note             string `json:"note"`
}

type PortHistoryEntry struct {
	ScanID    int    `json:"scan_id"`
	Profile   string `json:"profile"`
	Target    string `json:"target"`
	State     string `json:"state"`
	Service   string `json:"service"`
	Version   string `json:"version"`
	Product   string `json:"product"`
	ExtraInfo string `json:"extra_info"`
	StartedAt string `json:"started_at"`
}

type GlobalStats struct {
	TotalProjects    int `json:"total_projects"`
	ActiveProjects   int `json:"active_projects"`
	ArchivedProjects int `json:"archived_projects"`
	CompletedProjects int `json:"completed_projects"`
	TotalScans       int `json:"total_scans"`
	RunningScans     int `json:"running_scans"`
	CompletedScans   int `json:"completed_scans"`
	FailedScans      int `json:"failed_scans"`
	TotalHosts       int `json:"total_hosts"`
	TotalPorts       int `json:"total_ports"`
	UniqueServices   int `json:"unique_services"`
}

type ScanScriptExport struct {
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Service  string `json:"service"`
	State    string `json:"state"`
	ScriptID string `json:"script_id"`
	Output   string `json:"output"`
	Type     string `json:"type"`
}

type PaginatedScripts struct {
	Scripts []ConsolidatedScript `json:"scripts"`
	Total   int                  `json:"total"`
	Page    int                  `json:"page"`
	Limit   int                  `json:"limit"`
}

type Profile struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command"`
	Category    string `json:"category"`
	SortOrder   int    `json:"sort_order"`
	IsBuiltin   bool   `json:"is_builtin"`
	CreatedAt   string `json:"created_at"`
}

func parseInt(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
