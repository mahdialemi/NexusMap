package handlers

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"scanner-mgmt/internal/db"
	"scanner-mgmt/internal/export"
	"scanner-mgmt/internal/nmap"
)

type fileData struct {
	data     []byte
	filename string
}

func parseRawText(rawText string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, string, error) {
	rawText = strings.TrimSpace(rawText)
	if rawText == "" {
		return nil, nil, nil, nil, "", nil
	}
	if strings.HasPrefix(rawText, "<?xml") || strings.HasPrefix(rawText, "<nmaprun") {
		h, p, ps, hs, err := nmap.ParseXML(rawText)
		return h, p, ps, hs, "XML", err
	}
	if strings.Contains(rawText, "Host:") && strings.Contains(rawText, "Ports:") {
		h, p, ps, hs, err := nmap.ParseImportGnmap(rawText)
		return h, p, ps, hs, "Gnmap", err
	}
	if strings.Contains(rawText, "# Nmap") || strings.HasPrefix(rawText, "Nmap scan report for") {
		h, p, ps, hs, err := nmap.ParseNmapNormal(rawText)
		return h, p, ps, hs, "Nmap", err
	}
	return nil, nil, nil, nil, "", fmt.Errorf("unrecognized format")
}

func parseUploadedFile(data []byte, key string) ([]db.Host, []db.Port, []db.PortScript, []db.HostScript, string, error) {
	switch key {
	case "xml":
		h, p, ps, hs, err := nmap.ParseXML(string(data))
		return h, p, ps, hs, "XML", err
	case "nmap":
		h, p, ps, hs, err := nmap.ParseNmapNormal(string(data))
		return h, p, ps, hs, "Nmap", err
	case "gnmap":
		h, p, ps, hs, err := nmap.ParseImportGnmap(string(data))
		return h, p, ps, hs, "Gnmap", err
	case "csv":
		h, p, ps, hs, err := nmap.ParseCSV(string(data))
		return h, p, ps, hs, "CSV", err
	case "json":
		h, p, ps, hs, err := nmap.ParseJSON(string(data))
		return h, p, ps, hs, "JSON", err
	default:
		return nil, nil, nil, nil, "", fmt.Errorf("unsupported file type: %s", key)
	}
}

func parseZipFile(data []byte) (map[string]*fileData, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	out := make(map[string]*fileData)
	for _, zf := range zr.File {
		if zf.FileInfo().IsDir() {
			continue
		}
		ext := strings.TrimPrefix(filepath.Ext(zf.Name), ".")
		key := ""
		switch ext {
		case "xml":
			key = "xml"
		case "nmap":
			key = "nmap"
		case "gnmap":
			key = "gnmap"
		case "csv":
			key = "csv"
		case "json":
			key = "json"
		default:
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			continue
		}
		d, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			continue
		}
		out[key] = &fileData{data: d, filename: zf.Name}
	}
	return out, nil
}

func (s *Server) HandleImportPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	r.ParseMultipartForm(50 << 20)

	rawText := r.FormValue("raw_text")

	files := make(map[string]*fileData)

	for _, key := range []string{"xml", "nmap", "gnmap", "csv", "json", "zip"} {
		f, h, err := r.FormFile("file_" + key)
		if err != nil {
			continue
		}
		d, err := io.ReadAll(f)
		if err != nil {
			f.Close()
			continue
		}
		f.Close()
		fn := h.Filename
		if formFn := r.FormValue("filename_" + key); formFn != "" {
			fn = formFn
		}
		if key == "zip" {
			extracted, err := parseZipFile(d)
			if err != nil {
				continue
			}
			for k, v := range extracted {
				if _, exists := files[k]; !exists {
					files[k] = v
				}
			}
		} else {
			files[key] = &fileData{data: d, filename: fn}
		}
	}

	if len(files) == 0 && rawText == "" {
		jsonResponse(w, 400, map[string]string{"error": "no file or raw text provided"})
		return
	}

	type previewItem struct {
		IP       string `json:"ip"`
		Hostname string `json:"hostname"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
		State    string `json:"state"`
		Service  string `json:"service"`
	}

	var totalHosts, totalPorts int
	var format string
	items := []previewItem{}
	seenHosts := map[string]bool{}

	for _, key := range []string{"xml", "nmap", "gnmap", "csv", "json"} {
		if f, ok := files[key]; ok {
			h, p, _, _, fmtName, err := parseUploadedFile(f.data, key)
			if err == nil {
				totalHosts += len(h)
				totalPorts += len(p)
				if format == "" {
					format = fmtName
				}
				for _, host := range h {
					if !seenHosts[host.IP] {
						seenHosts[host.IP] = true
					}
				}
				for _, port := range p {
					items = append(items, previewItem{
						IP:       port.IP,
						Hostname: "",
						Port:     port.Port,
						Protocol: port.Protocol,
						State:    port.State,
						Service:  port.Service,
					})
				}
			}
		}
	}

	if rawText != "" {
		h, p, _, _, fmtName, err := parseRawText(rawText)
		if err == nil {
			totalHosts += len(h)
			totalPorts += len(p)
			if format == "" {
				format = fmtName
			} else {
				format = format + "+" + fmtName
			}
			for _, host := range h {
				if !seenHosts[host.IP] {
					seenHosts[host.IP] = true
				}
			}
			for _, port := range p {
				items = append(items, previewItem{
					IP:       port.IP,
					Hostname: "",
					Port:     port.Port,
					Protocol: port.Protocol,
					State:    port.State,
					Service:  port.Service,
				})
			}
		}
	}

	if format == "" {
		jsonResponse(w, 400, map[string]string{"error": "unsupported file format"})
		return
	}

	if len(items) > 500 {
		items = items[:500]
	}

	jsonResponse(w, 200, map[string]interface{}{
		"format": format,
		"hosts":  totalHosts,
		"ports":  totalPorts,
		"items":  items,
	})
}

func (s *Server) HandleImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	r.ParseMultipartForm(50 << 20)
	pid := parseIntID(r.PathValue("project_id"))
	if !s.requireProjectAccess(w, r, pid) {
		return
	}

	rawText := r.FormValue("raw_text")

	files := make(map[string]*fileData)

	for _, key := range []string{"xml", "nmap", "gnmap", "csv", "json", "zip"} {
		f, h, err := r.FormFile("file_" + key)
		if err != nil {
			continue
		}
		d, err := io.ReadAll(f)
		if err != nil {
			f.Close()
			continue
		}
		f.Close()
		fn := h.Filename
		if formFn := r.FormValue("filename_" + key); formFn != "" {
			fn = formFn
		}
		if key == "zip" {
			extracted, err := parseZipFile(d)
			if err != nil {
				continue
			}
			for k, v := range extracted {
				if _, exists := files[k]; !exists {
					files[k] = v
				}
			}
		} else {
			files[key] = &fileData{data: d, filename: fn}
		}
	}

	if len(files) == 0 && rawText == "" {
		jsonResponse(w, 400, map[string]string{"error": "no file or raw text provided"})
		return
	}

	importName := r.FormValue("name")
	profile := r.FormValue("profile")
	if profile == "" {
		profile = "imported"
	}
	autoConfirm := r.FormValue("auto_confirm") == "true"
	mergeScan := r.FormValue("merge_scan")

	var allHosts []db.Host
	var allPorts []db.Port
	var allPortScripts []db.PortScript
	var allHostScripts []db.HostScript
	var usedFormat string
	var usedFilename string

	for _, key := range []string{"xml", "nmap", "gnmap", "csv", "json"} {
		if f, ok := files[key]; ok {
			h, p, ps, hs, fmtName, err := parseUploadedFile(f.data, key)
			if err == nil && usedFormat == "" {
				usedFormat = fmtName
				usedFilename = f.filename
				allHosts = append(allHosts, h...)
				allPorts = append(allPorts, p...)
				allPortScripts = append(allPortScripts, ps...)
				allHostScripts = append(allHostScripts, hs...)
			}
		}
	}

	if rawText != "" {
		h, p, ps, hs, fmtName, err := parseRawText(rawText)
		if err == nil {
			if usedFormat == "" {
				usedFormat = fmtName
			} else {
				usedFormat = usedFormat + "+" + fmtName
			}
			allHosts = append(allHosts, h...)
			allPorts = append(allPorts, p...)
			allPortScripts = append(allPortScripts, ps...)
			allHostScripts = append(allHostScripts, hs...)
		}
	}

	if usedFormat == "" {
		jsonResponse(w, 400, map[string]string{"error": "unsupported file format"})
		return
	}

	if importName == "" {
		if rawText != "" {
			importName = "pasted-output"
		} else if usedFilename != "" {
			importName = usedFilename
		}
	}

	var sid int
	if mergeScan != "" {
		sid = parseIntID(mergeScan)
	} else {
		scanID, err := s.DB.CreateScan(pid, "import", importName, usedFormat, nil)
		if err != nil {
			serverError(w, err)
			return
		}
		sid = int(scanID)

		outDir := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid))
		os.MkdirAll(outDir, 0755)
		s.DB.UpdateScanOutputDir(sid, outDir)
	}

	hostMap, _, saveErr := s.DB.SaveResults(sid, allHosts, allPorts)
	if saveErr != nil {
		serverError(w, saveErr)
		return
	}

	if len(allPortScripts) > 0 {
		s.DB.SavePortScripts(hostMap, allPortScripts)
	}
	if len(allHostScripts) > 0 {
		s.DB.SaveHostScripts(hostMap, allHostScripts)
	}

	if mergeScan == "" {
		hasXML := false
		hasNmap := false
		hasGnmap := false

		if f, ok := files["xml"]; ok {
			s.DB.UpdateScanXML(sid, string(f.data))
			os.WriteFile(filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid), "scan.xml"), f.data, 0644)
			hasXML = true
		}
		if f, ok := files["nmap"]; ok {
			s.DB.UpdateScanNmap(sid, string(f.data))
			os.WriteFile(filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid), "scan.nmap"), f.data, 0644)
			hasNmap = true
		}
		if f, ok := files["gnmap"]; ok {
			s.DB.UpdateScanGnmap(sid, string(f.data))
			os.WriteFile(filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid), "scan.gnmap"), f.data, 0644)
			hasGnmap = true
		}

		outDir := filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid))
		results, _ := s.DB.GetResults(sid)
		gScan, _ := s.DB.GetScan(sid)

		if !hasXML {
			if data, err := export.ToXML(results, gScan); err == nil {
				s.DB.UpdateScanXML(sid, string(data))
				os.WriteFile(filepath.Join(outDir, "scan.xml"), data, 0644)
			}
		}
		if !hasNmap {
			if data, err := export.ToNmap(results, gScan); err == nil {
				s.DB.UpdateScanNmap(sid, string(data))
				os.WriteFile(filepath.Join(outDir, "scan.nmap"), data, 0644)
			}
		}
		if !hasGnmap {
			if data, err := export.ToGnmap(results, gScan); err == nil {
				s.DB.UpdateScanGnmap(sid, string(data))
				os.WriteFile(filepath.Join(outDir, "scan.gnmap"), data, 0644)
			}
		}

		s.DB.UpdateScanStatus(sid, "completed", 100, "")

		if autoConfirm {
			if cErr := s.DB.ConfirmScan(sid); cErr != nil {
				log.Printf("auto-confirm failed: %v", cErr)
			}
		}
	}

	jsonResponse(w, 200, map[string]interface{}{"scan_id": sid, "auto_confirmed": autoConfirm})
}

func (s *Server) HandleImportHistory(w http.ResponseWriter, r *http.Request) {
	pid := parseIntID(r.PathValue("project_id"))
	if !s.requireProjectAccess(w, r, pid) {
		return
	}
	scans, err := s.DB.GetImportHistory(pid)
	if err != nil {
		serverError(w, err)
		return
	}
	type historyItem struct {
		ID        int        `json:"id"`
		Name      string     `json:"name"`
		Format    string     `json:"format"`
		Profile   string     `json:"profile"`
		Status    string     `json:"status"`
		HostCount int        `json:"host_count"`
		PortCount int        `json:"port_count"`
		ScanID    int        `json:"scan_id"`
		CreatedAt time.Time  `json:"created_at"`
	}
	items := []historyItem{}
	for _, s := range scans {
		items = append(items, historyItem{
			ID:        s.ID,
			Name:      s.Target,
			Format:    s.NmapCommand,
			Profile:   s.Profile,
			Status:    s.Status,
			HostCount: s.HostCount,
			PortCount: s.PortCount,
			ScanID:    s.ID,
			CreatedAt: s.StartedAt,
		})
	}
	jsonResponse(w, 200, map[string]interface{}{"imports": items})
}

func (s *Server) HandleUnifiedExport(w http.ResponseWriter, r *http.Request) {
	scanID := r.PathValue("scan_id")
	format := r.PathValue("format")
	sid := parseIntID(scanID)
	if !s.requireScanAccess(w, r, sid) {
		return
	}

	scan, _ := s.DB.GetScan(sid)
	scanName := fmt.Sprintf("scan-%d", sid)
	if scan != nil {
		scanName = strings.ReplaceAll(scan.Target, "/", "_") + "-" + scan.Profile
	}

	outDir := ""
	if scan != nil {
		outDir = scan.OutputDir
	}
	if outDir == "" {
		outDir = filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid))
	}

	switch format {
	case "xlsx":
		results, err := s.DB.GetResults(sid)
		if err != nil {
			serverError(w, err)
			return
		}
		scripts, _ := s.DB.GetScanScriptsForExport(sid)
		data, err := export.ToExcelWithScripts(results, scan, scripts)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xlsx", scanName))
		w.Write(data)

	case "json":
		results, err := s.DB.GetResults(sid)
		if err != nil {
			serverError(w, err)
			return
		}
		data, err := export.ToJSON(results)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.json", scanName))
		w.Write(data)

	case "csv":
		results, err := s.DB.GetResults(sid)
		if err != nil {
			serverError(w, err)
			return
		}
		scripts, _ := s.DB.GetScanScriptsForExport(sid)
		data, err := export.ToCSVWithScripts(results, scripts)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.csv", scanName))
		w.Write(data)

	case "xml":
		xmlData, err := s.DB.GetScanXML(sid)
		if err == nil && xmlData != "" {
			w.Header().Set("Content-Type", "application/xml")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xml", scanName))
			w.Write([]byte(xmlData))
			return
		}
		if data, rErr := os.ReadFile(filepath.Join(outDir, "scan.xml")); rErr == nil {
			w.Header().Set("Content-Type", "application/xml")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xml", scanName))
			w.Write(data)
			return
		}
		results, resErr := s.DB.GetResults(sid)
		if resErr != nil {
			jsonResponse(w, 404, map[string]string{"error": "no XML data available"})
			return
		}
		generated, genErr := export.ToXML(results, scan)
		if genErr != nil {
			jsonResponse(w, 404, map[string]string{"error": "cannot generate XML"})
			return
		}
		out := append([]byte("<!-- System-generated, not original -->\n"), generated...)
		w.Header().Set("Content-Type", "application/xml")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xml", scanName))
		w.Write(out)

	case "nmap":
		nmapData, err := s.DB.GetScanNmap(sid)
		if err == nil && nmapData != "" {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.nmap", scanName))
			w.Write([]byte(nmapData))
			return
		}
		if data, rErr := os.ReadFile(filepath.Join(outDir, "scan.nmap")); rErr == nil {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.nmap", scanName))
			w.Write(data)
			return
		}
		data, genErr := s.generateNmapOutput(sid)
		if genErr != nil {
			jsonResponse(w, 404, map[string]string{"error": "no nmap output available"})
			return
		}
		out := append([]byte("# System-generated, not original\n"), data...)
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.nmap", scanName))
		w.Write(out)

	case "gnmap":
		gnmapData, err := s.DB.GetScanGnmap(sid)
		if err == nil && gnmapData != "" {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.gnmap", scanName))
			w.Write([]byte(gnmapData))
			return
		}
		if data, rErr := os.ReadFile(filepath.Join(outDir, "scan.gnmap")); rErr == nil {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.gnmap", scanName))
			w.Write(data)
			return
		}
		data, genErr := s.generateGnmapOutput(sid)
		if genErr != nil {
			jsonResponse(w, 404, map[string]string{"error": "no gnmap output available"})
			return
		}
		out := append([]byte("# System-generated, not original\n"), data...)
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.gnmap", scanName))
		w.Write(out)

	default:
		http.Error(w, "unsupported format", 400)
	}
}

func (s *Server) HandleExportAvailability(w http.ResponseWriter, r *http.Request) {
	sid := parseIntID(r.PathValue("scan_id"))
	if !s.requireScanAccess(w, r, sid) {
		return
	}

	scan, _ := s.DB.GetScan(sid)
	outDir := ""
	if scan != nil {
		outDir = scan.OutputDir
	}
	if outDir == "" {
		outDir = filepath.Join(s.NmapRunner.ScansDir(), fmt.Sprintf("%d", sid))
	}

	xmlData, _ := s.DB.GetScanXML(sid)
	nmapData, _ := s.DB.GetScanNmap(sid)
	gnmapData, _ := s.DB.GetScanGnmap(sid)

	hasXML := xmlData != "" || fileExists(filepath.Join(outDir, "scan.xml"))
	hasNmap := nmapData != "" || fileExists(filepath.Join(outDir, "scan.nmap"))
	hasGnmap := gnmapData != "" || fileExists(filepath.Join(outDir, "scan.gnmap"))

	jsonResponse(w, 200, map[string]interface{}{
		"xml":   hasXML,
		"nmap":  hasNmap,
		"gnmap": hasGnmap,
	})
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (s *Server) generateNmapOutput(scanID int) ([]byte, error) {
	results, err := s.DB.GetResults(scanID)
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return nil, fmt.Errorf("no results")
	}

	hosts := make(map[string][]db.ResultRow)
	hostInfo := make(map[string]db.ResultRow)
	for _, r := range results {
		hosts[r.IP] = append(hosts[r.IP], r)
		if _, ok := hostInfo[r.IP]; !ok {
			hostInfo[r.IP] = r
		}
	}

	var buf strings.Builder
	buf.WriteString("# Nmap done\n")
	for ip, ports := range hosts {
		h := hostInfo[ip]
		buf.WriteString(fmt.Sprintf("# Nmap done at %s\n", ip))
		buf.WriteString(fmt.Sprintf("Nmap scan report for %s", ip))
		if h.Hostname != "" {
			buf.WriteString(fmt.Sprintf(" (%s)", h.Hostname))
		}
		buf.WriteString("\n")
		buf.WriteString("Host is up\n")
		if h.MAC != "" {
			buf.WriteString(fmt.Sprintf("MAC Address: %s\n", h.MAC))
		}
		if h.OS != "" {
			buf.WriteString(fmt.Sprintf("OS: %s\n", h.OS))
		}
		buf.WriteString("PORT   STATE SERVICE\n")
		for _, p := range ports {
			line := fmt.Sprintf("%-6d %-14s %s", p.Port, p.State, p.Service)
			if p.Product != "" {
				line += " " + p.Product
			}
			if p.Version != "" {
				line += " " + p.Version
			}
			buf.WriteString(line + "\n")
		}
		buf.WriteString("\n")
	}
	return []byte(buf.String()), nil
}

func (s *Server) generateGnmapOutput(scanID int) ([]byte, error) {
	results, err := s.DB.GetResults(scanID)
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return nil, fmt.Errorf("no results")
	}

	hosts := make(map[string][]db.ResultRow)
	hostInfo := make(map[string]db.ResultRow)
	for _, r := range results {
		hosts[r.IP] = append(hosts[r.IP], r)
		if _, ok := hostInfo[r.IP]; !ok {
			hostInfo[r.IP] = r
		}
	}

	var buf strings.Builder
	for ip, ports := range hosts {
		buf.WriteString(fmt.Sprintf("Host: %s ()", ip))
		var portStrs []string
		for _, p := range ports {
			portStrs = append(portStrs, fmt.Sprintf("%d/%s/%s//%s//%s", p.Port, p.Protocol, p.State, p.Service, p.Version))
		}
		buf.WriteString(fmt.Sprintf(" Ports: %s\n", strings.Join(portStrs, ", ")))
	}
	return []byte(buf.String()), nil
}

func (s *Server) HandleExport(w http.ResponseWriter, r *http.Request) {
	scanID := r.PathValue("scan_id")
	format := r.PathValue("format")
	sid := parseIntID(scanID)

	results, err := s.DB.GetResults(sid)
	if err != nil {
		serverError(w, err)
		return
	}

	scan, _ := s.DB.GetScan(sid)
	scanName := fmt.Sprintf("scan-%d", sid)
	if scan != nil {
		scanName = strings.ReplaceAll(scan.Target, "/", "_") + "-" + scan.Profile
	}

	scripts, _ := s.DB.GetScanScriptsForExport(sid)

	switch format {
	case "xlsx":
		data, err := export.ToExcelWithScripts(results, scan, scripts)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xlsx", scanName))
		w.Write(data)

	case "json":
		data, err := export.ToJSON(results)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.json", scanName))
		w.Write(data)

	case "csv":
		data, err := export.ToCSVWithScripts(results, scripts)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.csv", scanName))
		w.Write(data)

	default:
		http.Error(w, "unsupported format", 400)
	}
}
