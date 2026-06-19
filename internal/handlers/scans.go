package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/mahdialemi/NexusMap/internal/db"
	"github.com/mahdialemi/NexusMap/internal/nmap"
)

func (s *Server) HandleCreateScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		ProjectID json.Number `json:"project_id"`
		Profile   string      `json:"profile"`
		Target    string      `json:"target"`
		ExtraArgs string      `json:"extra_args"`
		Note      string      `json:"note"`
	}
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request body"})
		return
	}

	projectID, err := req.ProjectID.Int64()
	if err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid project_id"})
		return
	}

	if req.Profile == "" {
		req.Profile = "default"
	}

	if strings.HasPrefix(req.Target, "-") {
		jsonResponse(w, 400, map[string]string{"error": "invalid target"})
		return
	}
	if err := nmap.ValidateNmapArgs([]string{req.Target}); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid target"})
		return
	}
	if req.ExtraArgs != "" {
		if err := nmap.ValidateNmapArgs(strings.Fields(req.ExtraArgs)); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid extra_args"})
			return
		}
	}

	var nmapCmd string
	var profileName string

	profiles, err := s.DB.GetProfiles()
	if err != nil {
		LogWarn("GetProfiles failed", map[string]interface{}{"error": err})
	}

	var found *db.Profile
	for i := range profiles {
		if profiles[i].Name == req.Profile {
			found = &profiles[i]
			break
		}
	}

	if found != nil {
		nmapCmd = strings.ReplaceAll(found.Command, "<TARGET>", req.Target)
		profileName = found.Name
	} else {
		args := nmap.GetProfileArgs(req.Profile)
		args = append(args, req.Target)
		nmapCmd = "nmap " + strings.Join(args, " ")
		profileName = req.Profile
	}

	if req.ExtraArgs != "" {
		nmapCmd = nmapCmd + " " + req.ExtraArgs
	}

	scanID, err := s.DB.CreatePendingScan(int(projectID), profileName, req.Target, nmapCmd, req.Note)
	if err != nil {
		serverError(w, err)
		return
	}

	user := getRequestUser(r)
	uname := ""
	if user != nil { uname = user.Username }
	s.LogAndNotify("scan_created", fmt.Sprintf("Scan created on %s (%s) for project %d", req.Target, profileName, projectID), uname)

	jsonResponse(w, 200, map[string]int64{"scan_id": scanID})
}

func (s *Server) HandleRunScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	id := r.PathValue("id")
	scanID := parseIntID(id)

	scan, err := s.DB.GetScan(scanID)
	if err != nil {
		jsonResponse(w, 404, map[string]string{"error": "scan not found"})
		return
	}

	if scan.Status == "running" {
		jsonResponse(w, 400, map[string]string{"error": "scan already running"})
		return
	}

	if err := s.DB.StartScan(scanID); err != nil {
		log.Printf("error updating scan status to running: %v", err)
	}

	cmdStr := scan.NmapCommand
	if cmdStr == "" {
		args := nmap.GetProfileArgs(scan.Profile)
		args = append(args, scan.Target)
		cmdStr = "nmap " + strings.Join(args, " ")
	}

	user := getRequestUser(r)
	uname := ""
	if user != nil {
		uname = user.Username
	}
	s.LogAndNotify("scan_started", fmt.Sprintf("Scan started on %s (%s)", scan.Target, scan.Profile), uname)

	s.ScanWG.Add(1)
	go func() {
		defer s.ScanWG.Done()
		s.runCommand(scanID, cmdStr, scan.Target, uname)
	}()

	jsonResponse(w, 200, map[string]string{"message": "scan started"})
}

func (s *Server) runCommand(scanID int, cmdStr, target, username string) {
	s.DB.StartScan(scanID)

	outDir := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scanID))
	os.MkdirAll(outDir, 0755)

	parts := strings.Fields(cmdStr)
	if len(parts) == 0 {
		s.DB.UpdateScanStatus(scanID, "error", 0, "")
		s.LogAndNotify("scan_error", fmt.Sprintf("Scan on %s failed: invalid command", target), username)
		return
	}

	if err := nmap.ValidateNmapArgs(parts); err != nil {
		s.DB.UpdateScanStatus(scanID, "error", 0, "")
		s.LogAndNotify("scan_error", fmt.Sprintf("Scan on %s failed: invalid command args", target), username)
		return
	}

	bin := parts[0]
	if strings.ToLower(bin) == "nmap" && s.NmapRunner.NmapPath() != "" {
		bin = s.NmapRunner.NmapPath()
	}
	args := parts[1:]

	// Replace <TARGET> placeholder in args
	for i, a := range args {
		args[i] = strings.ReplaceAll(a, "<TARGET>", target)
	}

	// Add nmap output flags if the binary is nmap
	if strings.ToLower(bin) == "nmap" {
		outBase := filepath.Join(outDir, "scan")
		hasOutput := false
		for _, a := range args {
			if strings.HasPrefix(a, "-oX") || strings.HasPrefix(a, "-oN") || strings.HasPrefix(a, "-oG") {
				hasOutput = true
				break
			}
		}
		if !hasOutput {
			args = append([]string{"-oX", outBase + ".xml", "-oN", outBase + ".nmap", "-oG", outBase + ".gnmap"}, args...)
		}
		args = append(args, "-vvv")
	}

	cmd := exec.Command(bin, args...)
	cmd.Dir = outDir

	buf := &bytes.Buffer{}
	logFile := filepath.Join(outDir, "output.log")
	logF, err := os.Create(logFile)
	if err != nil {
		s.DB.UpdateScanStatus(scanID, "error", 0, "")
		return
	}
	defer logF.Close()
	cmd.Stdout = io.MultiWriter(buf, logF)
	cmd.Stderr = io.MultiWriter(buf, logF)

	s.DB.UpdateScanOutputDir(scanID, outDir)

	if err := cmd.Start(); err != nil {
		LogError("Scan start failed", map[string]interface{}{"scan_id": scanID, "error": err})
		s.DB.UpdateScanStatus(scanID, "error", 0, "")
		s.LogAndNotify("scan_error", fmt.Sprintf("Scan on %s failed to start: %s", target, err.Error()), username)
		return
	}

	// Track for stop
	s.NmapRunner.TrackCmd(scanID, cmd, buf)

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if s.NmapRunner.WasStopped(scanID) {
					s.DB.UpdateScanStatus(scanID, "stopped", 0, "")
					s.NmapRunner.ClearPhase(scanID)
					return
				}
				progress, phase := parseNmapProgress(s.NmapRunner.GetOutput(scanID))
				s.DB.UpdateScanStatus(scanID, "running", progress, phase)
				if phase != "" {
					s.NmapRunner.SetPhase(scanID, phase)
				}
			case <-done:
				s.NmapRunner.ClearPhase(scanID)
				return
			}
		}
	}()

	err = cmd.Wait()
	close(done)
	s.NmapRunner.UntrackCmd(scanID)

	logF.Sync()

	if err != nil || s.NmapRunner.WasStopped(scanID) {
		if s.NmapRunner.WasStopped(scanID) {
			s.DB.UpdateScanStatus(scanID, "stopped", 0, "")
			s.LogAndNotify("scan_stopped", fmt.Sprintf("Scan on %s stopped", target), username)
		} else {
			s.DB.UpdateScanStatus(scanID, "error", 0, "")
			s.LogAndNotify("scan_error", fmt.Sprintf("Scan on %s failed: %s", target, err.Error()), username)
		}
		s.NmapRunner.ClearPhase(scanID)
		return
	}

	// Try to parse as nmap XML if it starts with "nmap"
	var discoveredHosts, discoveredPorts int
	isNmap := strings.HasPrefix(strings.ToLower(cmdStr), "nmap")
	if isNmap {
		xmlFile := filepath.Join(outDir, "scan.xml")
		xmlBytes, readErr := os.ReadFile(xmlFile)
		if readErr == nil {
			xmlData := string(xmlBytes)
			s.DB.UpdateScanXML(scanID, xmlData)
			hosts, ports, portScripts, hostScripts, parseErr := nmap.ParseXML(xmlData)
			if parseErr == nil {
				discoveredHosts = len(hosts)
				discoveredPorts = len(ports)
				hostMap, _, saveErr := s.DB.SaveResults(scanID, hosts, ports)
				if saveErr == nil {
					if len(portScripts) > 0 {
					if err := s.DB.SavePortScripts(hostMap, portScripts); err != nil {
						LogError("Save port scripts failed", map[string]interface{}{"scan_id": scanID, "error": err})
					}
					}
					if len(hostScripts) > 0 {
					if err := s.DB.SaveHostScripts(hostMap, hostScripts); err != nil {
						LogError("Save host scripts failed", map[string]interface{}{"scan_id": scanID, "error": err})
					}
					}
				}
			}
		}
	}

	s.DB.UpdateScanStatus(scanID, "completed", 100, s.NmapRunner.GetPhase(scanID))
	if discoveredPorts > 0 {
		s.LogAndNotify("scan_completed", fmt.Sprintf("Scan on %s completed: %d hosts, %d ports found", target, discoveredHosts, discoveredPorts), username)
	} else if discoveredHosts > 0 {
		s.LogAndNotify("scan_completed", fmt.Sprintf("Scan on %s completed: %d hosts found", target, discoveredHosts), username)
	} else {
		s.LogAndNotify("scan_completed", fmt.Sprintf("Scan on %s completed", target), username)
	}
	s.NmapRunner.ClearPhase(scanID)
}

func (s *Server) HandleStopScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	id := r.PathValue("id")
	scanID := parseIntID(id)

	if s.NmapRunner.Stop(scanID) {
		s.DB.UpdateScanStatus(scanID, "stopped", 0, "")
	}

	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleScanLog(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)
	if !s.requireScanAccess(w, r, scanID) {
		return
	}
	format := r.URL.Query().Get("format")

	scan, err := s.DB.GetScan(scanID)
	if err != nil {
		jsonResponse(w, 404, map[string]string{"error": "scan not found"})
		return
	}

	if format == "" {
		format = "log"
	}

	outDir := scan.OutputDir
	if outDir == "" {
		outDir = filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scanID))
	}

	if s.NmapRunner.IsRunning(scanID) {
		log := s.NmapRunner.GetOutput(scanID)
		jsonResponse(w, 200, map[string]string{"status": scan.Status, "log": log})
		return
	}

	var filePath string
	switch format {
	case "xml":
		filePath = filepath.Join(outDir, "scan.xml")
	case "nmap":
		filePath = filepath.Join(outDir, "scan.nmap")
	case "gnmap":
		filePath = filepath.Join(outDir, "scan.gnmap")
	default:
		filePath = filepath.Join(outDir, "output.log")
	}

	if data, err := os.ReadFile(filePath); err == nil && len(data) > 0 {
		jsonResponse(w, 200, map[string]string{"status": scan.Status, "log": string(data)})
		return
	}

	jsonResponse(w, 200, map[string]string{"status": scan.Status, "log": ""})
}

func (s *Server) HandleDownloadXML(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)
	if !s.requireScanAccess(w, r, scanID) {
		return
	}

	xmlData, err := s.DB.GetScanXML(scanID)
	if err != nil || xmlData == "" {
		if s.NmapRunner.IsRunning(scanID) {
			xmlData = s.NmapRunner.GetOutput(scanID)
		}
	}
	if xmlData == "" {
		jsonResponse(w, 404, map[string]string{"error": "no XML data available"})
		return
	}

	scan, err := s.DB.GetScan(scanID)
	if err != nil {
		LogWarn("HandleDownloadXML: GetScan failed", map[string]interface{}{"scan_id": scanID, "error": err})
	}
	filename := "scan"
	if scan != nil {
		filename = strings.ReplaceAll(scan.Target, "/", "_") + "-" + scan.Profile
		filename = sanitizeFilename(filename)
	}

	w.Header().Set("Content-Type", "application/xml")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xml", filename))
	w.Write([]byte(xmlData))
}

func (s *Server) HandleDownloadNmap(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)
	if !s.requireScanAccess(w, r, scanID) {
		return
	}

	data, err := s.readScanFile(scanID, "scan.nmap")
	if err != nil {
		jsonResponse(w, 404, map[string]string{"error": "no nmap output available"})
		return
	}

	scan, err := s.DB.GetScan(scanID)
	if err != nil {
		LogWarn("HandleDownloadNmap: GetScan failed", map[string]interface{}{"scan_id": scanID, "error": err})
	}
	filename := "scan"
	if scan != nil {
		filename = strings.ReplaceAll(scan.Target, "/", "_") + "-" + scan.Profile
		filename = sanitizeFilename(filename)
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.nmap", filename))
	w.Write(data)
}

func (s *Server) HandleDownloadGnmap(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)
	if !s.requireScanAccess(w, r, scanID) {
		return
	}

	data, err := s.readScanFile(scanID, "scan.gnmap")
	if err != nil {
		jsonResponse(w, 404, map[string]string{"error": "no grepable output available"})
		return
	}

	scan, err := s.DB.GetScan(scanID)
	if err != nil {
		LogWarn("HandleDownloadGnmap: GetScan failed", map[string]interface{}{"scan_id": scanID, "error": err})
	}
	filename := "scan"
	if scan != nil {
		filename = strings.ReplaceAll(scan.Target, "/", "_") + "-" + scan.Profile
		filename = sanitizeFilename(filename)
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.gnmap", filename))
	w.Write(data)
}

func (s *Server) readScanFile(scanID int, filename string) ([]byte, error) {
	outDir, err := s.DB.GetScanOutputDir(scanID)
	if err != nil || outDir == "" {
		outDir = filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scanID))
	}

	data, err := os.ReadFile(filepath.Join(outDir, filename))
	if err != nil {
		return nil, err
	}
	return data, nil
}

func (s *Server) HandleScanStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)
	if !s.requireScanAccess(w, r, scanID) {
		return
	}

	status, err := s.DB.GetScanProgress(scanID)
	if err != nil {
		serverError(w, err)
		return
	}
	// For running scans, prefer in-memory phase (more up-to-date); fall back to DB
	if status.Phase == "" {
		phase := s.NmapRunner.GetPhase(scanID)
		if phase != "" {
			status.Phase = phase
		}
	}
	jsonResponse(w, 200, status)
}

func (s *Server) HandleScanResults(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)
	if !s.requireScanAccess(w, r, scanID) {
		return
	}

	page := parseIntID(r.URL.Query().Get("page"))
	limit := parseIntID(r.URL.Query().Get("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 1000 {
		limit = 100
	}

	paginated, err := s.DB.GetResultsPaginated(scanID, page, limit)
	if err == nil && paginated.Total > 0 {
		jsonResponse(w, 200, paginated)
		return
	}

	// Fallback: parse from scans/{scanID}/scan.xml (returns all results as one page)

	// Fallback: parse from scans/{scanID}/scan.xml
	outDir := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scanID))
	xmlPath := filepath.Join(outDir, "scan.xml")
	if xmlData, err := os.ReadFile(xmlPath); err == nil {
		hosts, ports, _, _, parseErr := nmap.ParseXML(string(xmlData))
		if parseErr == nil {
			hostMap := make(map[int]db.Host)
			for _, h := range hosts {
				hostMap[h.ID] = h
			}
			fileResults := make([]db.ResultRow, 0, len(ports))
			for _, p := range ports {
				h := hostMap[p.HostID]
				fileResults = append(fileResults, db.ResultRow{
					HostID:     h.ID,
					PortID:     p.ID,
					IP:         h.IP,
					MAC:        h.MAC,
					Hostname:   h.Hostname,
					OS:         h.OS,
					HostStatus: h.Status,
					Port:       p.Port,
					Protocol:   p.Protocol,
					State:      p.State,
					Service:    p.Service,
					Version:    p.Version,
					ExtraInfo:  p.ExtraInfo,
					Product:    p.Product,
					Reason:     p.Reason,
				})
			}
			if len(fileResults) > 0 {
				jsonResponse(w, 200, &db.PaginatedResults{Results: fileResults, Total: len(fileResults), Page: 1, Limit: len(fileResults)})
				return
			}
		}
	}

	// Fallback: return host-only results (e.g. discovery scans with no ports)
	hosts, hostErr := s.DB.GetHostsForScan(scanID)
	if hostErr == nil && len(hosts) > 0 {
		hostResults := make([]db.ResultRow, 0, len(hosts))
		for _, h := range hosts {
			hostResults = append(hostResults, db.ResultRow{
				HostID:     h.ID,
				IP:         h.IP,
				MAC:        h.MAC,
				Hostname:   h.Hostname,
				OS:         h.OS,
				HostStatus: h.Status,
				State:      h.Status,
			})
		}
		jsonResponse(w, 200, &db.PaginatedResults{Results: hostResults, Total: len(hostResults), Page: 1, Limit: len(hostResults)})
		return
	}

	jsonResponse(w, 200, &db.PaginatedResults{Results: []db.ResultRow{}, Total: 0, Page: 1, Limit: 100})
}

func (s *Server) HandleScanByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)

	switch r.Method {
	case "DELETE":
		user := getRequestUser(r)
		if user == nil || user.Role != "admin" {
			jsonResponse(w, 403, map[string]string{"error": "admin required"})
			return
		}
		if err := s.DB.DeleteScan(scanID); err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) HandleConfirmScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	id := r.PathValue("id")
	scanID := parseIntID(id)

	scan, err := s.DB.GetScan(scanID)
	if err != nil {
		jsonResponse(w, 404, map[string]string{"error": "scan not found"})
		return
	}

	if scan.Status != "completed" {
		jsonResponse(w, 400, map[string]string{"error": "scan not completed yet"})
		return
	}

	if scan.Confirmed == 1 {
		jsonResponse(w, 400, map[string]string{"error": "already confirmed"})
		return
	}

	if err := s.DB.ConfirmScan(scanID); err != nil {
		log.Printf("Confirm scan %d error: %v", scanID, err)
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "confirmed"})
}

func (s *Server) HandleConfirmAllScans(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	pid := r.PathValue("id")
	projectID := parseIntID(pid)

	count, err := s.DB.ConfirmAllPending(projectID)
	if err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]interface{}{"confirmed": count})
}

func (s *Server) HandleRejectScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	id := r.PathValue("id")
	scanID := parseIntID(id)

	if err := s.DB.RejectScan(scanID); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "rejected"})
}

func (s *Server) BackfillAllScripts() {
	projects, err := s.DB.GetProjects()
	if err != nil {
		return
	}

	for _, proj := range projects {
		scans, err := s.DB.GetAllScans(proj.ID)
		if err != nil {
			continue
		}

		for _, scan := range scans {
			xmlPath := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scan.ID), "scan.xml")
			xmlBytes, err := os.ReadFile(xmlPath)
			if err != nil || len(xmlBytes) == 0 {
				xml, xmlErr := s.DB.GetScanXML(scan.ID)
				if xmlErr != nil || xml == "" {
					continue
				}
				xmlBytes = []byte(xml)
			}

			_, _, portScripts, hostScripts, parseErr := nmap.ParseXML(string(xmlBytes))
			if parseErr != nil {
				continue
			}

			s.DB.BackfillScripts(scan.ID, portScripts, hostScripts)
		}
	}
}

func (s *Server) HandleBackfillScripts(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		ProjectID int `json:"project_id"`
	}
	jsonDecode(r, &req)

	projects, err := s.DB.GetProjects()
	if err != nil {
		serverError(w, err)
		return
	}

	targetProjects := projects
	if req.ProjectID > 0 {
		filtered := []db.Project{}
		for _, p := range projects {
			if p.ID == req.ProjectID {
				filtered = append(filtered, p)
				break
			}
		}
		if len(filtered) > 0 {
			targetProjects = filtered
		}
	}

	totalPS := 0
	totalHS := 0
	scansProcessed := 0
	scansSkipped := 0

	for _, proj := range targetProjects {
		scans, err := s.DB.GetAllScans(proj.ID)
		if err != nil {
			log.Printf("backfill: get scans project %d: %v", proj.ID, err)
			continue
		}

		for _, scan := range scans {
			xmlPath := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scan.ID), "scan.xml")
			xmlBytes, err := os.ReadFile(xmlPath)
			if err != nil || len(xmlBytes) == 0 {
				xml, xmlErr := s.DB.GetScanXML(scan.ID)
				if xmlErr != nil || xml == "" {
					scansSkipped++
					continue
				}
				xmlBytes = []byte(xml)
			}

			_, _, portScripts, hostScripts, parseErr := nmap.ParseXML(string(xmlBytes))
			if parseErr != nil {
				scansSkipped++
				continue
			}

			ps, hs, backfillErr := s.DB.BackfillScripts(scan.ID, portScripts, hostScripts)
			if backfillErr != nil {
				scansSkipped++
				continue
			}
			totalPS += ps
			totalHS += hs
			scansProcessed++
		}
	}

	jsonResponse(w, 200, map[string]interface{}{
		"status":          "ok",
		"port_scripts":    totalPS,
		"host_scripts":    totalHS,
		"scans_processed": scansProcessed,
		"scans_skipped":   scansSkipped,
	})
}

func (s *Server) HandleBackfillSingleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	id := r.PathValue("id")
	scanID := parseIntID(id)

	xmlPath := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", scanID), "scan.xml")
	xmlBytes, err := os.ReadFile(xmlPath)
	if err != nil || len(xmlBytes) == 0 {
		xml, dbErr := s.DB.GetScanXML(scanID)
		if dbErr != nil || xml == "" {
			jsonResponse(w, 400, map[string]string{"error": "no xml for this scan"})
			return
		}
		xmlBytes = []byte(xml)
	}

	_, _, portScripts, hostScripts, parseErr := nmap.ParseXML(string(xmlBytes))
	if parseErr != nil {
		serverError(w, parseErr)
		return
	}

	ps, hs, backfillErr := s.DB.BackfillScripts(scanID, portScripts, hostScripts)
	if backfillErr != nil {
		serverError(w, backfillErr)
		return
	}

	jsonResponse(w, 200, map[string]interface{}{
		"status":       "ok",
		"port_scripts": ps,
		"host_scripts": hs,
	})
}

func parseNmapProgress(data string) (int, string) {
	if data == "" {
		return 0, ""
	}
	phase := parseNmapVerboseState(data)
	if phase != "" {
		return 0, phase
	}
	return 0, "Starting..."
}

func parseNmapVerboseState(data string) string {
	lines := strings.Split(data, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		if isNmapDataLine(line) {
			continue
		}
		return line
	}
	return ""
}

func (s *Server) HandleScanCompare(w http.ResponseWriter, r *http.Request) {
	scan1ID := parseIntID(r.URL.Query().Get("scan1"))
	scan2ID := parseIntID(r.URL.Query().Get("scan2"))
	if scan1ID == 0 || scan2ID == 0 {
		jsonResponse(w, 400, map[string]string{"error": "scan1 and scan2 query params required"})
		return
	}

	results1, err := s.DB.GetResults(scan1ID)
	if err != nil {
		serverError(w, err)
		return
	}
	results2, err := s.DB.GetResults(scan2ID)
	if err != nil {
		serverError(w, err)
		return
	}

	scan1, _ := s.DB.GetScan(scan1ID)
	scan2, _ := s.DB.GetScan(scan2ID)

	hosts1 := make(map[string]bool)
	hostMap1 := make(map[string][]db.ResultRow)
	for _, r := range results1 {
		hosts1[r.IP] = true
		hostMap1[r.IP] = append(hostMap1[r.IP], r)
	}

	hosts2 := make(map[string]bool)
	hostMap2 := make(map[string][]db.ResultRow)
	for _, r := range results2 {
		hosts2[r.IP] = true
		hostMap2[r.IP] = append(hostMap2[r.IP], r)
	}

	var comp db.ScanComparison

	if scan1 != nil {
		t := ""
		if !scan1.StartedAt.IsZero() {
			t = scan1.StartedAt.Format("2006-01-02 15:04")
		}
		comp.Scan1 = db.ScanInfo{ID: scan1.ID, Target: scan1.Target, Profile: scan1.Profile, StartedAt: t}
	}
	if scan2 != nil {
		t := ""
		if !scan2.StartedAt.IsZero() {
			t = scan2.StartedAt.Format("2006-01-02 15:04")
		}
		comp.Scan2 = db.ScanInfo{ID: scan2.ID, Target: scan2.Target, Profile: scan2.Profile, StartedAt: t}
	}

	// hosts added (in scan2 but not scan1)
	for ip := range hosts2 {
		if !hosts1[ip] {
			rows := hostMap2[ip]
			if len(rows) > 0 {
				comp.HostsAdded = append(comp.HostsAdded, db.DiffHost{
					IP: ip, MAC: rows[0].MAC, Hostname: rows[0].Hostname, OS: rows[0].OS, Status: rows[0].HostStatus,
				})
			}
		}
	}
	// hosts removed (in scan1 but not scan2)
	for ip := range hosts1 {
		if !hosts2[ip] {
			rows := hostMap1[ip]
			if len(rows) > 0 {
				comp.HostsRemoved = append(comp.HostsRemoved, db.DiffHost{
					IP: ip, MAC: rows[0].MAC, Hostname: rows[0].Hostname, OS: rows[0].OS, Status: rows[0].HostStatus,
				})
			}
		}
	}

	portKey := func(ip, proto string, port int) string {
		return fmt.Sprintf("%s|%s|%d", ip, proto, port)
	}

	portMap1 := make(map[string]db.ResultRow)
	portMap2 := make(map[string]db.ResultRow)
	allPortKeys := make(map[string]bool)

	for _, r := range results1 {
		if r.Port == 0 {
			continue
		}
		k := portKey(r.IP, r.Protocol, r.Port)
		portMap1[k] = r
		allPortKeys[k] = true
	}
	for _, r := range results2 {
		if r.Port == 0 {
			continue
		}
		k := portKey(r.IP, r.Protocol, r.Port)
		portMap2[k] = r
		allPortKeys[k] = true
	}

	for k := range allPortKeys {
		p1, in1 := portMap1[k]
		p2, in2 := portMap2[k]
		if in2 && !in1 {
			comp.PortsAdded = append(comp.PortsAdded, toDiffPort(p2, db.DiffPort{}))
		} else if in1 && !in2 {
			comp.PortsRemoved = append(comp.PortsRemoved, toDiffPort(p1, db.DiffPort{}))
		} else if in1 && in2 {
			if p1.State != p2.State || p1.Service != p2.Service || p1.Product != p2.Product || p1.Version != p2.Version || p1.ExtraInfo != p2.ExtraInfo {
				comp.PortsChanged = append(comp.PortsChanged, toDiffPort(p2, db.DiffPort{
					OldState: p1.State, OldService: p1.Service, OldProduct: p1.Product, OldVersion: p1.Version, OldExtra: p1.ExtraInfo,
				}))
			}
		}
	}

	portCount1 := 0
	for _, r := range results1 {
		if r.Port != 0 {
			portCount1++
		}
	}
	portCount2 := 0
	for _, r := range results2 {
		if r.Port != 0 {
			portCount2++
		}
	}

	comp.Summary = db.DiffSummary{
		HostsInScan1: len(hosts1), HostsInScan2: len(hosts2),
		HostsAdded: len(comp.HostsAdded), HostsRemoved: len(comp.HostsRemoved),
		PortsInScan1: portCount1, PortsInScan2: portCount2,
		PortsAdded: len(comp.PortsAdded), PortsRemoved: len(comp.PortsRemoved), PortsChanged: len(comp.PortsChanged),
	}

	jsonResponse(w, 200, comp)
}

func toDiffPort(r db.ResultRow, old db.DiffPort) db.DiffPort {
	return db.DiffPort{
		IP: r.IP, Port: r.Port, Protocol: r.Protocol,
		State: r.State, Service: r.Service, Product: r.Product, Version: r.Version, Extra: r.ExtraInfo,
		OldState: old.OldState, OldService: old.OldService, OldProduct: old.OldProduct, OldVersion: old.OldVersion, OldExtra: old.OldExtra,
	}
}

func isNmapDataLine(line string) bool {
	if len(line) > 200 {
		return true
	}
	// NSE script output
	if strings.HasPrefix(line, "|") || strings.HasPrefix(line, "_") {
		return true
	}
	// Service fingerprint data
	if strings.HasPrefix(line, "SF:") {
		return true
	}
	// Indented fingerprint data (4+ leading spaces after trim = it's multi-line)
	trimmed := strings.TrimLeft(line, " ")
	if len(line)-len(trimmed) >= 4 {
		return true
	}
	// Table header
	if strings.HasPrefix(line, "PORT") && strings.Contains(line, "STATE") {
		return true
	}
	// Report metadata
	skipPrefixes := []string{
		"Not shown:", "TRACEROUTE", "HOP RTT", "MAC Address:",
		"Device type:", "Running:", "OS CPE:", "OS details:",
		"Uptime guess:", "Network Distance:", "Service Info:",
		"TCP/IP fingerprint:", "Host script results:",
		"Too many fingerprints", "Warning:", "Failed to",
	}
	for _, p := range skipPrefixes {
		if strings.HasPrefix(line, p) {
			return true
		}
	}
	// Fingerprint continuation lines (OS: with long data)
	if strings.HasPrefix(line, "OS:") && len(line) > 80 {
		return true
	}
	return false
}
