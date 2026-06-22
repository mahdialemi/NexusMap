package nmap

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

type cmdInfo struct {
	cmd *exec.Cmd
	buf *bytes.Buffer
}

type Runner struct {
	scansDir string
	nmapPath string
	mu       sync.RWMutex
	cmds     map[int]*cmdInfo
	stopped  map[int]bool
	phases   map[int]string
}

func New(scansDir string, nmapPath string) *Runner {
	return &Runner{
		scansDir: scansDir,
		nmapPath: nmapPath,
		cmds:     make(map[int]*cmdInfo),
		stopped:  make(map[int]bool),
		phases:   make(map[int]string),
	}
}

func (r *Runner) NmapPath() string {
	return r.nmapPath
}

func (r *Runner) ScansDir() string {
	return r.scansDir
}

func (r *Runner) TrackCmd(scanID int, cmd *exec.Cmd, buf *bytes.Buffer) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cmds[scanID] = &cmdInfo{cmd: cmd, buf: buf}
}

func (r *Runner) UntrackCmd(scanID int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.cmds, scanID)
	delete(r.stopped, scanID)
}

func (r *Runner) Stop(scanID int) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopped[scanID] = true
	if ci, ok := r.cmds[scanID]; ok && ci.cmd != nil && ci.cmd.Process != nil {
		ci.cmd.Process.Kill()
		return true
	}
	return false
}

func (r *Runner) StopAll() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, ci := range r.cmds {
		if ci.cmd != nil && ci.cmd.Process != nil {
			ci.cmd.Process.Kill()
		}
		r.stopped[id] = true
	}
}

func (r *Runner) IsRunning(scanID int) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.cmds[scanID]
	return ok
}

func (r *Runner) WasStopped(scanID int) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.stopped[scanID]
}

func (r *Runner) SetPhase(scanID int, phase string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.phases[scanID] = phase
}

func (r *Runner) ClearPhase(scanID int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.phases, scanID)
}

func (r *Runner) GetPhase(scanID int) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.phases[scanID]
}

func (r *Runner) GetOutput(scanID int) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if ci, ok := r.cmds[scanID]; ok && ci.buf != nil {
		return ci.buf.String()
	}
	return ""
}

type NSEScript struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Category string `json:"category"`
}

func (r *Runner) FindNSEScripts(query string) []NSEScript {
	nmapPath := r.nmapPath
	if nmapPath == "" {
		var err error
		nmapPath, err = exec.LookPath("nmap")
		if err != nil {
			return nil
		}
	}
	nmapDir := filepath.Dir(nmapPath)
	searchDirs := []string{
		filepath.Join(nmapDir, "..", "share", "nmap", "scripts"),
		filepath.Join(nmapDir, "..", "scripts"),
		filepath.Join(nmapDir, "scripts"),
	}

	var results []NSEScript
	seen := make(map[string]bool)
	queryLower := strings.ToLower(query)

	for _, dir := range searchDirs {
		resolved, err := filepath.Abs(dir)
		if err != nil {
			continue
		}
		entries, err := os.ReadDir(resolved)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".nse") {
				continue
			}
			name := strings.TrimSuffix(entry.Name(), ".nse")
			if seen[name] {
				continue
			}
			if queryLower != "" && !strings.Contains(strings.ToLower(name), queryLower) {
				continue
			}
			seen[name] = true
			cat := categorizeNSE(name)
			results = append(results, NSEScript{
				Name:     name,
				Path:     filepath.Join(resolved, entry.Name()),
				Category: cat,
			})
		}
		if len(results) > 0 {
			break
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Name < results[j].Name
	})
	return results
}

func categorizeNSE(name string) string {
	parts := strings.Split(name, "-")
	if len(parts) > 0 {
		switch parts[0] {
		case "http":
			return "HTTP"
		case "dns":
			return "DNS"
		case "smb":
			return "SMB"
		case "ssh":
			return "SSH"
		case "ssl", "tls":
			return "SSL/TLS"
		case "ftp":
			return "FTP"
		case "smtp":
			return "SMTP"
		case "mysql", "mssql", "oracle", "postgres":
			return "Database"
		case "snmp":
			return "SNMP"
		}
	}
	return "Other"
}
