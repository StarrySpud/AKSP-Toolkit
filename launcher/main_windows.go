package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"syscall"
	"time"
	"unsafe"
)

var (
	shellExecute = syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")
	messageBox   = syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW")
)

func main() {
	port := flag.Int("port", 5174, "loopback port")
	noBrowser := flag.Bool("no-browser", false, "start server without opening the default browser")
	flag.Parse()

	if err := run(*port, *noBrowser); err != nil {
		if *noBrowser {
			fmt.Fprintln(os.Stderr, err)
		} else {
			title, _ := syscall.UTF16PtrFromString("AKSP-Toolkit")
			message, _ := syscall.UTF16PtrFromString(err.Error())
			messageBox.Call(0, uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x10)
		}
		os.Exit(1)
	}
}

func run(port int, noBrowser bool) error {
	if port < 1 || port > 65535 {
		return fmt.Errorf("端口必须在 1–65535 之间。")
	}
	host := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	origin := "http://" + host
	browserURL := origin + launcherPath + "open"
	listener, err := net.Listen("tcp4", host)
	if err != nil {
		if !noBrowser && existingLauncher(origin) {
			return openBrowser(browserURL)
		}
		return fmt.Errorf("无法启动本地服务。请确认端口 %d 未被 Vite 或其他程序占用，再双击打开。\n\n%v", port, err)
	}
	defer listener.Close()

	monitor := newPageMonitor(time.Now())
	handler, err := newHandler(host, monitor)
	if err != nil {
		return err
	}
	server := &http.Server{
		Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second,
	}
	defer server.Close()
	serverResult := make(chan error, 1)
	go func() { serverResult <- server.Serve(listener) }()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		if monitor.waitForIdle(ctx) {
			_ = server.Close()
		}
	}()

	if !noBrowser {
		if err := openBrowser(browserURL); err != nil {
			return err
		}
	}
	if err := <-serverResult; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func existingLauncher(origin string) bool {
	client := &http.Client{
		Timeout: time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Get(origin + launcherPath + "status")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusNoContent && response.Header.Get("X-AKSP-Launcher") == "1"
}

func openBrowser(url string) error {
	verb, _ := syscall.UTF16PtrFromString("open")
	target, _ := syscall.UTF16PtrFromString(url)
	result, _, _ := shellExecute.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(target)), 0, 0, 1)
	if result <= 32 {
		return fmt.Errorf("无法打开默认浏览器（Windows 错误 %d）。请检查系统的默认浏览器设置。", result)
	}
	return nil
}
