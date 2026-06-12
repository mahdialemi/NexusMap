package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (s *Server) HandleScanProfiles(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	if user == nil {
		jsonResponse(w, 401, map[string]string{"error": "unauthorized"})
		return
	}

	if user.Role != "admin" && r.Method != "GET" {
		jsonResponse(w, 403, map[string]string{"error": "forbidden"})
		return
	}

	switch r.Method {
	case "GET":
		s.getProfiles(w, r)
	case "POST":
		s.createProfile(w, r)
	case "PUT":
		s.updateProfile(w, r)
	case "DELETE":
		s.deleteProfile(w, r)
	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) getProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := s.DB.GetProfiles()
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]interface{}{"profiles": profiles})
}

func (s *Server) createProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Command     string `json:"command"`
		Category    string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Command = strings.TrimSpace(req.Command)
	req.Category = strings.TrimSpace(req.Category)
	if req.Name == "" || req.Command == "" || req.Category == "" {
		jsonResponse(w, 400, map[string]string{"error": "name, command, and category are required"})
		return
	}
	if err := s.DB.CreateProfile(req.Name, req.Description, req.Command, req.Category); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 201, map[string]string{"message": "profile created"})
}

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID          int    `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Command     string `json:"command"`
		Category    string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Command = strings.TrimSpace(req.Command)
	req.Category = strings.TrimSpace(req.Category)
	if req.Name == "" || req.Command == "" || req.Category == "" {
		jsonResponse(w, 400, map[string]string{"error": "name, command, and category are required"})
		return
	}
	if err := s.DB.UpdateProfile(req.ID, req.Name, req.Description, req.Command, req.Category); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"message": "profile updated"})
}

func (s *Server) deleteProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID int `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid request"})
		return
	}
	if err := s.DB.DeleteProfile(req.ID); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"message": "profile deleted"})
}

func (s *Server) HandleNSEFinder(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	scripts := s.NmapRunner.FindNSEScripts(query)
	jsonResponse(w, 200, map[string]interface{}{"scripts": scripts})
}
