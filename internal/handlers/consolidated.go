package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/mahdialemi/NexusMap/internal/db"
	"github.com/mahdialemi/NexusMap/internal/export"
)

func (s *Server) HandleConsolidatedHosts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	hosts, err := s.DB.GetConsolidatedHosts(projectID)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, hosts)
}

func (s *Server) HandleConsolidatedPorts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	page := 1
	limit := 50
	search := r.URL.Query().Get("q")
	state := r.URL.Query().Get("state")
	service := r.URL.Query().Get("service")
	hideClosed := r.URL.Query().Get("hide_closed") == "1"
	if p := r.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	result, err := s.DB.GetConsolidatedPortsPaged(projectID, page, limit, search, state, service, hideClosed)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, result)
}

type bulkDeletePortsRequest struct {
	Ports []struct {
		IP       string `json:"ip"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
	} `json:"ports"`
}

func (s *Server) HandleConsolidatedBulkDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	var req bulkDeletePortsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request body"})
		return
	}
	if len(req.Ports) == 0 {
		jsonResponse(w, 400, map[string]string{"error": "no ports specified"})
		return
	}

	items := make([]db.BulkPortItem, len(req.Ports))
	for i, p := range req.Ports {
		items[i] = db.BulkPortItem{IP: p.IP, Port: p.Port, Protocol: p.Protocol}
	}
	if err := s.DB.DeleteConsolidatedPorts(projectID, items); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) getExportPorts(projectID int, r *http.Request) []db.ConsolidatedPort {
	q := r.URL.Query().Get("q")
	state := r.URL.Query().Get("state")
	service := r.URL.Query().Get("service")
	hideClosed := r.URL.Query().Get("hide_closed") == "1"
	filtersJSON := r.URL.Query().Get("filters")
	if filtersJSON != "" {
		var groups []db.FilterGroup
		if err := json.Unmarshal([]byte(filtersJSON), &groups); err == nil && len(groups) > 0 {
			filterMode := r.URL.Query().Get("filter_mode")
			if filterMode == "" {
				filterMode = "and"
			}
			req := &db.PortsQueryRequest{
				Page:       1,
				Limit:      100000,
				Search:     q,
				FilterMode: filterMode,
				Groups:     groups,
				HideClosed: hideClosed,
			}
			if result, err := s.DB.GetConsolidatedPortsFiltered(projectID, req); err == nil {
				return result.Ports
			}
		}
	}
	result, err := s.DB.GetConsolidatedPortsPaged(projectID, 1, 100000, q, state, service, hideClosed)
	if err != nil {
		return nil
	}
	return result.Ports
}

func (s *Server) HandleConsolidatedExportXLSX(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	ports := s.getExportPorts(projectID, r)
	hosts, _ := s.DB.GetConsolidatedHosts(projectID)
	scripts, _ := s.DB.GetConsolidatedScripts(projectID)

	proj, _ := s.DB.GetProject(projectID)
	name := fmt.Sprintf("consolidated-%d", projectID)
	if proj != nil {
		name = strings.ReplaceAll(proj.Name, " ", "-") + "-consolidated"
	}

	data, err := export.ToConsolidatedExcelWithScripts(hosts, ports, scripts)
	if err != nil {
		serverError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xlsx", name))
	w.Write(data)
}

func (s *Server) HandleConsolidatedExportJSON(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	ports := s.getExportPorts(projectID, r)
	hosts, _ := s.DB.GetConsolidatedHosts(projectID)
	scripts, _ := s.DB.GetConsolidatedScripts(projectID)

	proj, _ := s.DB.GetProject(projectID)
	name := fmt.Sprintf("consolidated-%d", projectID)
	if proj != nil {
		name = strings.ReplaceAll(proj.Name, " ", "-") + "-consolidated"
	}

	data, err := export.ToConsolidatedJSON(hosts, ports, scripts)
	if err != nil {
		serverError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.json", name))
	w.Write(data)
}

func (s *Server) HandleConsolidatedExportTXT(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	ports := s.getExportPorts(projectID, r)
	scripts, _ := s.DB.GetConsolidatedScripts(projectID)

	proj, _ := s.DB.GetProject(projectID)
	name := fmt.Sprintf("consolidated-%d", projectID)
	if proj != nil {
		name = strings.ReplaceAll(proj.Name, " ", "-") + "-consolidated"
	}

	data, err := export.ToConsolidatedTXT(ports, scripts)
	if err != nil {
		serverError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.txt", name))
	w.Write(data)
}

func (s *Server) HandleConsolidatedExportSizes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	ports := s.getExportPorts(projectID, r)
	hosts, _ := s.DB.GetConsolidatedHosts(projectID)
	scripts, _ := s.DB.GetConsolidatedScripts(projectID)

	sizes := map[string]int64{}

	// xlsx
	if data, err := export.ToConsolidatedExcelWithScripts(hosts, ports, scripts); err == nil {
		sizes["xlsx"] = int64(len(data))
	}

	// json
	if data, err := export.ToConsolidatedJSON(hosts, ports, scripts); err == nil {
		sizes["json"] = int64(len(data))
	}

	// txt
	if data, err := export.ToConsolidatedTXT(ports, scripts); err == nil {
		sizes["txt"] = int64(len(data))
	}

	jsonResponse(w, 200, sizes)
}

func (s *Server) HandleConsolidatedPortHistory(w http.ResponseWriter, r *http.Request) {
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
	portStr := r.URL.Query().Get("port")
	protocol := r.URL.Query().Get("protocol")

	if ip == "" || portStr == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip and port required"})
		return
	}

	var port int
	port = parseIntID(portStr)
	if protocol == "" {
		protocol = "tcp"
	}

	history, err := s.DB.GetPortHistory(projectID, ip, port, protocol)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, history)
}

func (s *Server) HandleConsolidatedPortRevert(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IP        string `json:"ip"`
		Port      int    `json:"port"`
		Protocol  string `json:"protocol"`
		State     string `json:"state"`
		Service   string `json:"service"`
		Version   string `json:"version"`
		Product   string `json:"product"`
		ExtraInfo string `json:"extra_info"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" || req.Port == 0 {
		jsonResponse(w, 400, map[string]string{"error": "ip and port required"})
		return
	}

	if req.Protocol == "" {
		req.Protocol = "tcp"
	}

	if err := s.DB.RevertConsolidatedPort(req.IP, req.Port, req.Protocol, req.State, req.Service, req.Version, req.Product, req.ExtraInfo); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "reverted"})
}

func (s *Server) HandleConsolidatedPortUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IP       string `json:"ip"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
		Field    string `json:"field"`
		Value    string `json:"value"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" || req.Port == 0 || req.Field == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip, port, and field required"})
		return
	}

	if req.Protocol == "" {
		req.Protocol = "tcp"
	}

	if err := s.DB.UpdateConsolidatedPortField(req.IP, req.Port, req.Protocol, req.Field, req.Value); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "updated"})
}

func (s *Server) HandleConsolidatedEdits(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	ip := r.URL.Query().Get("ip")
	portStr := r.URL.Query().Get("port")
	protocol := r.URL.Query().Get("protocol")

	if ip == "" || portStr == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip and port required"})
		return
	}

	if protocol == "" {
		protocol = "tcp"
	}

	edits, err := s.DB.GetConsolidatedEditHistory(ip, portStr, protocol)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, edits)
}

func (s *Server) HandleHostEdits(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	ip := r.URL.Query().Get("ip")
	if ip == "" {
		jsonResponse(w, 400, map[string]string{"error": "ip required"})
		return
	}

	edits, err := s.DB.GetHostEditHistory(ip)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, edits)
}

func (s *Server) HandleRevertHostEdit(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	editIdStr := r.PathValue("editId")
	editId := parseIntID(editIdStr)

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

	if err := s.DB.RevertHostEdit(editId, req.IP); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "reverted"})
}

func (s *Server) HandleRevertConsolidatedEdit(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	editIdStr := r.PathValue("editId")
	editId := parseIntID(editIdStr)

	var req struct {
		IP       string `json:"ip"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" || req.Port == 0 {
		jsonResponse(w, 400, map[string]string{"error": "ip and port required"})
		return
	}

	if req.Protocol == "" {
		req.Protocol = "tcp"
	}

	if err := s.DB.RevertConsolidatedEdit(editId, req.IP, req.Port, req.Protocol); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "reverted"})
}

func (s *Server) HandleApplyConsolidatedEdit(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	editIdStr := r.PathValue("editId")
	editId := parseIntID(editIdStr)

	var req struct {
		IP       string `json:"ip"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.IP == "" || req.Port == 0 {
		jsonResponse(w, 400, map[string]string{"error": "ip and port required"})
		return
	}

	if req.Protocol == "" {
		req.Protocol = "tcp"
	}

	if err := s.DB.ApplyConsolidatedEdit(editId, req.IP, req.Port, req.Protocol); err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, map[string]string{"status": "applied"})
}

func (s *Server) HandleConsolidatedScripts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	page := 1
	limit := 50
	search := r.URL.Query().Get("q")
	if p := r.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}

	result, err := s.DB.GetConsolidatedScriptsPaged(projectID, page, limit, search)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, result)
}

func (s *Server) HandleScanScripts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanID := parseIntID(id)

	portScripts, hostScripts, err := s.DB.GetScanScripts(scanID)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]interface{}{
		"port_scripts": portScripts,
		"host_scripts": hostScripts,
	})
}

func (s *Server) HandleScriptsExportXLSX(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	scripts, _ := s.DB.GetConsolidatedScripts(projectID)
	hosts, _ := s.DB.GetConsolidatedHosts(projectID)
	ports, _ := s.DB.GetConsolidatedPorts(projectID)

	proj, _ := s.DB.GetProject(projectID)
	name := fmt.Sprintf("consolidated-%d", projectID)
	if proj != nil {
		name = strings.ReplaceAll(proj.Name, " ", "-") + "-scripts"
	}

	data, err := export.ToScriptsExcel(hosts, ports, scripts)
	if err != nil {
		serverError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xlsx", name))
	w.Write(data)
}

func (s *Server) HandleScriptsExportTXT(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	scripts, _ := s.DB.GetConsolidatedScripts(projectID)

	proj, _ := s.DB.GetProject(projectID)
	name := fmt.Sprintf("consolidated-%d", projectID)
	if proj != nil {
		name = strings.ReplaceAll(proj.Name, " ", "-") + "-scripts"
	}

	data, err := export.ToScriptsTXT(scripts)
	if err != nil {
		serverError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s.txt", name))
	w.Write(data)
}

func (s *Server) HandleScriptsExportSizes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	scripts, _ := s.DB.GetConsolidatedScripts(projectID)
	hosts, _ := s.DB.GetConsolidatedHosts(projectID)
	ports, _ := s.DB.GetConsolidatedPorts(projectID)

	sizes := map[string]int64{}

	if data, err := export.ToScriptsExcel(hosts, ports, scripts); err == nil {
		sizes["xlsx"] = int64(len(data))
	}

	if data, err := json.Marshal(scripts); err == nil {
		sizes["json"] = int64(len(data))
	}

	if data, err := export.ToScriptsTXT(scripts); err == nil {
		sizes["txt"] = int64(len(data))
	}

	jsonResponse(w, 200, sizes)
}

func (s *Server) HandleGetPortNote(w http.ResponseWriter, r *http.Request) {
	ip := r.URL.Query().Get("ip")
	port := 0
	fmt.Sscanf(r.URL.Query().Get("port"), "%d", &port)
	protocol := r.URL.Query().Get("protocol")
	if ip == "" || port == 0 {
		jsonResponse(w, 400, map[string]string{"error": "ip, port required"})
		return
	}
	note, err := s.DB.GetPortNote(ip, port, protocol)
	if err != nil {
		jsonResponse(w, 200, map[string]string{"note": ""})
		return
	}
	jsonResponse(w, 200, note)
}

func (s *Server) HandleSetPortNote(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IP       string `json:"ip"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
		Note     string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request"})
		return
	}
	if err := s.DB.SetPortNote(req.IP, req.Port, req.Protocol, req.Note); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleDeletePortNote(w http.ResponseWriter, r *http.Request) {
	ip := r.URL.Query().Get("ip")
	port := 0
	fmt.Sscanf(r.URL.Query().Get("port"), "%d", &port)
	protocol := r.URL.Query().Get("protocol")
	if ip == "" || port == 0 {
		jsonResponse(w, 400, map[string]string{"error": "ip, port required"})
		return
	}
	if err := s.DB.DeletePortNote(ip, port, protocol); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleTopology(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	data, err := s.DB.GetTopology(projectID)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, data)
}

func (s *Server) HandleConsolidatedFilterOptions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	opts, err := s.DB.GetConsolidatedFilterOptions(projectID)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, opts)
}

func (s *Server) HandleConsolidatedFieldValues(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}
	field := r.URL.Query().Get("field")
	query := r.URL.Query().Get("q")

	if field == "" {
		jsonResponse(w, 400, map[string]string{"error": "field is required"})
		return
	}

	values, err := s.DB.GetConsolidatedFieldValues(projectID, field, query)
	if err != nil {
		serverError(w, err)
		return
	}
	if values == nil {
		values = []string{}
	}
	jsonResponse(w, 200, map[string]interface{}{"values": values})
}

func (s *Server) HandleConsolidatedPortsQuery(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)
	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	var req db.PortsQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 {
		req.Limit = 50
	}
	if req.FilterMode == "" {
		req.FilterMode = "and"
	}

	result, err := s.DB.GetConsolidatedPortsFiltered(projectID, &req)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, result)
}
