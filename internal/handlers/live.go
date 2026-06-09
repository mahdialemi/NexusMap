package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

func (s *Server) HandleLiveHosts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	switch r.Method {
	case "GET":
		hosts, err := s.DB.GetLiveHosts(projectID)
		if err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, 200, hosts)

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) HandleLiveHostPing(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	projectID := parseIntID(r.PathValue("id"))
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	ip := r.URL.Query().Get("ip")
	if ip == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip required"})
		return
	}

	parsed := net.ParseIP(ip)
	if parsed == nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid IP address"})
		return
	}
	if parsed.IsLoopback() || parsed.IsUnspecified() {
		jsonResponse(w, 400, map[string]string{"error": "cannot ping loopback or unspecified addresses"})
		return
	}

	start := time.Now()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("ping", "-n", "1", "-w", "2000", ip)
	} else {
		cmd = exec.Command("ping", "-c", "1", "-W", "2", ip)
	}
	output, err := cmd.CombinedOutput()
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		jsonResponse(w, 200, map[string]interface{}{"reachable": false, "ip": ip, "time_ms": elapsed, "output": string(output)})
		return
	}

	jsonResponse(w, 200, map[string]interface{}{"reachable": true, "ip": ip, "time_ms": elapsed})
}

func (s *Server) HandleLiveHostStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IP     string `json:"ip"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" || req.Status == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip and status required"})
		return
	}

	if err := s.DB.UpdateLiveHostStatus(req.IP, req.Status, req.Note); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleLiveHostDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IP string `json:"ip"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip required"})
		return
	}

	if err := s.DB.DeleteLiveHost(req.IP); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleLiveHostExport(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if r.Method != "GET" {
		http.Error(w, "method not allowed", 405)
		return
	}

	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	hosts, err := s.DB.GetLiveHosts(projectID)
	if err != nil {
		serverError(w, err)
		return
	}

	proj, _ := s.DB.GetProject(projectID)
	name := fmt.Sprintf("live-hosts-%d", projectID)
	if proj != nil {
		name = strings.ReplaceAll(proj.Name, " ", "-") + "-live"
	}

	switch format {
	case "xlsx":
		f := excelize.NewFile()
		defer f.Close()
		sheet := "Live Hosts"
		f.SetSheetName("Sheet1", sheet)

		headers := []string{"IP", "MAC", "Hostname", "OS", "Status", "Discovery Methods", "Last Seen"}
		for i, h := range headers {
			cell := fmt.Sprintf("%c1", 'A'+i)
			f.SetCellValue(sheet, cell, h)
		}
		for i, h := range hosts {
			row := i + 2
			f.SetCellValue(sheet, fmt.Sprintf("A%d", row), h.IP)
			f.SetCellValue(sheet, fmt.Sprintf("B%d", row), h.MAC)
			f.SetCellValue(sheet, fmt.Sprintf("C%d", row), h.Hostname)
			f.SetCellValue(sheet, fmt.Sprintf("D%d", row), h.OS)
			f.SetCellValue(sheet, fmt.Sprintf("E%d", row), h.Status)
			f.SetCellValue(sheet, fmt.Sprintf("F%d", row), h.DiscoveryMethods)
			f.SetCellValue(sheet, fmt.Sprintf("G%d", row), h.LastSeen)
		}

		buf, err := f.WriteToBuffer()
		if err != nil {
			serverError(w, err)
			return
		}

		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xlsx", name))
		w.Write(buf.Bytes())

	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.json", name))
		json.NewEncoder(w).Encode(hosts)

	case "txt":
		var buf strings.Builder
		buf.WriteString(fmt.Sprintf("Live Hosts Report - %s\n", name))
		buf.WriteString(strings.Repeat("=", 80) + "\n")
		for _, h := range hosts {
			fmt.Fprintf(&buf, "IP: %s\n", h.IP)
			fmt.Fprintf(&buf, "MAC: %s\n", h.MAC)
			fmt.Fprintf(&buf, "Hostname: %s\n", h.Hostname)
			fmt.Fprintf(&buf, "OS: %s\n", h.OS)
			fmt.Fprintf(&buf, "Status: %s\n", h.Status)
			fmt.Fprintf(&buf, "Discovery: %s\n", h.DiscoveryMethods)
			fmt.Fprintf(&buf, "Last Seen: %s\n", h.LastSeen)
			buf.WriteString(strings.Repeat("-", 40) + "\n")
		}
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.txt", name))
		w.Write([]byte(buf.String()))

	default:
		http.Error(w, "unsupported format: "+format, 400)
	}
}

func (s *Server) HandleLiveHostBulkDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IPs []string `json:"ips"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if len(req.IPs) == 0 {
		jsonResponse(w, 400, map[string]string{"error": "no ips provided"})
		return
	}

	deleted := 0
	for _, ip := range req.IPs {
		if err := s.DB.DeleteLiveHost(ip); err == nil {
			deleted++
		}
	}

	jsonResponse(w, 200, map[string]interface{}{"deleted": deleted, "total": len(req.IPs)})
}

func (s *Server) HandleLiveHostBulkStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IPs    []string `json:"ips"`
		Status string   `json:"status"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if len(req.IPs) == 0 || req.Status == "" {
		jsonResponse(w, 400, map[string]string{"error": "ips and status required"})
		return
	}

	updated := 0
	for _, ip := range req.IPs {
		if err := s.DB.UpdateLiveHostStatus(ip, req.Status, ""); err == nil {
			updated++
		}
	}

	jsonResponse(w, 200, map[string]interface{}{"updated": updated, "total": len(req.IPs)})
}

func (s *Server) HandleLiveHostUpdateField(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IP    string `json:"ip"`
		Field string `json:"field"`
		Value string `json:"value"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" || req.Field == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip and field required"})
		return
	}

	validFields := map[string]bool{"hostname": true, "mac": true, "os": true, "note": true, "status": true}
	if !validFields[req.Field] {
		jsonResponse(w, 400, map[string]string{"error": "invalid field"})
		return
	}

	if err := s.DB.UpdateLiveHostField(req.IP, req.Field, req.Value); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleLiveHostDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}
	ip := r.URL.Query().Get("ip")
	if ip == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip required"})
		return
	}

	host, err := s.DB.GetLiveHostDetail(projectID, ip)
	if err != nil {
		serverError(w, err)
		return
	}
	if host == nil {
		jsonResponse(w, 404, map[string]string{"error": "host not found"})
		return
	}

	ports, err := s.DB.GetHostPorts(projectID, ip)
	if err != nil {
		log.Printf("GetHostPorts error: %v", err)
		ports = []map[string]interface{}{}
	}

	scripts, err := s.DB.GetHostScripts(projectID, ip)
	if err != nil {
		log.Printf("GetHostScripts error: %v", err)
		scripts = []map[string]interface{}{}
	}

	scans, err := s.DB.GetHostScans(projectID, ip)
	if err != nil {
		scans = []map[string]interface{}{}
	}

	jsonResponse(w, 200, map[string]interface{}{
		"host":    host,
		"ports":   ports,
		"scripts": scripts,
		"scans":   scans,
	})
}
