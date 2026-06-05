package handlers

import (
	"encoding/json"
	"net/http"
	"time"
)

func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
		return
	}

	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = xff
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}

	if s.AuthSvc.IsLockedOut(req.Username, ip) {
		jsonResponse(w, 429, map[string]string{"error": "too many attempts, try again later"})
		return
	}

	userID, sessionID, _, mustChange, err := s.AuthSvc.Login(req.Username, req.Password, ip)
	if err != nil || userID == 0 {
		jsonResponse(w, 401, map[string]string{"error": "invalid credentials"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(24 * time.Hour),
	})

	jsonResponse(w, 200, map[string]interface{}{
		"user_id":              userID,
		"must_change_password": mustChange,
	})
}

func (s *Server) HandleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie("session")
	if cookie != nil {
		s.AuthSvc.Logout(cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:   "session",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) HandleMe(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	jsonResponse(w, 200, user)
}

func (s *Server) HandleCSRFToken(w http.ResponseWriter, r *http.Request) {
	token, _ := r.Context().Value("csrf_token").(string)
	jsonResponse(w, 200, map[string]string{"csrf_token": token})
}

func (s *Server) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := jsonDecode(r, &req); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
		return
	}
	user := getRequestUser(r)
	if user == nil {
		jsonResponse(w, 401, map[string]string{"error": "unauthorized"})
		return
	}

	if err := s.AuthSvc.ChangePassword(user.ID, req.OldPassword, req.NewPassword); err != nil {
		jsonResponse(w, 400, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, 200, map[string]string{"status": "ok"})
}

func jsonDecode(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}
