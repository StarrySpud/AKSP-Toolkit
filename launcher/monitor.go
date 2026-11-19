package main

import (
	"context"
	"sync"
	"time"
)

const (
	heartbeatTimeout = 4 * time.Minute
	closeGrace       = 10 * time.Second
)

type pageMonitor struct {
	mu            sync.Mutex
	pages         map[string]time.Time
	enabled       bool
	emptyDeadline time.Time
	changed       chan struct{}
}

func newPageMonitor(now time.Time) *pageMonitor {
	return &pageMonitor{
		pages: make(map[string]time.Time), enabled: true,
		emptyDeadline: now.Add(heartbeatTimeout), changed: make(chan struct{}, 1),
	}
}

func (m *pageMonitor) signalChange() {
	select {
	case m.changed <- struct{}{}:
	default:
	}
}

func (m *pageMonitor) prune(now time.Time) {
	for id, expiry := range m.pages {
		if !now.Before(expiry) {
			delete(m.pages, id)
		}
	}
}

func (m *pageMonitor) openingPage(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.prune(now)
	if len(m.pages) == 0 {
		m.emptyDeadline = now.Add(heartbeatTimeout)
		m.signalChange()
	}
}

func (m *pageMonitor) heartbeat(id string, now time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.prune(now)
	m.pages[id] = now.Add(heartbeatTimeout)
	m.signalChange()
	return m.enabled
}

func (m *pageMonitor) closePage(id string, now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, known := m.pages[id]; !known {
		return
	}
	delete(m.pages, id)
	m.prune(now)
	if len(m.pages) == 0 {
		m.emptyDeadline = now.Add(closeGrace)
	}
	m.signalChange()
}

func (m *pageMonitor) setEnabled(id string, enabled bool, now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.prune(now)
	m.enabled = enabled
	m.pages[id] = now.Add(heartbeatTimeout)
	m.signalChange()
}

func (m *pageMonitor) deadline() time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.enabled {
		return time.Time{}
	}
	if len(m.pages) == 0 {
		return m.emptyDeadline
	}
	var latest time.Time
	for _, expiry := range m.pages {
		if expiry.After(latest) {
			latest = expiry
		}
	}
	return latest
}

func (m *pageMonitor) waitForIdle(ctx context.Context) bool {
	for {
		deadline := m.deadline()
		if deadline.IsZero() {
			select {
			case <-m.changed:
				continue
			case <-ctx.Done():
				return false
			}
		}
		if wait := time.Until(deadline); wait <= 0 {
			return true
		} else {
			timer := time.NewTimer(wait)
			select {
			case <-timer.C:
			case <-m.changed:
				timer.Stop()
			case <-ctx.Done():
				timer.Stop()
				return false
			}
		}
	}
}
