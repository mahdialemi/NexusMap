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
	IsSuperadmin       bool      `json:"-"`
	Theme              string    `json:"theme"`
	Lang               string    `json:"lang"`
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
	ScanCount       int        `json:"scan_count"`
	ConfirmedCount  int        `json:"confirmed_count"`
	LastScanAt      *time.Time `json:"last_scan_at"`
	LastScanStatus  string     `json:"last_scan_status"`
	IsPinned        bool       `json:"is_pinned"`
}

type Scan struct {
	ID                  int        `json:"id"`
	ProjectID           int        `json:"project_id"`
	Profile             string     `json:"profile"`
	Target              string     `json:"target"`
	NmapCommand         string     `json:"nmap_command"`
	Status              string     `json:"status"`
	Confirmed           int        `json:"confirmed"`
	Progress            int        `json:"progress"`
	Phase               string     `json:"phase"`
	Note                string     `json:"note"`
	HostCount           int        `json:"host_count,omitempty"`
	PortCount           int        `json:"port_count,omitempty"`
	OutputDir           string     `json:"output_dir,omitempty"`
	StartedAt           time.Time  `json:"started_at"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	ScheduleID          *int       `json:"schedule_id,omitempty"`
	ScheduleTriggerType *string    `json:"schedule_trigger_type,omitempty"`
	ScheduleScheduledAt *string    `json:"schedule_scheduled_at,omitempty"`
	ScheduleDependsOn   *int       `json:"schedule_depends_on,omitempty"`
	ScheduleName        *string    `json:"schedule_name,omitempty"`
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
	Label            string `json:"label"`
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
	Label       string `json:"label"`
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
	FilterMode string        `json:"filter_mode"`            // join groups: "and" or "or"
	Filters    []FilterQuery `json:"filters,omitempty"`      // backward compat: flat list
	Groups     []FilterGroup `json:"groups,omitempty"`       // new: grouped structure
	HideClosed bool          `json:"hide_closed,omitempty"`  // exclude closed ports
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
	Service   string `json:"service,omitempty"`
	Hostname  string `json:"hostname,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type TopologyPort struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	State    string `json:"state"`
	Service  string `json:"service"`
	Version  string `json:"version"`
	Product  string `json:"product"`
}

type TopologyNode struct {
	IP               string         `json:"ip"`
	Hostname         string         `json:"hostname"`
	OS               string         `json:"os"`
	MAC              string         `json:"mac"`
	Status           string         `json:"status"`
	Ports            int            `json:"ports"`
	Services         []string       `json:"services"`
	Subnet           string         `json:"subnet"`
	Label            string         `json:"label"`
	FirstSeen        string         `json:"first_seen"`
	LastSeen         string         `json:"last_seen"`
	DiscoveryMethods string         `json:"discovery_methods"`
	PortDetail       []TopologyPort `json:"port_detail"`
	OSInferred       bool           `json:"os_inferred"`
}

type SubnetCluster struct {
	Subnet    string         `json:"subnet"`
	HostCount int            `json:"host_count"`
	PortCount int            `json:"port_count"`
	Hosts     []TopologyNode `json:"hosts"`
	Services  []string       `json:"services"`
}

type TopologyResponse struct {
	Nodes     []TopologyNode  `json:"nodes"`
	Clusters  []SubnetCluster `json:"clusters"`
	MaxPorts  int             `json:"max_ports"`
	Subnets   []string        `json:"subnets"`
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

type PortCount struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Service  string `json:"service"`
	Count    int    `json:"count"`
}

type OSCount struct {
	OS    string `json:"os"`
	Count int    `json:"count"`
}

type ProjectScanCount struct {
	ProjectID   int    `json:"project_id"`
	ProjectName string `json:"project_name"`
	Count       int    `json:"count"`
}

type GlobalStats struct {
	TotalProjects       int                    `json:"total_projects"`
	ActiveProjects      int                    `json:"active_projects"`
	ArchivedProjects    int                    `json:"archived_projects"`
	CompletedProjects   int                    `json:"completed_projects"`
	TotalScans          int                    `json:"total_scans"`
	RunningScans        int                    `json:"running_scans"`
	CompletedScans      int                    `json:"completed_scans"`
	FailedScans         int                    `json:"failed_scans"`
	TotalHosts          int                    `json:"total_hosts"`
	TotalPorts          int                    `json:"total_ports"`
	UniqueServices      int                    `json:"unique_services"`
	TotalLiveHosts      int                    `json:"total_live_hosts"`
	OpenPortCount       int                    `json:"open_port_count"`
	HighRiskPortCount   int                    `json:"high_risk_port_count"`
	ScanActivity        []DayCount             `json:"scan_activity"`
	TopServices         []ServiceCount         `json:"top_services"`
	TopPorts            []PortCount            `json:"top_ports"`
	RecentScans         []Scan                 `json:"recent_scans"`
	ScanStatusBreakdown map[string]int         `json:"scan_status_breakdown"`
	PortStateBreakdown  map[string]int         `json:"port_state_breakdown"`
	TopOS               []OSCount              `json:"top_os"`
	ProjectsByPriority  map[string]int         `json:"projects_by_priority"`
	ScansPerProject     []ProjectScanCount     `json:"scans_per_project"`
	RecentActivity      []ActivityEntry        `json:"recent_activity"`
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

type ScanSchedule struct {
	ID              int     `json:"id"`
	ProjectID       int     `json:"project_id"`
	Name            string  `json:"name"`
	Profile         string  `json:"profile"`
	Target          string  `json:"target"`
	TriggerType     string  `json:"trigger_type"`
	ScheduledAt     *string `json:"scheduled_at,omitempty"`
	DependsOnScanID *int    `json:"depends_on_scan_id,omitempty"`
	Status          string  `json:"status"`
	NextRunAt       *string `json:"next_run_at,omitempty"`
	LastRunAt       *string `json:"last_run_at,omitempty"`
	CreatedAt       string  `json:"created_at"`
}

type DayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type ServiceCount struct {
	Service string `json:"service"`
	Port    int    `json:"port"`
	Count   int    `json:"count"`
}

type ProjectStatsResponse struct {
	Project             Project        `json:"project"`
	ScanStatusBreakdown map[string]int `json:"scan_status_breakdown"`
	PortStateBreakdown  map[string]int `json:"port_state_breakdown"`
	TopServices         []ServiceCount `json:"top_services"`
	TopOS               []OSCount      `json:"top_os"`
	TopPorts            []PortCount    `json:"top_ports"`
	HostCount           int            `json:"host_count"`
	OpenPortCount       int            `json:"open_port_count"`
	HighRiskPortCount   int            `json:"high_risk_port_count"`
	TotalScans          int            `json:"total_scans"`
	RecentScans         []Scan         `json:"recent_scans"`
	ScanActivity        []DayCount     `json:"scan_activity"`
}

func parseInt(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

type ScanComparison struct {
	Scan1         ScanInfo   `json:"scan1"`
	Scan2         ScanInfo   `json:"scan2"`
	HostsAdded    []DiffHost `json:"hosts_added"`
	HostsRemoved  []DiffHost `json:"hosts_removed"`
	PortsAdded    []DiffPort `json:"ports_added"`
	PortsRemoved  []DiffPort `json:"ports_removed"`
	PortsChanged  []DiffPort `json:"ports_changed"`
	Summary       DiffSummary `json:"summary"`
}

type ScanInfo struct {
	ID        int    `json:"id"`
	Target    string `json:"target"`
	Profile   string `json:"profile"`
	StartedAt string `json:"started_at"`
}

type DiffHost struct {
	IP       string `json:"ip"`
	MAC      string `json:"mac"`
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Status   string `json:"status"`
}

type DiffPort struct {
	IP         string `json:"ip"`
	Port       int    `json:"port"`
	Protocol   string `json:"protocol"`
	State      string `json:"state"`
	Service    string `json:"service"`
	Product    string `json:"product"`
	Version    string `json:"version"`
	Extra      string `json:"extra"`
	OldState   string `json:"old_state,omitempty"`
	OldService string `json:"old_service,omitempty"`
	OldProduct string `json:"old_product,omitempty"`
	OldVersion string `json:"old_version,omitempty"`
	OldExtra   string `json:"old_extra,omitempty"`
}

type DiffSummary struct {
	HostsInScan1   int `json:"hosts_in_scan1"`
	HostsInScan2   int `json:"hosts_in_scan2"`
	HostsAdded     int `json:"hosts_added"`
	HostsRemoved   int `json:"hosts_removed"`
	PortsInScan1   int `json:"ports_in_scan1"`
	PortsInScan2   int `json:"ports_in_scan2"`
	PortsAdded     int `json:"ports_added"`
	PortsRemoved   int `json:"ports_removed"`
	PortsChanged   int `json:"ports_changed"`
}
