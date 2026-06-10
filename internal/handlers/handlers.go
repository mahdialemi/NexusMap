package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"

	"scanner-mgmt/internal/auth"
	"scanner-mgmt/internal/db"
	"scanner-mgmt/internal/nmap"
)

type Server struct {
	DB         *db.DB
	AuthSvc    *auth.Auth
	NmapRunner *nmap.Runner
	WebFS      fs.FS
	ScanWG     sync.WaitGroup
	SSE        *SSEBroker
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		LogWarn("json encode failed", map[string]interface{}{"error": err})
	}
}

func serverError(w http.ResponseWriter, err error) {
	LogError("internal server error", map[string]interface{}{"error": err.Error()})
	jsonResponse(w, 500, map[string]string{"error": "internal server error"})
}

func getRequestUser(r *http.Request) *db.User {
	u, _ := r.Context().Value("user").(*db.User)
	return u
}

func getClientIP(r *http.Request) string {
	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if parts := strings.Split(xff, ","); len(parts) > 0 {
			cleaned := strings.TrimSpace(parts[len(parts)-1])
			if h, _, err := net.SplitHostPort(cleaned); err == nil {
				cleaned = h
			}
			if net.ParseIP(cleaned) != nil {
				ip = cleaned
			}
		}
	} else if xri := r.Header.Get("X-Real-IP"); xri != "" {
		if net.ParseIP(xri) != nil {
			ip = xri
		}
	}
	if h, _, err := net.SplitHostPort(ip); err == nil {
		ip = h
	}
	return ip
}

func parseIntID(s string) int {
	id, _ := strconv.Atoi(s)
	return id
}

func (s *Server) LogAndNotify(action, details, username string) {
	s.DB.LogActivity(action, details, username)
	s.SSE.Publish("new_notification")
}

func (s *Server) requireProjectAccess(w http.ResponseWriter, r *http.Request, projectID int) bool {
	user := getRequestUser(r)
	if user == nil {
		jsonResponse(w, 401, map[string]string{"error": "unauthorized"})
		return false
	}
	if user.Role == "admin" {
		return true
	}
	p, err := s.DB.GetProject(projectID)
	if err != nil || p == nil {
		jsonResponse(w, 404, map[string]string{"error": "project not found"})
		return false
	}
	if p.OwnerID == nil || *p.OwnerID != user.ID {
		jsonResponse(w, 403, map[string]string{"error": "access denied"})
		return false
	}
	return true
}

func (s *Server) requireScanAccess(w http.ResponseWriter, r *http.Request, scanID int) bool {
	projectID, err := s.DB.GetScanProjectID(scanID)
	if err != nil {
		jsonResponse(w, 404, map[string]string{"error": "scan not found"})
		return false
	}
	return s.requireProjectAccess(w, r, projectID)
}

func (s *Server) HandlePage(page string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := fs.ReadFile(s.WebFS, path.Join("pages", page))
		if err != nil {
			http.Error(w, "page not found", 404)
			return
		}
		csrfToken, _ := r.Context().Value("csrf_token").(string)
		inject := []byte(fmt.Sprintf(`<meta name="csrf-token" content="%s">`+"\n", csrfToken))
		data = bytes.Replace(data, []byte("</head>"), inject, 1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		w.Write(data)
	}
}
