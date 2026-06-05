package handlers

import "net/http"

func (s *Server) HandleResults(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		HostID   int    `json:"host_id"`
		Port     int    `json:"port"`
		Protocol string `json:"protocol"`
		State    string `json:"state"`
		Service  string `json:"service"`
		Version  string `json:"version"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if err := s.DB.AddPort(req.HostID, req.Port, req.Protocol, req.State, req.Service, req.Version); err != nil {
		jsonResponse(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleResultByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resultID := parseIntID(id)

	switch r.Method {
	case "PUT":
		var req struct {
			Table string `json:"table"`
			Field string `json:"field"`
			Value string `json:"value"`
		}
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}

		if req.Table == "" {
			req.Table = "ports"
		}

		if err := s.DB.UpdateResultField(req.Table, resultID, req.Field, req.Value); err != nil {
			jsonResponse(w, 500, map[string]string{"error": err.Error()})
			return
		}
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	case "DELETE":
		var req struct {
			Table string `json:"table"`
		}
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}

		table := "ports"
		if req.Table == "hosts" {
			table = "hosts"
		}

		var err error
		if table == "hosts" {
			err = s.DB.DeleteHost(resultID)
		} else {
			err = s.DB.DeletePort(resultID)
		}
		if err != nil {
			jsonResponse(w, 500, map[string]string{"error": err.Error()})
			return
		}
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) HandleRevertResult(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	resultID := parseIntID(id)

	var req struct {
		Table string `json:"table"`
		Field string `json:"field"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.Table == "" {
		req.Table = "ports"
	}

	if err := s.DB.RevertResultField(req.Table, resultID, req.Field); err != nil {
		jsonResponse(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleBulkUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	var req struct {
		IDs   []int  `json:"ids"`
		Field string `json:"field"`
		Value string `json:"value"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if err := s.DB.BulkUpdatePorts(req.IDs, req.Field, req.Value); err != nil {
		jsonResponse(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}
