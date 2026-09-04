//go:build !windows

package main

import (
	"os/exec"
	"syscall"
)

// killTree 让超时 / 取消时连同 sh 派生出的 pnpm、node 一起结束。
// exec.CommandContext 默认只杀 sh 本身：孙进程照跑不误，还握着输出管道 ——
// CombinedOutput 底下的 Wait 要等管道 EOF，于是永远等不到，building 标志卡死。
// 起在独立进程组里，取消时对整组发 SIGKILL。
func killTree(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
}
