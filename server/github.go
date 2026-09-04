// GitHub 数据代理 —— 服务器替访客拉仓库星数/推送时间/主语言。
//
// 之前的做法是访客浏览器直连 api.github.com（匿名 60 次/时/IP），谁的配额
// 谁自己用；代价是撞限流的访客只能看到构建时的兜底数字。走这里之后全站
// 访客共享服务端的一份缓存：GitHub 每小时最多被打一次，数字对所有人都新鲜。
// 设了 GITHUB_TOKEN 环境变量还能把配额从 60 提到 5000（用不上，但留了口）。
//
// GET /api/github?repos=owner/a,owner/b  →  {"owner/a":{"stars":1,"pushed":"…","language":"Java"}}
// 拉不到的仓库直接不出现在结果里，前端自行退回兜底值。响应几百字节，
// 1M 小水管也毫无压力 —— 这正是这台机器该干的活：传数字，不传字节大户。
//
// 这是个不鉴权、不限流（GET）的公开口，所以两道护栏缺一不可：
//   - 白名单：配了 -blog-dir 时只替 src/data/repos.json 里列出的仓库跑腿（页面上
//     也只会问这几个）。名字不在单上的直接略过 —— 不出网、不进缓存。否则谁都能
//     拿随机仓库名让这台机器替他打 GitHub，60 次/时的匿名配额几分钟就被烧光，
//     真仓库的数字从此拿不到新的；
//   - 容量上限：纯 API 模式没有 repos.json 可查，靶子就是缓存 map —— 每个请求
//     最多 12 个名字、一个名字最长 140 字节、GET 没有次数限制，不设上限的话
//     持续灌随机名字能把 2G 小机的内存撑爆。满了先清过期的，还满就挤掉最老的。
package main

import (
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	ghOkTTL      = time.Hour        // 成功结果缓存
	ghFailTTL    = 15 * time.Minute // 失败负缓存：别对着限流反复撞
	ghMaxRepo    = 12               // 一次最多问几个仓库
	ghMaxEntries = 64               // 缓存条目上限（站上的仓库只有个位数，给足余量）
	ghAllowEvery = 30 * time.Second // 白名单文件最多多久重读一次（管理台改了 repos 不用重启）
)

// owner ≤ 39、repo ≤ 100 是 GitHub 自己的上限；限长的意义见文件头
var ghRepoRe = regexp.MustCompile(`^[\w.-]{1,39}/[\w.-]{1,100}$`)

type ghInfo struct {
	Stars    int    `json:"stars"`
	Pushed   string `json:"pushed,omitempty"`
	Language string `json:"language,omitempty"`
}

type ghEntry struct {
	info ghInfo
	ok   bool // 这次拉成功了
	// 拉挂了但 info 是上一次成功的值：负缓存期内照常给前端显示旧数字 ——
	// 原先只在挂掉的那一次返回旧值，之后 15 分钟一律空白，与「值保留」的本意相悖
	stale bool
	at    time.Time
}

type ghCache struct {
	mu      sync.Mutex
	entries map[string]ghEntry
	token   string // GITHUB_TOKEN，可空
	client  *http.Client

	// 白名单（allowFile 为空 = 不启用，纯 API 模式）：repos.json 里的 repo 字段集合
	allowFile  string
	allowMu    sync.Mutex
	allow      map[string]bool
	allowMod   time.Time // 上次读到的文件 mtime
	allowCheck time.Time // 上次 stat 的时刻
}

func newGhCache(token string) *ghCache {
	return &ghCache{
		entries: map[string]ghEntry{},
		token:   token,
		client:  &http.Client{Timeout: 8 * time.Second},
	}
}

// allowFrom 开启白名单：只替 file（repos.json）里列出的仓库跑腿
func (c *ghCache) allowFrom(file string) {
	c.allowFile = file
	c.reloadAllow(true)
}

// reloadAllow 按需重读白名单：mtime 没变就不解析；force 用于首次加载
func (c *ghCache) reloadAllow(force bool) {
	c.allowMu.Lock()
	defer c.allowMu.Unlock()
	now := time.Now()
	if !force && now.Sub(c.allowCheck) < ghAllowEvery {
		return
	}
	c.allowCheck = now
	info, err := os.Stat(c.allowFile)
	if err != nil {
		return // 文件没了：沿用上一份名单，别把功能整个关掉
	}
	if !force && info.ModTime().Equal(c.allowMod) {
		return
	}
	raw, err := os.ReadFile(c.allowFile)
	if err != nil {
		return
	}
	var items []struct {
		Repo string `json:"repo"`
	}
	if json.Unmarshal(raw, &items) != nil {
		return // 管理台存了半截 / 手改坏了：沿用旧名单
	}
	allow := make(map[string]bool, len(items))
	for _, it := range items {
		if r := strings.TrimSpace(it.Repo); r != "" {
			allow[strings.ToLower(r)] = true
		}
	}
	c.allow = allow
	c.allowMod = info.ModTime()
}

// allowed：没配白名单一律放行；配了就按 repos.json（大小写不敏感，GitHub 自己也不敏感）
func (c *ghCache) allowed(repo string) bool {
	if c.allowFile == "" {
		return true
	}
	c.reloadAllow(false)
	c.allowMu.Lock()
	defer c.allowMu.Unlock()
	return c.allow[strings.ToLower(repo)]
}

// put 写入缓存并守住容量（调用方须已持 c.mu）：先清过期条目，还满就挤掉最老的
func (c *ghCache) put(repo string, e ghEntry) {
	if _, exists := c.entries[repo]; !exists && len(c.entries) >= ghMaxEntries {
		now := time.Now()
		for k, v := range c.entries {
			ttl := ghOkTTL
			if !v.ok {
				ttl = ghFailTTL
			}
			if now.Sub(v.at) >= ttl {
				delete(c.entries, k)
			}
		}
		for len(c.entries) >= ghMaxEntries {
			oldest, oldestAt := "", now
			for k, v := range c.entries {
				if oldest == "" || v.at.Before(oldestAt) {
					oldest, oldestAt = k, v.at
				}
			}
			delete(c.entries, oldest)
		}
	}
	c.entries[repo] = e
}

// get 返回 (info, 是否可用)。缓存新鲜就直接给；过期才真的去 GitHub。
func (c *ghCache) get(repo string) (ghInfo, bool) {
	c.mu.Lock()
	e, hit := c.entries[repo]
	c.mu.Unlock()
	if hit {
		ttl := ghOkTTL
		if !e.ok {
			ttl = ghFailTTL
		}
		if time.Since(e.at) < ttl {
			return e.info, e.ok || e.stale
		}
	}

	info, ok := c.fetch(repo)
	c.mu.Lock()
	defer c.mu.Unlock()
	if !ok && hit && (e.ok || e.stale) {
		// 拉挂了但手里有旧成功值：负缓存计时，值保留 —— 显示旧数字比空白诚实
		c.put(repo, ghEntry{info: e.info, stale: true, at: time.Now()})
		return e.info, true
	}
	c.put(repo, ghEntry{info: info, ok: ok, at: time.Now()})
	return info, ok
}

func (c *ghCache) fetch(repo string) (ghInfo, bool) {
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/repos/"+repo, nil)
	if err != nil {
		return ghInfo{}, false
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := c.client.Do(req)
	if err != nil {
		return ghInfo{}, false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return ghInfo{}, false
	}
	var body struct {
		Stars    int     `json:"stargazers_count"`
		Pushed   string  `json:"pushed_at"`
		Language *string `json:"language"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return ghInfo{}, false
	}
	info := ghInfo{Stars: body.Stars, Pushed: body.Pushed}
	if body.Language != nil {
		info.Language = *body.Language
	}
	return info, true
}

func (s *server) handleGithub(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}
	names := strings.Split(r.URL.Query().Get("repos"), ",")
	out := map[string]ghInfo{}
	seen := 0
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" || !ghRepoRe.MatchString(name) {
			continue
		}
		seen++
		if seen > ghMaxRepo {
			break
		}
		// 不在 repos.json 上的名字不替它跑腿：不出网、不进缓存，结果里也不出现
		if !s.github.allowed(name) {
			continue
		}
		if info, ok := s.github.get(name); ok {
			out[name] = info
		}
	}
	if seen == 0 {
		fail(w, http.StatusBadRequest, "repos 参数要给 owner/repo，逗号分隔")
		return
	}
	// 浏览器侧也缓存 10 分钟，换页不用回源
	w.Header().Set("Cache-Control", "public, max-age=600")
	writeJSON(w, http.StatusOK, out)
}
