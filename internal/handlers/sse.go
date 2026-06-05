package handlers

import (
	"fmt"
	"net/http"
	"sync"
)

type SSEBroker struct {
	mu      sync.RWMutex
	clients map[chan string]struct{}
}

func NewSSEBroker() *SSEBroker {
	return &SSEBroker{clients: make(map[chan string]struct{})}
}

func (b *SSEBroker) Subscribe() chan string {
	b.mu.Lock()
	defer b.mu.Unlock()
	ch := make(chan string, 16)
	b.clients[ch] = struct{}{}
	return ch
}

func (b *SSEBroker) Unsubscribe(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, ch)
	close(ch)
}

func (b *SSEBroker) Publish(data string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- data:
		default:
		}
	}
}

func (b *SSEBroker) HandleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	ch := b.Subscribe()
	defer b.Unsubscribe(ch)

	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	for {
		select {
		case msg := <-ch:
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", msg)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
