package handlers

import "net/http"

func (s *Server) HandleUsers(w http.ResponseWriter, r *http.Request) {
	user := getRequestUser(r)
	uname := ""
	if user != nil {
		uname = user.Username
	}

	switch r.Method {
	case "GET":
		users, err := s.AuthSvc.GetUsers()
		if err != nil {
			jsonResponse(w, 500, map[string]string{"error": err.Error()})
			return
		}
		jsonResponse(w, 200, users)

	case "POST":
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.Role == "" {
			req.Role = "user"
		}
		if err := s.AuthSvc.CreateUser(req.Username, req.Password, req.Role); err != nil {
			jsonResponse(w, 500, map[string]string{"error": err.Error()})
			return
		}
		s.LogAndNotify("user_create", "Created user: "+req.Username+" ("+req.Role+")", uname)
		jsonResponse(w, 201, map[string]string{"status": "ok"})

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}

func (s *Server) HandleUserByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	userID := parseIntID(id)
	user := getRequestUser(r)
	uname := ""
	if user != nil {
		uname = user.Username
	}

	getTargetName := func() string {
		var n string
		s.DB.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&n)
		return n
	}

	switch r.Method {
	case "DELETE":
		tname := getTargetName()
		if err := s.AuthSvc.DeleteUser(userID); err != nil {
			jsonResponse(w, 500, map[string]string{"error": err.Error()})
			return
		}
		s.LogAndNotify("user_delete", "Deleted user: "+tname, uname)
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	case "PUT":
		var req struct {
			Role string `json:"role"`
		}
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.Role == "" {
			jsonResponse(w, 400, map[string]string{"error": "role required"})
			return
		}
		tname := getTargetName()
		if err := s.AuthSvc.UpdateUser(userID, req.Role); err != nil {
			jsonResponse(w, 500, map[string]string{"error": err.Error()})
			return
		}
		s.LogAndNotify("user_update", "Updated user "+tname+" to role: "+req.Role, uname)
		jsonResponse(w, 200, map[string]string{"status": "ok"})

	case "POST":
		var req struct {
			Action      string `json:"action"`
			NewPassword string `json:"new_password"`
		}
		if err := jsonDecode(r, &req); err != nil {
			jsonResponse(w, 400, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.Action == "reset_password" {
			if req.NewPassword == "" {
				jsonResponse(w, 400, map[string]string{"error": "new_password required"})
				return
			}
			tname := getTargetName()
			if err := s.AuthSvc.ResetUserPassword(userID, req.NewPassword); err != nil {
				jsonResponse(w, 500, map[string]string{"error": err.Error()})
				return
			}
			s.LogAndNotify("user_reset_password", "Reset password for user: "+tname, uname)
			jsonResponse(w, 200, map[string]string{"status": "ok"})
		} else {
			jsonResponse(w, 400, map[string]string{"error": "unknown action"})
		}

	default:
		jsonResponse(w, 405, map[string]string{"error": "method not allowed"})
	}
}
