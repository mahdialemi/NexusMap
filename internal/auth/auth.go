package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
	"unicode"

	"github.com/mahdialemi/NexusMap/internal/db"

	"golang.org/x/crypto/bcrypt"
)

type Auth struct {
	DB               *sql.DB
	lastActiveMu     sync.Mutex
	lastActiveTime   time.Time
	lastActiveWindow time.Duration
}

func New(database *sql.DB) *Auth {
	return &Auth{DB: database, lastActiveWindow: 60 * time.Second}
}

func (a *Auth) Login(username, password, ip string) (int, string, string, bool, error) {
	var id int
	var hash string
	var mustChange bool
	err := a.DB.QueryRow("SELECT id, password_hash, must_change_password FROM users WHERE username = ?", username).
		Scan(&id, &hash, &mustChange)
	if err == sql.ErrNoRows {
		a.logAttempt(username, ip, false)
		return 0, "", "", false, nil
	}
	if err != nil {
		return 0, "", "", false, err
	}

	bcryptErr := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if bcryptErr != nil {
		a.logAttempt(username, ip, false)
		return 0, "", "", false, nil
	}

	a.logAttempt(username, ip, true)

	sessionID := generateSessionID()
	csrfToken := generateSessionID()
	_, err = a.DB.Exec("INSERT INTO sessions (id, user_id, csrf_token) VALUES (?, ?, ?)", sessionID, id, csrfToken)
	if err != nil {
		return 0, "", "", false, err
	}

	a.CleanupExpiredSessions()
	return id, sessionID, csrfToken, mustChange, nil
}

func (a *Auth) Logout(sessionID string) error {
	_, err := a.DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

func (a *Auth) ValidateSession(sessionID string) (*db.User, string, error) {
	var userID int
	var lastActive, csrfToken string
	err := a.DB.QueryRow(
		"SELECT user_id, last_active, COALESCE(csrf_token, '') FROM sessions WHERE id = ?",
		sessionID,
	).Scan(&userID, &lastActive, &csrfToken)
	if err != nil {
		return nil, "", err
	}

	var now24h string
	if err := a.DB.QueryRow("SELECT datetime('now', '-24 hours')").Scan(&now24h); err != nil {
		return nil, "", fmt.Errorf("session time check failed: %w", err)
	}
	if lastActive <= now24h {
		return nil, "", fmt.Errorf("session expired")
	}

	if time.Since(a.lastActiveTime) >= a.lastActiveWindow {
		a.lastActiveMu.Lock()
		if time.Since(a.lastActiveTime) >= a.lastActiveWindow {
			if _, err := a.DB.Exec("UPDATE sessions SET last_active = datetime('now') WHERE id = ?", sessionID); err != nil {
				log.Printf("failed to update session last_active: %v", err)
			}
			a.lastActiveTime = time.Now()
		}
		a.lastActiveMu.Unlock()
	}

	var user db.User
	err = a.DB.QueryRow(
		"SELECT id, username, role, created_at, must_change_password, COALESCE(theme,'dark'), COALESCE(lang,'en') FROM users WHERE id = ?", userID,
	).Scan(&user.ID, &user.Username, &user.Role, &user.CreatedAt, &user.MustChangePassword, &user.Theme, &user.Lang)
	if err != nil {
		return nil, "", err
	}
	return &user, csrfToken, nil
}

func validatePasswordStrength(password string) error {
	if len(password) < 12 {
		return fmt.Errorf("password must be at least 12 characters long")
	}
	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, ch := range password {
		switch {
		case unicode.IsUpper(ch):
			hasUpper = true
		case unicode.IsLower(ch):
			hasLower = true
		case unicode.IsDigit(ch):
			hasDigit = true
		case unicode.IsPunct(ch) || unicode.IsSymbol(ch):
			hasSpecial = true
		}
	}
	if !hasUpper {
		return fmt.Errorf("password must contain at least one uppercase letter")
	}
	if !hasLower {
		return fmt.Errorf("password must contain at least one lowercase letter")
	}
	if !hasDigit {
		return fmt.Errorf("password must contain at least one digit")
	}
	if !hasSpecial {
		return fmt.Errorf("password must contain at least one special character")
	}
	return nil
}

func (a *Auth) ChangePassword(userID int, oldPassword, newPassword, confirmPassword, currentSessionID string) error {
	if newPassword != confirmPassword {
		return fmt.Errorf("passwords do not match")
	}

	var hash string
	err := a.DB.QueryRow("SELECT password_hash FROM users WHERE id = ?", userID).Scan(&hash)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(oldPassword)); err != nil {
		return fmt.Errorf("incorrect password")
	}
	if oldPassword == newPassword {
		return fmt.Errorf("new password must be different from the current password")
	}

	if err := validatePasswordStrength(newPassword); err != nil {
		return err
	}

	rows, err := a.DB.Query("SELECT password_hash FROM password_history WHERE user_id = ? ORDER BY id DESC LIMIT 5", userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var oldHash string
		if err := rows.Scan(&oldHash); err != nil {
			return err
		}
		if bcrypt.CompareHashAndPassword([]byte(oldHash), []byte(newPassword)) == nil {
			return fmt.Errorf("you cannot reuse a recent password")
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 13)
	if err != nil {
		return err
	}

	tx, err := a.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("INSERT INTO password_history (user_id, password_hash) VALUES (?, ?)", userID, hash); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", string(newHash), userID); err != nil {
		return err
	}
	if currentSessionID != "" {
		if _, err := tx.Exec("DELETE FROM sessions WHERE user_id = ? AND id != ?", userID, currentSessionID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (a *Auth) CreateUser(username, password, role string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return err
	}
	_, err = a.DB.Exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", username, string(hash), role)
	return err
}

func (a *Auth) GetUsers() ([]db.User, error) {
	rows, err := a.DB.Query("SELECT id, username, role, created_at, must_change_password FROM users ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []db.User{}
	for rows.Next() {
		var u db.User
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &u.CreatedAt, &u.MustChangePassword); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (a *Auth) DeleteUser(id int) error {
	res, err := a.DB.Exec("DELETE FROM users WHERE id = ? AND username != 'admin'", id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("cannot delete admin user or user not found")
	}
	return nil
}

func (a *Auth) UpdateUser(id int, role string) error {
	_, err := a.DB.Exec("UPDATE users SET role = ? WHERE id = ? AND username != 'admin'", role, id)
	return err
}

func (a *Auth) ResetUserPassword(id int, newPassword string) error {
	var username string
	err := a.DB.QueryRow("SELECT username FROM users WHERE id = ?", id).Scan(&username)
	if err != nil {
		return err
	}
	if username == "admin" {
		return fmt.Errorf("cannot reset admin password via this endpoint")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return err
	}
	tx, err := a.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM password_history WHERE user_id = ?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", string(hash), id); err != nil {
		return err
	}

	return tx.Commit()
}

func (a *Auth) IsLockedOut(username, ip string) bool {
	var count int
	err := a.DB.QueryRow(
		"SELECT COUNT(*) FROM login_attempts WHERE (username = ? OR ip = ?) AND success = 0 AND attempted_at > datetime('now', '-5 minutes')",
		username, ip,
	).Scan(&count)
	if err != nil {
		return false
	}
	return count >= 5
}

func (a *Auth) logAttempt(username, ip string, success bool) {
	succ := 0
	if success {
		succ = 1
	}
	if _, err := a.DB.Exec("INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)", username, ip, succ); err != nil {
		log.Printf("failed to log login attempt: %v", err)
	}
}

func (a *Auth) CleanupExpiredSessions() {
	if _, err := a.DB.Exec("DELETE FROM sessions WHERE last_active < datetime('now', '-24 hours')"); err != nil {
		log.Printf("failed to cleanup sessions: %v", err)
	}
	if _, err := a.DB.Exec("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-1 hour')"); err != nil {
		log.Printf("failed to cleanup login_attempts: %v", err)
	}
}

func (a *Auth) StartCleanupRoutine() {
	a.CleanupExpiredSessions()
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			a.CleanupExpiredSessions()
		}
	}()
}

func generateSessionID() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("failed to generate random session ID: %v", err)
	}
	return hex.EncodeToString(b)
}

func Middleware(a *Auth, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		user, csrfToken, err := a.ValidateSession(cookie.Value)
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		r = r.WithContext(context.WithValue(r.Context(), "user", user))
		r = r.WithContext(context.WithValue(r.Context(), "csrf_token", csrfToken))
		next(w, r)
	}
}

func APIAuthMiddleware(a *Auth, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		user, csrfToken, err := a.ValidateSession(cookie.Value)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			return
		}

		r = r.WithContext(context.WithValue(r.Context(), "user", user))
		r = r.WithContext(context.WithValue(r.Context(), "csrf_token", csrfToken))
		next(w, r)
	}
}

func CSRFMiddleware(a *Auth) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
				next(w, r)
				return
			}

			cookie, err := r.Cookie("session")
			if err != nil {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
				return
			}

			_, csrfToken, err := a.ValidateSession(cookie.Value)
			if err != nil {
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
				return
			}

			sentToken := r.Header.Get("X-CSRF-Token")
			if sentToken == "" {
				sentToken = r.FormValue("_csrf")
			}
			if sentToken == "" {
				body, err := io.ReadAll(r.Body)
				if err == nil && len(body) > 0 {
					var payload map[string]interface{}
					if json.Unmarshal(body, &payload) == nil {
						if t, ok := payload["_csrf"]; ok {
							sentToken, _ = t.(string)
						}
					}
				}
				r.Body = io.NopCloser(bytes.NewReader(body))
			}

			if sentToken != csrfToken {
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid csrf token"})
				return
			}

			next(w, r)
		}
	}
}

func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, _ := r.Context().Value("user").(*db.User)
		if user == nil || user.Role != "admin" {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "admin required"})
			return
		}
		next(w, r)
	}
}
