// 在线人数与合并计数接口。
//
// 在线 = 最近 5 分钟内有过动静（打开文章页）的匿名 visitor 数。
// 只进内存不落库、不存 IP/UA —— 和关于页「细则」的口径一致：聚合计数，不做画像。
//
// POST /api/touch 是文章页的「一次往返拿全部」：记一次阅读（同人同天去重）、
// 返回阅读数 + 点赞数 + 我是否赞过 + 在线人数。原来这些要 GET /api/likes 和
// POST /api/views 两个请求（跨域部署时各自还带一次 CORS 预检）；合并后一个
// 请求全办完 —— 对 1M 小水管和响应速度都友好。旧接口原样保留，兼容老产物。
package main

import (
	"net/http"
	"strconv"
	"sync"
	"time"
)

const presenceWindow = 5 * time.Minute

type presence struct {
	mu        sync.Mutex
	seen      map[string]time.Time
	lastSweep time.Time
}

func newPresence() *presence {
	return &presence{seen: map[string]time.Time{}}
}

// sweep 惰性清走过期条目（调用方须已持锁）：最多一分钟清一次，别每请求全表扫
func (p *presence) sweep(now time.Time) {
	if now.Sub(p.lastSweep) < time.Minute {
		return
	}
	p.lastSweep = now
	for v, at := range p.seen {
		if now.Sub(at) > presenceWindow {
			delete(p.seen, v)
		}
	}
}

func (p *presence) touch(visitor string) {
	now := time.Now()
	p.mu.Lock()
	p.seen[visitor] = now
	p.sweep(now)
	p.mu.Unlock()
}

func (p *presence) count() int {
	now := time.Now()
	p.mu.Lock()
	defer p.mu.Unlock()
	p.sweep(now)
	n := 0
	for _, at := range p.seen {
		if now.Sub(at) <= presenceWindow {
			n++
		}
	}
	return n
}

// handleTouch：POST {slug, visitor} → {views, likes, liked, online}
func (s *server) handleTouch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "只支持 POST")
		return
	}
	if !s.allowWrite(r) {
		fail(w, http.StatusTooManyRequests, "太频繁了")
		return
	}
	b, ok := readBody(w, r)
	if !ok {
		return
	}

	s.presence.touch(b.Visitor)

	if err := s.recordView(b.Slug, b.Visitor); err != nil {
		fail(w, http.StatusInternalServerError, "写入失败")
		return
	}

	views, err := s.viewCount(b.Slug)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败")
		return
	}
	likes, liked, err := s.likeState(b.Slug, b.Visitor)
	if err != nil {
		fail(w, http.StatusInternalServerError, "查询失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"views": views, "likes": likes, "liked": liked, "online": s.presence.count(),
	})
}

// handleOnline：GET → {count}。公开的聚合数字，想在页面上摆「N 人在线」直接用它
func (s *server) handleOnline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=15")
	writeJSON(w, http.StatusOK, map[string]int{"count": s.presence.count()})
}

// ---- /api/hot 微缓存 ----
//
// 榜单是纯聚合、全员一样，却每次都要一遍 GROUP BY 全表扫。
// 服务端 30 秒微缓存 + 浏览器 60 秒缓存，首页高频打开时数据库几乎不被碰。

const hotTTL = 30 * time.Second

type hotEntry struct {
	body []byte
	at   time.Time
}

type hotCache struct {
	mu      sync.Mutex
	entries map[int]hotEntry // 键是榜单条数 limit（1–10），条目数天然有界
}

func newHotCache() *hotCache {
	return &hotCache{entries: map[int]hotEntry{}}
}

func (c *hotCache) get(limit int) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[limit]
	if !ok || time.Since(e.at) > hotTTL {
		return nil, false
	}
	return e.body, true
}

func (c *hotCache) put(limit int, b []byte) {
	c.mu.Lock()
	c.entries[limit] = hotEntry{body: b, at: time.Now()}
	c.mu.Unlock()
}

func hotLimit(r *http.Request) int {
	limit := 3
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n >= 1 && n <= 10 {
			limit = n
		}
	}
	return limit
}
