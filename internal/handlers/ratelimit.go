package handlers

import (
	"net/http"
	"sync"
	"time"
)

type rateLimiter struct {
	mu       sync.Mutex
	clients  map[string]*clientLimiter
	maxReqs  int
	window   time.Duration
}

type clientLimiter struct {
	count    int
	windowStart time.Time
}

func newRateLimiter(maxReqs int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		clients: make(map[string]*clientLimiter),
		maxReqs: maxReqs,
		window:  window,
	}
	go rl.cleanup()
	return rl
}

func (rl *rateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for ip, cl := range rl.clients {
			if now.Sub(cl.windowStart) > rl.window*2 {
				delete(rl.clients, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cl, exists := rl.clients[ip]
	if !exists || now.Sub(cl.windowStart) > rl.window {
		rl.clients[ip] = &clientLimiter{count: 1, windowStart: now}
		return true
	}

	cl.count++
	if cl.count > rl.maxReqs {
		return false
	}
	return true
}

var ApiRateLimiter = newRateLimiter(120, time.Minute)
var AuthRateLimiter = newRateLimiter(10, time.Minute)

func RateLimitMiddleware(next http.HandlerFunc, limiter *rateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)

		if !limiter.allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate limit exceeded"}`))
			return
		}
		next(w, r)
	}
}
