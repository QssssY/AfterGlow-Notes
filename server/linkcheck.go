// 友链巡检 —— 服务器替站长盯着 blogroll / friends 里的链接还活不活。
//
// 死链是友链页最伤体面的事，但没人会天天手点一遍。这活儿正适合常驻的
// 服务器：每 12 小时把 src/data/blogroll.json 与 friends.json 里的 href
// 全部探一遍（HEAD 优先，被拒就换 GET），结果只留在内存，管理台「统计」
// 页可看、也可手动触发重测。只在管理后台启用时运行 —— 结果本来也只给站长看。
package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	linkCheckEvery   = 12 * time.Hour
	linkCheckTimeout = 10 * time.Second
	linkCheckUA      = "Mozilla/5.0 (compatible; afterglow-linkcheck/1; blog friend-link health check)"
)

type linkResult struct {
	Source string `json:"source"` // blogroll | friends
	Name   string `json:"name"`
	URL    string `json:"url"`
	OK     bool   `json:"ok"`
	Status int    `json:"status,omitempty"` // 0 = 连接层失败
	Ms     int64  `json:"ms"`
	Err    string `json:"err,omitempty"`
}

type linkChecker struct {
	blogDir string
	client  *http.Client

	mu        sync.Mutex
	running   bool
	checkedAt time.Time
	results   []linkResult
}

func newLinkChecker(blogDir string) *linkChecker {
	return &linkChecker{
		blogDir: blogDir,
		client:  &http.Client{Timeout: linkCheckTimeout},
	}
}

// start：起来 30 秒后先跑一轮（让服务先安顿好），之后每 12 小时一轮
func (lc *linkChecker) start() {
	go func() {
		time.Sleep(30 * time.Second)
		lc.run()
		for range time.Tick(linkCheckEvery) {
			lc.run()
		}
	}()
}

// trigger 手动触发一轮（异步）；已在跑就返回 false
func (lc *linkChecker) trigger() bool {
	lc.mu.Lock()
	if lc.running {
		lc.mu.Unlock()
		return false
	}
	lc.running = true
	lc.mu.Unlock()
	go lc.runLocked()
	return true
}

func (lc *linkChecker) run() {
	lc.mu.Lock()
	if lc.running {
		lc.mu.Unlock()
		return
	}
	lc.running = true
	lc.mu.Unlock()
	lc.runLocked()
}

// runLocked：running 已置位的前提下真正干活，收尾时写回结果
func (lc *linkChecker) runLocked() {
	// running 的复位放 defer 里，panic 也能放回去 —— 否则一次意外就让
	// 12 小时自动轮和手动触发从此永久失效，只能重启救
	defer func() {
		if v := recover(); v != nil {
			log.Printf("linkcheck: 巡检中途 panic（已兜住）: %v", v)
		}
		lc.mu.Lock()
		lc.running = false
		lc.mu.Unlock()
	}()

	targets := lc.collect()

	results := make([]linkResult, len(targets))
	sem := make(chan struct{}, 4) // 并发 4：别一瞬间把小水管占满，也别对人家太热情
	var wg sync.WaitGroup
	for i, t := range targets {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, t linkResult) {
			defer func() { <-sem; wg.Done() }()
			results[i] = lc.probe(t)
		}(i, t)
	}
	wg.Wait()

	lc.mu.Lock()
	lc.results = results
	lc.checkedAt = time.Now()
	lc.mu.Unlock()
}

// collect 读两份数据文件，抽出 name/href
func (lc *linkChecker) collect() []linkResult {
	var out []linkResult
	for _, src := range []string{"blogroll", "friends"} {
		raw, err := os.ReadFile(filepath.Join(lc.blogDir, "src", "data", src+".json"))
		if err != nil {
			continue
		}
		var items []struct {
			Name string `json:"name"`
			Href string `json:"href"`
		}
		if json.Unmarshal(raw, &items) != nil {
			continue
		}
		for _, it := range items {
			if it.Href == "" {
				continue
			}
			out = append(out, linkResult{Source: src, Name: it.Name, URL: it.Href})
		}
	}
	return out
}

// probe：HEAD 优先（省两边流量），4xx/5xx 或连接失败再用 GET 复核 ——
// 不少站对 HEAD 直接 405/403，不能只凭它宣判
func (lc *linkChecker) probe(t linkResult) linkResult {
	start := time.Now()
	status, err := lc.request(http.MethodHead, t.URL)
	if err != nil || status >= 400 {
		status, err = lc.request(http.MethodGet, t.URL)
	}
	t.Ms = time.Since(start).Milliseconds()
	t.Status = status
	t.OK = err == nil && status > 0 && status < 400
	if err != nil {
		t.Err = err.Error()
	}
	return t
}

// request 发一次探测；整体时限由 client.Timeout 统一兜住（含响应体那一小口）
func (lc *linkChecker) request(method, url string) (int, error) {
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", linkCheckUA)
	res, err := lc.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	// GET 时只喝一小口就走 —— 确认活着即可，不把人家页面整个拖回来
	io.CopyN(io.Discard, res.Body, 4096)
	return res.StatusCode, nil
}

// handleLinkCheck：GET 看结果，POST 触发重测（管理台鉴权由外层包）
func (s *server) handleLinkCheck(w http.ResponseWriter, r *http.Request) {
	lc := s.links
	switch r.Method {
	case http.MethodGet:
		lc.mu.Lock()
		resp := map[string]any{
			"running": lc.running,
			"results": lc.results,
		}
		if !lc.checkedAt.IsZero() {
			resp["checkedAt"] = lc.checkedAt.Format(time.RFC3339)
		}
		lc.mu.Unlock()
		writeJSON(w, http.StatusOK, resp)

	case http.MethodPost:
		if !lc.trigger() {
			fail(w, http.StatusConflict, "已经在检测了")
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]bool{"started": true})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / POST")
	}
}
