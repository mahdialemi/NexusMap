package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/mahdialemi/NexusMap/internal/db"
)

type createProjectRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Tags        string  `json:"tags"`
	Client      string  `json:"client"`
	OwnerID     *int    `json:"owner_id"`
	DueDate     *string `json:"due_date"`
}

type updateProjectRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	Tags        string  `json:"tags"`
	Client      string  `json:"client"`
	OwnerID     *int    `json:"owner_id"`
	DueDate     *string `json:"due_date"`
}

type updateStatusRequest struct {
	Status string `json:"status"`
}

func (s *Server) HandleProjects(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		user := getRequestUser(r)
		filter := db.ProjectFilter{
			Status:   r.URL.Query().Get("status"),
			Priority: r.URL.Query().Get("priority"),
			Search:   r.URL.Query().Get("search"),
		}
		if ownerIDStr := r.URL.Query().Get("owner_id"); ownerIDStr != "" {
			if id, err := strconv.Atoi(ownerIDStr); err == nil {
				filter.OwnerID = id
			}
		}
		if user != nil && user.Role != "admin" {
			filter.OwnerID = user.ID
		}

		var projects []db.Project
		var err error

		if filter.Status != "" || filter.Priority != "" || filter.Search != "" || filter.OwnerID > 0 {
			projects, err = s.DB.GetProjectsFiltered(filter)
		} else {
			projects, err = s.DB.GetProjects()
		}

		if err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, 200, projects)

	case "POST":
		user := getRequestUser(r)
		if user == nil || user.Role != "admin" {
			jsonResponse(w, 403, map[string]string{"error": "admin required"})
			return
		}
		var req createProjectRequest
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.OwnerID == nil || *req.OwnerID == 0 {
			req.OwnerID = &user.ID
		}
		id, err := s.DB.CreateProject(
			req.Name, req.Description, req.Status, req.Priority,
			req.Tags, req.Client, req.OwnerID, req.DueDate,
		)
		if err != nil {
			serverError(w, err)
			return
		}
		uname := ""
		if user != nil { uname = user.Username }
		s.LogAndNotify("project_created", fmt.Sprintf("Project '%s' created", req.Name), uname)
		jsonResponse(w, 201, map[string]int64{"id": id})

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) HandleProjectByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)

	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	switch r.Method {
	case "GET":
		project, err := s.DB.GetProject(projectID)
		if err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, 200, project)

	case "PUT":
		user := getRequestUser(r)
		if user == nil || user.Role != "admin" {
			jsonResponse(w, 403, map[string]string{"error": "admin required"})
			return
		}
		var req updateProjectRequest
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if err := s.DB.UpdateProject(
			projectID, req.Name, req.Description, req.Status, req.Priority,
			req.Tags, req.Client, req.OwnerID, req.DueDate,
		); err != nil {
			serverError(w, err)
			return
		}
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	case "DELETE":
		user := getRequestUser(r)
		if user == nil || user.Role != "admin" {
			jsonResponse(w, 403, map[string]string{"error": "admin required"})
			return
		}
		proj, _ := s.DB.GetProject(projectID)
		if err := s.DB.DeleteProject(projectID); err != nil {
			serverError(w, err)
			return
		}
		uname := ""
		if user != nil { uname = user.Username }
		pname := fmt.Sprintf("#%d", projectID)
		if proj != nil { pname = proj.Name }
		s.LogAndNotify("project_deleted", fmt.Sprintf("Project '%s' deleted", pname), uname)
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) HandleProjectScans(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	projectID := parseIntID(id)

	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	scans, err := s.DB.GetScans(projectID)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, scans)
}

func (s *Server) HandleProjectStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PATCH" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	user := getRequestUser(r)
	if user == nil || user.Role != "admin" {
		jsonResponse(w, 403, map[string]string{"error": "admin required"})
		return
	}

	id := r.PathValue("id")
	projectID := parseIntID(id)

	var req updateStatusRequest
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	validStatuses := map[string]bool{"active": true, "archived": true, "completed": true}
	if !validStatuses[req.Status] {
		jsonResponse(w, 400, map[string]string{"error": "invalid status"})
		return
	}

	if err := s.DB.UpdateProjectStatus(projectID, req.Status); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

type bulkStatusRequest struct {
	IDs    []int  `json:"ids"`
	Status string `json:"status"`
}

type bulkIDsRequest struct {
	IDs []int `json:"ids"`
}

type duplicateRequest struct {
	Name string `json:"name"`
}

func (s *Server) HandleBulkProjectStatus(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	if user == nil || user.Role != "admin" {
		jsonResponse(w, 403, map[string]string{"error": "admin required"})
		return
	}
	var req bulkStatusRequest
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}
	validStatuses := map[string]bool{"active": true, "archived": true, "completed": true}
	if !validStatuses[req.Status] {
		jsonResponse(w, 400, map[string]string{"error": "invalid status"})
		return
	}
	if err := s.DB.BulkUpdateProjectStatus(req.IDs, req.Status); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleBulkProjectDelete(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	if user == nil || user.Role != "admin" {
		jsonResponse(w, 403, map[string]string{"error": "admin required"})
		return
	}
	var req bulkIDsRequest
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}
	if err := s.DB.BulkDeleteProjects(req.IDs); err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleDuplicateProject(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	if user == nil || user.Role != "admin" {
		jsonResponse(w, 403, map[string]string{"error": "admin required"})
		return
	}
	id := r.PathValue("id")
	projectID := parseIntID(id)
	var req duplicateRequest
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}
	if req.Name == "" {
		jsonResponse(w, 400, map[string]string{"error": "name is required"})
		return
	}
	newID, err := s.DB.DuplicateProject(projectID, req.Name)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 201, map[string]int64{"id": newID})
}

func (s *Server) HandleToggleProjectPin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PATCH" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	user := getRequestUser(r)
	if user == nil || user.Role != "admin" {
		jsonResponse(w, 403, map[string]string{"error": "admin required"})
		return
	}
	id := r.PathValue("id")
	projectID := parseIntID(id)
	pinned, err := s.DB.ToggleProjectPin(projectID)
	if err != nil {
		serverError(w, err)
		return
	}
	jsonResponse(w, 200, map[string]bool{"is_pinned": pinned})
}

func (s *Server) HandleTagCloud(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	user := getRequestUser(r)
	filter := db.ProjectFilter{}
	if user != nil && user.Role != "admin" {
		filter.OwnerID = user.ID
	}

	var projects []db.Project
	var err error
	if filter.OwnerID > 0 {
		projects, err = s.DB.GetProjectsFiltered(filter)
	} else {
		projects, err = s.DB.GetProjects()
	}
	if err != nil {
		serverError(w, err)
		return
	}

	tagCounts := make(map[string]int)
	for _, p := range projects {
		if p.Tags == "" {
			continue
		}
		for _, tag := range strings.Split(p.Tags, ",") {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				tagCounts[tag]++
			}
		}
	}

	type tagItem struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	tags := make([]tagItem, 0, len(tagCounts))
	for name, count := range tagCounts {
		tags = append(tags, tagItem{Name: name, Count: count})
	}

	jsonResponse(w, 200, map[string]interface{}{"tags": tags})
}

func (s *Server) HandleGlobalStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	stats, err := s.DB.GetGlobalStats()
	if err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, stats)
}

func (s *Server) HandleProjectStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	idStr := r.PathValue("id")
	projectID, err := strconv.Atoi(idStr)
	if err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid project id"})
		return
	}

	if !s.requireProjectAccess(w, r, projectID) {
		return
	}

	p, err := s.DB.GetProject(projectID)
	if err != nil || p == nil {
		jsonResponse(w, 404, map[string]string{"error": "project not found"})
		return
	}

	stats, err := s.DB.GetProjectStats(projectID)
	if err != nil {
		serverError(w, err)
		return
	}

	jsonResponse(w, 200, stats)
}
