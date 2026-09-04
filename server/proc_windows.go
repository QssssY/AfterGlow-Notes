//go:build windows

package main

import (
	"os/exec"
	"strconv"
)

// killTree 的 Windows 版：没有进程组信号，用 taskkill /T 连子进程一起结束
// （cmd /c 被单独杀掉后 node 会残留，还握着输出管道让 Wait 挂死 —— 与 Unix 版同一个坑）
func killTree(cmd *exec.Cmd) {
	cmd.Cancel = func() error {
		return exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
	}
}
