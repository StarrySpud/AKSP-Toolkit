package main

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLastPageClosesAndARefreshResumes(t *testing.T) {
	now := time.Unix(1000, 0)
	monitor := newPageMonitor(now)
	if got := monitor.deadline(); !got.Equal(now.Add(heartbeatTimeout)) {
		t.Fatalf("first page startup deadline: %v", got)
	}
	monitor.heartbeat("first", now)
	monitor.heartbeat("second", now.Add(time.Second))
	monitor.closePage("first", now.Add(2*time.Second))
	if got := monitor.deadline(); !got.Equal(now.Add(time.Second + heartbeatTimeout)) {
		t.Fatalf("remaining page should keep service alive: %v", got)
	}
	closedAt := now.Add(3 * time.Second)
	monitor.closePage("second", closedAt)
	if got := monitor.deadline(); !got.Equal(closedAt.Add(closeGrace)) {
		t.Fatalf("last page close deadline: %v", got)
	}
	refreshedAt := closedAt.Add(time.Second)
	monitor.heartbeat("refreshed", refreshedAt)
	if got := monitor.deadline(); !got.Equal(refreshedAt.Add(heartbeatTimeout)) {
		t.Fatalf("refresh should cancel pending shutdown: %v", got)
	}
}

func TestPauseDisablesShutdownUntilResumed(t *testing.T) {
	now := time.Unix(1000, 0)
	monitor := newPageMonitor(now)
	monitor.setEnabled("dev", false, now)
	monitor.closePage("dev", now.Add(time.Second))
	if !monitor.deadline().IsZero() {
		t.Fatal("paused monitoring should not have a deadline")
	}
	resumedAt := now.Add(time.Hour)
	if monitor.heartbeat("new", resumedAt) {
		t.Fatal("new page should see that monitoring is paused")
	}
	monitor.setEnabled("new", true, resumedAt)
	if got := monitor.deadline(); !got.Equal(resumedAt.Add(heartbeatTimeout)) {
		t.Fatalf("unexpected resumed deadline: %v", got)
	}
}

func TestMissingCloseNotificationFallsBackToHeartbeatDeadline(t *testing.T) {
	lastHeartbeat := time.Now().Add(-heartbeatTimeout - time.Second)
	monitor := newPageMonitor(lastHeartbeat)
	monitor.heartbeat("disconnected", lastHeartbeat)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if !monitor.waitForIdle(ctx) {
		t.Fatal("the launcher should exit once an abandoned heartbeat expires")
	}
}

func TestLauncherHTTPOriginAndEmbeddedApp(t *testing.T) {
	const host = "127.0.0.1:5174"
	const origin = "http://" + host
	monitor := newPageMonitor(time.Now())
	handler, err := newHandler(host, monitor)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		method, url, source string
		status              int
	}{
		{"GET", origin + appPath, "", 200},
		{"GET", origin + launcherPath + "status", "", 204},
		{"GET", origin + launcherPath + "open", "", 200},
		{"GET", "http://untrusted.test" + appPath, "", 403},
		{"POST", origin + launcherPath + "close?tab=123", "http://untrusted.test", 403},
		{"POST", origin + launcherPath + "close?tab=123", origin, 400},
		{"POST", origin + launcherPath + "heartbeat?tab=01234567-0123-0123-0123-0123456789ab", origin, 200},
	} {
		request := httptest.NewRequest(test.method, test.url, nil)
		request.Header.Set("Origin", test.source)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if status := response.Result().StatusCode; status != test.status {
			t.Errorf("%s %s returned %d, want %d", test.method, test.url, status, test.status)
		}
	}
}
