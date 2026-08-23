package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// 验证 progressWriter 的「按写入进度续期」确实压得过全局 WriteTimeout：
// 服务端把 WriteTimeout 设成 1 秒，处理器分四次慢写共 2.4 秒 —— 不续期时
// 连接会在 1 秒处被掐（对照组），续期后应完整送达。这守住的是 -site 模式
// 音乐/大图在 1M 带宽上传不完 30 秒的修复，别在重构里把包装层拆没了。
func TestProgressWriterOutlivesWriteTimeout(t *testing.T) {
	const chunk = "0123456789"
	handler := func(renew bool) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			var out io.Writer = w
			if renew {
				out = &progressWriter{w: w, rc: http.NewResponseController(w)}
			}
			for i := 0; i < 4; i++ {
				time.Sleep(600 * time.Millisecond)
				if _, err := out.Write([]byte(chunk)); err != nil {
					return
				}
				// 立刻刷到连接上 —— 写超时在真正落到 conn 时才暴露
				http.NewResponseController(w).Flush()
			}
		}
	}

	run := func(renew bool) (string, error) {
		ts := httptest.NewUnstartedServer(handler(renew))
		ts.Config.WriteTimeout = time.Second
		ts.Start()
		defer ts.Close()
		res, err := http.Get(ts.URL)
		if err != nil {
			return "", err
		}
		defer res.Body.Close()
		b, err := io.ReadAll(res.Body)
		return string(b), err
	}

	want := strings.Repeat(chunk, 4)
	if body, err := run(true); err != nil || body != want {
		t.Fatalf("续期后应完整收到响应，got body=%q err=%v", body, err)
	}
	if body, err := run(false); err == nil && body == want {
		t.Fatalf("对照组不该完整送达（WriteTimeout=1s 应掐断），got %q", body)
	}
}
