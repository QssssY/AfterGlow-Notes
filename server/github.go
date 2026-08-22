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
package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	ghOkTTL   = time.Hour        // 成功结果缓存
	ghFailTTL = 15 * time.Minute // 失败负缓存：别对着限流反复撞
	ghMaxRepo = 12               // 一次最多问几个仓库
)

var ghRepoRe = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)

type ghInfo struct {
	Stars    int    `json:"stars"`
	Pushed   string `json:"pushed,omitempty"`
	Language string `json:"language,omitempty"`
}

type ghEntry struct {
	info ghInfo
	ok   bool
	at   time.Time
}

type ghCache struct {
	mu      sync.Mutex
	entries map[string]ghEntry
	token   string // GITHUB_TOKEN，可空
	client  *http.Client
}

func newGhCache(token string) *ghCache {
	return &ghCache{
		entries: map[string]ghEntry{},
		token:   token,
		client:  &http.Client{Timeout: 8 * time.Second},
	}
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
			return e.info, e.ok
		}
	}

	info, ok := c.fetch(repo)
	c.mu.Lock()
	if !ok && hit && e.ok {
		// 拉挂了但手里有旧成功值：负缓存计时，值保留 —— 显示旧数字比空白诚实
		c.entries[repo] = ghEntry{info: e.info, ok: false, at: time.Now()}
		c.mu.Unlock()
		return e.info, true
	}
	c.entries[repo] = ghEntry{info: info, ok: ok, at: time.Now()}
	c.mu.Unlock()
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
