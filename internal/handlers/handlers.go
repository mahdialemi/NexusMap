package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"scanner-mgmt/internal/auth"
	"scanner-mgmt/internal/db"
	"scanner-mgmt/internal/nmap"
)

type Server struct {
	DB         *db.DB
	AuthSvc    *auth.Auth
	NmapRunner *nmap.Runner
	WebRoot    string
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

func getRequestUser(r *http.Request) *db.User {
	u, _ := r.Context().Value("user").(*db.User)
	return u
}

func parseIntID(s string) int {
	id, _ := strconv.Atoi(s)
	return id
}

func (s *Server) LogAndNotify(action, details, username string) {
	s.DB.LogActivity(action, details, username)
	s.SSE.Publish("new_notification")
}

func (s *Server) HandlePage(page string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := os.ReadFile(filepath.Join(s.WebRoot, "pages", page))
		if err != nil {
			http.Error(w, "page not found", 404)
			return
		}
		csrfToken, _ := r.Context().Value("csrf_token").(string)
		inject := []byte(`<meta name="csrf-token" content="` + csrfToken + `">`)
		data = bytes.Replace(data, []byte("</head>"), append(inject, '\n'), 1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		w.Write(data)
	}
}
