package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	appPath      = "/AKSP-Toolkit/"
	launcherPath = "/__aksp_launcher/"
)

//go:embed web.zip
var webArchive []byte

var validPageID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

const openPageHTML = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>AKSP-Toolkit</title>
<p>正在打开 AKSP-Toolkit… <a href="/AKSP-Toolkit/">打开页面</a></p>
<script>
async function start() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/AKSP-Toolkit/');
    if (registration?.scope === location.origin + '/AKSP-Toolkit/') await registration.unregister();
  } finally {
    location.replace('/AKSP-Toolkit/');
  }
}
start();
</script></html>`

func newHandler(host string, monitor *pageMonitor) (http.Handler, error) {
	archive, err := zip.NewReader(bytes.NewReader(webArchive), int64(len(webArchive)))
	if err != nil {
		return nil, fmt.Errorf("read web archive: %w", err)
	}
	files := make(map[string]*zip.File, len(archive.File))
	for _, file := range archive.File {
		if !file.FileInfo().IsDir() {
			files[file.Name] = file
		}
	}
	if files["index.html"] == nil {
		return nil, fmt.Errorf("web archive has no index.html")
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != host {
			http.Error(w, "Invalid host", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, launcherPath) {
			handleLauncher(w, r, "http://"+host, monitor)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/" || r.URL.Path == strings.TrimSuffix(appPath, "/") {
			http.Redirect(w, r, appPath, http.StatusTemporaryRedirect)
			return
		}
		if !strings.HasPrefix(r.URL.Path, appPath) {
			http.NotFound(w, r)
			return
		}
		name := strings.TrimPrefix(r.URL.Path, appPath)
		if name == "" {
			name = "index.html"
		}
		file := files[name]
		if file == nil {
			http.NotFound(w, r)
			return
		}
		content, err := file.Open()
		if err != nil {
			http.Error(w, "Unable to read web asset", http.StatusInternalServerError)
			return
		}
		defer content.Close()

		w.Header().Set("Content-Type", contentType(name))
		w.Header().Set("Content-Length", strconv.FormatUint(file.UncompressedSize64, 10))
		w.Header().Set("Cache-Control", "no-cache")
		if r.Method == http.MethodGet {
			_, _ = io.Copy(w, content)
		}
	}), nil
}

func contentType(name string) string {
	extension := path.Ext(name)
	switch extension {
	case ".js", ".mjs":
		return "text/javascript; charset=utf-8"
	case ".webmanifest":
		return "application/manifest+json"
	}
	if contentType := mime.TypeByExtension(extension); contentType != "" {
		return contentType
	}
	return "application/octet-stream"
}

func handleLauncher(w http.ResponseWriter, r *http.Request, origin string, monitor *pageMonitor) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.URL.Path {
	case launcherPath + "status":
		if r.Method == http.MethodGet {
			w.Header().Set("X-AKSP-Launcher", "1")
			w.WriteHeader(http.StatusNoContent)
			return
		}
	case launcherPath + "open":
		if r.Method == http.MethodGet {
			monitor.openingPage(time.Now())
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = io.WriteString(w, openPageHTML)
			return
		}
	case launcherPath + "heartbeat", launcherPath + "close", launcherPath + "monitor":
		if r.Method == http.MethodPost {
			if r.Header.Get("Origin") != origin {
				http.Error(w, "Invalid origin", http.StatusForbidden)
				return
			}
			handlePageEvent(w, r, monitor, time.Now())
			return
		}
	default:
		http.NotFound(w, r)
		return
	}
	allowed := "POST"
	if r.URL.Path == launcherPath+"open" || r.URL.Path == launcherPath+"status" {
		allowed = "GET"
	}
	w.Header().Set("Allow", allowed)
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func handlePageEvent(w http.ResponseWriter, r *http.Request, monitor *pageMonitor, now time.Time) {
	id := r.URL.Query().Get("tab")
	if !validPageID.MatchString(id) {
		http.Error(w, "Invalid page ID", http.StatusBadRequest)
		return
	}
	var enabled bool
	switch r.URL.Path {
	case launcherPath + "heartbeat":
		enabled = monitor.heartbeat(id, now)
	case launcherPath + "close":
		monitor.closePage(id, now)
		w.WriteHeader(http.StatusNoContent)
		return
	case launcherPath + "monitor":
		switch r.URL.Query().Get("enabled") {
		case "true":
			enabled = true
		case "false":
		default:
			http.Error(w, "Invalid monitoring setting", http.StatusBadRequest)
			return
		}
		monitor.setEnabled(id, enabled, now)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(struct {
		Enabled bool `json:"enabled"`
	}{Enabled: enabled})
}
