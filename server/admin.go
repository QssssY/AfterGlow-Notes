// 管理后台的写接口 —— 网页端 /overview 的后端。
//
// 设计取向：博客本体是纯静态 + git 是唯一事实源，所以这里不建内容数据库，
// 所有「改内容」都落成仓库里的文件：
//   - 文章        → src/content/posts/<slug>.md（YAML front-matter + 正文）
//   - 站点数据    → src/data/<name>.json（站点文案 / 关于页 / 项目 / 友链 / 播放列表等）
//   - 上传        → 封面进 src/content/posts/_covers/，插图进 public/images/uploads/（内容寻址去重），
//     友链头像按域名进 images/blogroll/，项目配图按仓库名进 images/projects/，
//     音乐进 public/music/
//
// dev 模式下 astro dev 监听这些文件，保存即热更新；部署后改完要重新构建
// （/api/overview/build 可配一条构建命令，没配就提示手动构建）。
//
// 鉴权：-admin-pass 不设则整组接口不注册（对外零暴露）。登录换随机会话
// token（内存态，重启作废），之后每个请求带 Authorization: Bearer。
// 登录尝试按 IP 限每天 20 次，口令比较用常数时间。
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

type adminState struct {
	pass          string // 登录口令
	blogDir       string // 仓库根目录（绝对路径）
	buildCmd      string // 可选：重新构建站点的命令
	musicOverride string // -music 目录；非空时传歌落这里而不是仓库的 public/music
	musicAPI      string // 在线找歌的聚合音源基址（-music-api）；空或 "off" 则该功能关闭（music.go）
	musicAPIKind  string // 音源形状（-music-api-kind）：unified 统一封装层 | gdstudio GD 音乐台

	mu       sync.Mutex
	sessions map[string]time.Time // token → 过期时刻
	tries    map[string]int       // 登录失败限流：IP → 当日尝试数
	triesDay string

	buildMu   sync.Mutex
	building  bool
	lastBuild *buildResult
}

type buildResult struct {
	OK         bool   `json:"ok"`
	Output     string `json:"output"`
	FinishedAt string `json:"finishedAt"`
	Took       string `json:"took"`
}

func (a *adminState) postsDir() string  { return filepath.Join(a.blogDir, "src", "content", "posts") }
func (a *adminState) coversDir() string { return filepath.Join(a.postsDir(), "_covers") }
func (a *adminState) dataDir() string   { return filepath.Join(a.blogDir, "src", "data") }
func (a *adminState) uploadsDir() string {
	return filepath.Join(a.blogDir, "public", "images", "uploads")
}

// 音乐目录：音乐是版权物不进仓库 —— 配了 -music 就落服务器目录（分体部署），
// 没配才落仓库的 public/music（本地开发用，该目录 gitignored）
func (a *adminState) musicDir() string {
	if a.musicOverride != "" {
		return a.musicOverride
	}
	return filepath.Join(a.blogDir, "public", "music")
}

// 友链头像目录：文件名 = 域名，前端按域名 glob（src/utils/blogroll-avatars.ts）
func (a *adminState) blogAvatarsDir() string {
	return filepath.Join(a.blogDir, "images", "blogroll")
}

// 项目配图目录：文件名 = 仓库名（小写），前端按名 glob（src/utils/project-thumbs.ts）
func (a *adminState) projectThumbsDir() string {
	return filepath.Join(a.blogDir, "images", "projects")
}

// 站点级图片目录：固定几个名字（头像/画卡/快照），前端 glob 兜底默认图（src/utils/site-images.ts）
func (a *adminState) siteImagesDir() string {
	return filepath.Join(a.blogDir, "images", "site")
}

// 站点图片的合法名字白名单 —— 前端 helper 只认这几个
var siteImageNames = map[string]bool{
	"avatar": true, "art": true, "snapshot-1": true, "snapshot-2": true, "snapshot-3": true,
}

// 站点数据文件白名单 —— 新增一种内容 = 这里加一行 + src/data 放文件 + config.ts 引入
var dataFiles = map[string]struct {
	kind     string // array | object
	minItems int    // 页面要求至少保留的条目数（如 repos Featured 卡、播放器）
}{
	"reading":   {"array", 0},
	"now":       {"object", 0},
	"playlist":  {"array", 1},
	"blogroll":  {"array", 0},
	"repos":     {"array", 1},
	"share":     {"array", 0},
	"tools":     {"array", 0},
	"site":      {"object", 0},
	"about":     {"object", 0},
	"theme":     {"object", 0},
	"changelog": {"array", 1},
	"friends":   {"array", 0},
	"socials":   {"array", 1},
	"stack":     {"array", 1},
}

var (
	dateRe  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	coverRe = regexp.MustCompile(`^\./_covers/[a-z0-9-]+\.(png|jpe?g|webp|gif|avif)$`)
)

func registerAdminRoutes(mux *http.ServeMux, s *server) {
	// 路由只写路径不写方法：方法在处理器里 switch —— 这样 OPTIONS 预检
	// 也能进到 cors 包装层拿到放行头（带方法的 pattern 会把预检打成 405）
	mux.HandleFunc("/api/overview/login", s.cors(s.adminLogin))
	mux.HandleFunc("/api/overview/summary", s.cors(s.adminAuth(s.adminSummary)))
	mux.HandleFunc("/api/overview/posts", s.cors(s.adminAuth(s.adminPostList)))
	mux.HandleFunc("/api/overview/posts/{slug}", s.cors(s.adminAuth(s.adminPost)))
	mux.HandleFunc("/api/overview/data/{name}", s.cors(s.adminAuth(s.adminData)))
	mux.HandleFunc("/api/overview/upload", s.cors(s.adminAuth(s.adminUpload)))
	mux.HandleFunc("/api/overview/build", s.cors(s.adminAuth(s.adminBuild)))
	mux.HandleFunc("/api/overview/stats", s.cors(s.adminAuth(s.adminStats)))
	mux.HandleFunc("/api/overview/linkcheck", s.cors(s.adminAuth(s.handleLinkCheck)))
	mux.HandleFunc("/api/overview/asset/site/{name}", s.cors(s.adminAuth(s.adminSiteAsset)))
	// 在线找歌（music.go）：搜索 + 入库下载。未配 -music-api 时处理器自身答 501，
	// 所以路由照常注册 —— 前端能拿到「未启用」的明确提示，而不是 404
	mux.HandleFunc("/api/overview/music/search", s.cors(s.adminAuth(s.adminMusicSearch)))
	mux.HandleFunc("/api/overview/music/fetch", s.cors(s.adminAuth(s.adminMusicFetch)))
}

// adminSiteAsset：站点图片的预览供给 —— 它们存在 Astro 资产目录（不是 public/），
// 没有可直接引用的 URL；管理台的 <img> 又带不了 Bearer 头，所以前端 fetch
// 这里再转 blob。只认白名单名字，这些图本来就会出现在公开页面上，不涉密。
func (s *server) adminSiteAsset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}
	name := r.PathValue("name")
	if !siteImageNames[name] {
		fail(w, http.StatusNotFound, "没有这个图片位")
		return
	}
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"} {
		data, err := os.ReadFile(filepath.Join(s.admin.siteImagesDir(), name+ext))
		if err != nil {
			continue
		}
		w.Header().Set("Content-Type", mime.TypeByExtension(ext))
		w.Header().Set("Cache-Control", "no-store")
		w.Write(data)
		return
	}
	// 没传过 → 给仓库自带的默认图（映射与 src/utils/site-images.ts 保持一致），
	// 管理台的预览瓦片才不会是一排空加号
	defaults := map[string]string{
		"avatar": "cat001.jpg", "art": "bg.webp",
		"snapshot-1": "snapshot-dusk.png", "snapshot-2": "snapshot-field.png", "snapshot-3": "snapshot-lantern.png",
	}
	if def, ok := defaults[name]; ok {
		if data, err := os.ReadFile(filepath.Join(s.admin.blogDir, "images", def)); err == nil {
			w.Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(def)))
			w.Header().Set("Cache-Control", "no-store")
			w.Write(data)
			return
		}
	}
	fail(w, http.StatusNotFound, "这个位置还没传过图")
}

// ---- 鉴权 ----

// weakPassReason：口令强度的硬门槛，过不了直接拒绝启动。
// 仓库是开源的，管理台的一切防护都建立在「口令不可猜」上 —— 长度不够、
// 或者含有看一眼仓库就能想到的字样（站名/admin/password），都不许用。
func weakPassReason(pass string) string {
	if len(pass) < 12 {
		return "长度不足 12 位"
	}
	lower := strings.ToLower(pass)
	for _, w := range []string{"afterglow", "admin", "password", "123456", "qwerty"} {
		if strings.Contains(lower, w) {
			return "包含太好猜的字样「" + w + "」"
		}
	}
	return ""
}

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // 系统熵源坏了没有降级余地
	}
	return hex.EncodeToString(b)
}

func (s *server) adminLogin(w http.ResponseWriter, r *http.Request) {
	a := s.admin

	// DELETE = 注销：把这枚 token 从会话表里抹掉。以前「退出」只是浏览器忘掉 token，
	// 服务端那份照旧有效 30 天 —— 共用电脑上事后从 localStorage 备份里翻出来还能用
	if r.Method == http.MethodDelete {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		a.mu.Lock()
		delete(a.sessions, token)
		a.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "只支持 POST / DELETE")
		return
	}

	// 口令尝试限流：每 IP 每天 20 次，跨天清零（和点赞限流同款、但更紧）
	day := utcDay()
	ip := clientIP(r)
	a.mu.Lock()
	if a.triesDay != day {
		a.triesDay = day
		a.tries = map[string]int{}
	}
	if a.tries[ip] >= 20 {
		a.mu.Unlock()
		fail(w, http.StatusTooManyRequests, "尝试次数太多，明天再来")
		return
	}
	a.tries[ip]++
	a.mu.Unlock()

	var b struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&b); err != nil {
		fail(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	if subtle.ConstantTimeCompare([]byte(b.Password), []byte(a.pass)) != 1 {
		// 猜错一次至少付 400ms —— 叠上每 IP 每天 20 次的限流，在线暴力猜没有生存空间
		time.Sleep(400 * time.Millisecond)
		fail(w, http.StatusUnauthorized, "口令不对")
		return
	}

	token := randomToken()
	now := time.Now()
	a.mu.Lock()
	// 顺手清过期会话，别让 map 无限长
	for t, exp := range a.sessions {
		if now.After(exp) {
			delete(a.sessions, t)
		}
	}
	a.sessions[token] = now.Add(30 * 24 * time.Hour)
	a.tries[ip] = 0 // 登对了就把当天的失败计数还回去
	a.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}

func (s *server) adminAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a := s.admin
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		a.mu.Lock()
		exp, ok := a.sessions[token]
		if ok && time.Now().After(exp) {
			delete(a.sessions, token)
			ok = false
		}
		a.mu.Unlock()
		if token == "" || !ok {
			fail(w, http.StatusUnauthorized, "未登录或登录已过期")
			return
		}
		next(w, r)
	}
}

// ---- 文章：front-matter 编解码 ----

// postMeta 与 src/content.config.ts 的 schema 一一对应
type postMeta struct {
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Date        string   `json:"date"`
	Updated     string   `json:"updated,omitempty"`
	Tags        []string `json:"tags"`
	Category    string   `json:"category,omitempty"`
	Cover       string   `json:"cover,omitempty"`
	Draft       bool     `json:"draft"`
}

var fmRe = regexp.MustCompile(`(?s)\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\z`)

// utf8BOM：Windows 编辑器常给文件头加的字节序标记，进 YAML 解析前剥掉
const utf8BOM = "\uFEFF"

func parsePost(raw []byte) (postMeta, string, error) {
	text := strings.TrimPrefix(string(raw), utf8BOM)
	m := fmRe.FindStringSubmatch(text)
	if m == nil {
		return postMeta{}, text, fmt.Errorf("没有 front-matter")
	}
	var doc map[string]any
	if err := yaml.Unmarshal([]byte(m[1]), &doc); err != nil {
		return postMeta{}, "", fmt.Errorf("front-matter 不是合法 YAML: %w", err)
	}

	str := func(k string) string {
		switch v := doc[k].(type) {
		case string:
			return v
		case time.Time: // yaml 会把裸日期解析成时间
			return v.Format("2006-01-02")
		default:
			return ""
		}
	}
	meta := postMeta{
		Title:       str("title"),
		Description: str("description"),
		Date:        str("date"),
		Updated:     str("updated"),
		Category:    str("category"),
		Cover:       str("cover"),
	}
	if d, ok := doc["draft"].(bool); ok {
		meta.Draft = d
	}
	if list, ok := doc["tags"].([]any); ok {
		for _, t := range list {
			if ts, ok := t.(string); ok {
				meta.Tags = append(meta.Tags, ts)
			}
		}
	}
	if meta.Tags == nil {
		meta.Tags = []string{}
	}
	// 正文剥掉首尾换行：fence 后的空行和文件末换行是格式，不是内容 ——
	// 不剥的话编辑器每存一次就多一层空行，GET/PUT 也无法往返相等
	return meta, strings.Trim(m[2], "\r\n"), nil
}

// renderPost 组回文件：写死一种规范格式，字符串一律双引号
// （YAML 双引号的转义规则与 Go %q 兼容，中文原样保留）
func renderPost(meta postMeta, body string) []byte {
	q := strconv.Quote
	var b strings.Builder
	b.WriteString("---\n")
	fmt.Fprintf(&b, "title: %s\n", q(meta.Title))
	if meta.Description != "" {
		fmt.Fprintf(&b, "description: %s\n", q(meta.Description))
	}
	fmt.Fprintf(&b, "date: %s\n", meta.Date)
	if meta.Updated != "" {
		fmt.Fprintf(&b, "updated: %s\n", meta.Updated)
	}
	if len(meta.Tags) > 0 {
		quoted := make([]string, len(meta.Tags))
		for i, t := range meta.Tags {
			quoted[i] = q(t)
		}
		fmt.Fprintf(&b, "tags: [%s]\n", strings.Join(quoted, ", "))
	}
	if meta.Category != "" {
		fmt.Fprintf(&b, "category: %s\n", q(meta.Category))
	}
	if meta.Cover != "" {
		fmt.Fprintf(&b, "cover: %s\n", meta.Cover)
	}
	if meta.Draft {
		b.WriteString("draft: true\n")
	}
	b.WriteString("---\n\n")

	body = strings.ReplaceAll(body, "\r\n", "\n") // Windows 浏览器的 textarea 会给 CRLF
	body = strings.TrimRight(body, "\n")
	b.WriteString(body)
	b.WriteString("\n")
	return []byte(b.String())
}

// postPath 找 slug 对应的现有文件（.md 或 .mdx）；没有则返回将要创建的 .md 路径
func (a *adminState) postPath(slug string) (path string, exists bool) {
	for _, ext := range []string{".md", ".mdx"} {
		p := filepath.Join(a.postsDir(), slug+ext)
		if _, err := os.Stat(p); err == nil {
			return p, true
		}
	}
	return filepath.Join(a.postsDir(), slug+".md"), false
}

func validateMeta(meta *postMeta) string {
	meta.Title = strings.TrimSpace(meta.Title)
	if meta.Title == "" {
		return "标题不能为空"
	}
	if !dateRe.MatchString(meta.Date) {
		return "date 要写成 YYYY-MM-DD"
	}
	if meta.Updated != "" && !dateRe.MatchString(meta.Updated) {
		return "updated 要写成 YYYY-MM-DD"
	}
	if meta.Cover != "" && !coverRe.MatchString(meta.Cover) {
		return "cover 只能是 ./_covers/ 下的图片（用上传接口生成）"
	}
	tags := meta.Tags[:0]
	for _, t := range meta.Tags {
		if t = strings.TrimSpace(t); t != "" {
			tags = append(tags, t)
		}
	}
	meta.Tags = tags
	return ""
}

// ---- 文章：接口 ----

type postListItem struct {
	Slug string `json:"slug"`
	postMeta
	Modified string `json:"modified"`
}

func (s *server) adminPostList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}
	entries, err := os.ReadDir(s.admin.postsDir())
	if err != nil {
		fail(w, http.StatusInternalServerError, "读不到文章目录: "+err.Error())
		return
	}
	items := []postListItem{}
	for _, e := range entries {
		name := e.Name()
		ext := filepath.Ext(name)
		if e.IsDir() || (ext != ".md" && ext != ".mdx") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(s.admin.postsDir(), name))
		if err != nil {
			continue
		}
		meta, _, err := parsePost(raw)
		if err != nil {
			continue // 解析不了的文件不进列表，编辑器也别去碰它
		}
		item := postListItem{Slug: strings.TrimSuffix(name, ext), postMeta: meta}
		if info, err := e.Info(); err == nil {
			item.Modified = info.ModTime().Format(time.RFC3339)
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Date > items[j].Date })
	writeJSON(w, http.StatusOK, items)
}

func (s *server) adminPost(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !slugRe.MatchString(slug) {
		fail(w, http.StatusBadRequest, "slug 只能是小写字母、数字和短横线")
		return
	}
	path, exists := s.admin.postPath(slug)

	switch r.Method {
	case http.MethodGet:
		if !exists {
			fail(w, http.StatusNotFound, "没有这篇文章")
			return
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			fail(w, http.StatusInternalServerError, "读取失败: "+err.Error())
			return
		}
		meta, body, err := parsePost(raw)
		if err != nil {
			fail(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"slug": slug, "meta": meta, "body": body})

	case http.MethodPut:
		var payload struct {
			Meta postMeta `json:"meta"`
			Body string   `json:"body"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&payload); err != nil {
			fail(w, http.StatusBadRequest, "请求体不是合法 JSON")
			return
		}
		if msg := validateMeta(&payload.Meta); msg != "" {
			fail(w, http.StatusBadRequest, msg)
			return
		}
		if err := os.MkdirAll(s.admin.postsDir(), 0o755); err != nil {
			fail(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := os.WriteFile(path, renderPost(payload.Meta, payload.Body), 0o644); err != nil {
			fail(w, http.StatusInternalServerError, "写入失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"slug": slug, "created": !exists})

	case http.MethodDelete:
		if !exists {
			fail(w, http.StatusNotFound, "没有这篇文章")
			return
		}
		if err := os.Remove(path); err != nil {
			fail(w, http.StatusInternalServerError, "删除失败: "+err.Error())
			return
		}
		// 封面留在 _covers 里不动：万一删错文章，内容没了图还在
		writeJSON(w, http.StatusOK, map[string]any{"deleted": slug})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / PUT / DELETE")
	}
}

// ---- 站点数据（src/data/*.json）----

// 译文覆盖文件的语种码：两段小写（en / ja / pt-br…）。与前端 src/i18n/content.ts
// 收集覆盖文件的正则保持子集关系 —— 这里放行的名字，构建时一定会被捡起来
var localeRe = regexp.MustCompile(`^[a-z]{2}(-[a-z]{2,8})?$`)

func (s *server) adminData(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	spec, ok := dataFiles[name]
	if !ok {
		fail(w, http.StatusNotFound, "没有这种数据")
		return
	}

	// ?locale=en → 读写 <name>.en.json（部分覆盖：只存要翻的字段，缺的回落中文基准）。
	// zh 是基准语种，它的真身就是 <name>.json —— 不允许再造一份 <name>.zh.json 遮蔽自己
	locale := r.URL.Query().Get("locale")
	if locale != "" && (locale == "zh" || !localeRe.MatchString(locale)) {
		fail(w, http.StatusBadRequest, "语种码不合法（形如 en / ja / pt-br）")
		return
	}
	filename := name + ".json"
	if locale != "" {
		filename = name + "." + locale + ".json"
	}
	path := filepath.Join(s.admin.dataDir(), filename)

	switch r.Method {
	case http.MethodGet:
		raw, err := os.ReadFile(path)
		if err != nil {
			if locale != "" && os.IsNotExist(err) {
				// 这个语种还没有译文文件：给 null，前端从空表开始
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.Write([]byte("null"))
				return
			}
			fail(w, http.StatusInternalServerError, "读取失败: "+err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write(raw)

	case http.MethodPut:
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if err != nil {
			fail(w, http.StatusBadRequest, "读取请求体失败")
			return
		}
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			fail(w, http.StatusBadRequest, "不是合法 JSON")
			return
		}
		switch spec.kind {
		case "array":
			list, ok := v.([]any)
			if !ok {
				fail(w, http.StatusBadRequest, "这份数据应该是数组")
				return
			}
			// minItems 只约束基准：译文是部分覆盖，只写翻过的条目、少几条是常态
			if locale == "" && len(list) < spec.minItems {
				fail(w, http.StatusBadRequest, fmt.Sprintf("至少要保留 %d 条", spec.minItems))
				return
			}
			if locale == "" && name == "playlist" {
				if err := validatePlaylistDefaults(list); err != nil {
					fail(w, http.StatusBadRequest, err.Error())
					return
				}
			}
		case "object":
			if _, ok := v.(map[string]any); !ok {
				fail(w, http.StatusBadRequest, "这份数据应该是对象")
				return
			}
		}
		// json.Indent 保留客户端的键序 —— 重新 Unmarshal/Marshal 会把键排成字典序，git diff 会乱。
		// 它同时会把 src 末尾的空白原样抄过去（文档明说的），所以先剪掉再补唯一那个换行 ——
		// 否则请求体自带尾换行时会写出 "]\n\n"，同一份内容存两次得到两种字节
		var out bytes.Buffer
		if err := json.Indent(&out, bytes.TrimRight(raw, " \t\r\n"), "", "  "); err != nil {
			fail(w, http.StatusBadRequest, "格式化失败")
			return
		}
		out.WriteByte('\n')
		if err := os.WriteFile(path, out.Bytes(), 0o644); err != nil {
			fail(w, http.StatusInternalServerError, "写入失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	case http.MethodDelete:
		// 只有译文文件可删（删 = 该语种整组回落中文基准）；基准是页面的数据源，不许删
		if locale == "" {
			fail(w, http.StatusBadRequest, "基准数据不能删，只有译文文件可以")
			return
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			fail(w, http.StatusInternalServerError, "删除失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / PUT / DELETE")
	}
}

// validatePlaylistDefaults keeps the build-time and admin-time contract aligned:
// a non-empty playlist must identify exactly one track for the first visit.
func validatePlaylistDefaults(list []any) error {
	defaults := 0
	for i, raw := range list {
		item, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("歌单第 %d 项必须是对象", i+1)
		}
		value, exists := item["default"]
		if !exists {
			continue
		}
		marked, ok := value.(bool)
		if !ok {
			return fmt.Errorf("歌单 default 必须是布尔值")
		}
		if marked {
			defaults++
		}
	}
	if len(list) > 0 && defaults != 1 {
		return fmt.Errorf("歌单必须且只能指定一首 default: true 的默认曲目")
	}
	return nil
}

// ---- 上传 ----

var (
	imageExts = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".gif": true, ".avif": true}
	musicExts = map[string]bool{".mp3": true, ".m4a": true, ".ogg": true, ".flac": true, ".lrc": true}
	nameSan   = regexp.MustCompile(`[^a-z0-9-]+`)
	domainRe  = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{0,62}$`) // 友链头像按域名命名
)

func (s *server) adminUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "只支持 POST")
		return
	}
	// ParseMultipartForm 的参数只是「内存里最多放多少、其余落临时文件」的分界，
	// 不限制请求体本身 —— 30MB 的上限要靠 MaxBytesReader 才是真的（多给 1MB 装表单字段）。
	// 下面 io.ReadAll 会把文件整个读进内存，没这道闸一个超大文件就能把 2G 小机打爆
	r.Body = http.MaxBytesReader(w, r.Body, 31<<20)
	if err := r.ParseMultipartForm(30 << 20); err != nil {
		fail(w, http.StatusBadRequest, "上传解析失败（单个文件最大 30MB）")
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		fail(w, http.StatusBadRequest, "缺少 file 字段")
		return
	}
	defer file.Close()

	// 整个读进内存（上限 30MB）：插图要拿内容算 hash 做去重，其他类型也顺路统一写法
	data, err := io.ReadAll(file)
	if err != nil {
		fail(w, http.StatusInternalServerError, "读取上传内容失败: "+err.Error())
		return
	}

	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	kind := r.FormValue("kind")

	var dst, ret string
	switch kind {
	case "cover":
		slug := r.FormValue("slug")
		if !slugRe.MatchString(slug) {
			fail(w, http.StatusBadRequest, "封面上传要带合法的 slug")
			return
		}
		if !imageExts[ext] {
			fail(w, http.StatusBadRequest, "封面只收 png / jpg / webp / gif / avif")
			return
		}
		// 同 slug 的旧封面（可能是别的扩展名）先清掉，免得目录里越攒越多
		for old := range imageExts {
			if old != ext {
				os.Remove(filepath.Join(s.admin.coversDir(), slug+old))
			}
		}
		dst = filepath.Join(s.admin.coversDir(), slug+ext)
		ret = "./_covers/" + slug + ext

	case "image":
		if !imageExts[ext] {
			fail(w, http.StatusBadRequest, "插图只收 png / jpg / webp / gif / avif")
			return
		}
		// 内容寻址：文件名 = 内容的 SHA-256 前 16 位。同一张图不管传多少次
		// 都落到同一个文件，下面写盘前发现已存在就直接复用，不再攒重复文件
		sum := sha256.Sum256(data)
		name := hex.EncodeToString(sum[:8]) + ext
		dst = filepath.Join(s.admin.uploadsDir(), name)
		ret = "/images/uploads/" + name

	case "avatar":
		// 友链 / 朋友面板头像：按域名存进 images/blogroll/，前端 glob 按名对上。
		// 存进 Astro 资产目录（不是 public/），构建时会压缩并生成响应式尺寸。
		domain := strings.ToLower(strings.TrimSpace(r.FormValue("name")))
		if !domainRe.MatchString(domain) {
			fail(w, http.StatusBadRequest, "头像上传要带域名（如 ruanyifeng.com），文件按它命名")
			return
		}
		if !imageExts[ext] {
			fail(w, http.StatusBadRequest, "头像只收 png / jpg / webp / gif / avif")
			return
		}
		// 同域名的旧头像（可能是别的扩展名）先清掉，glob 命中才唯一
		for old := range imageExts {
			if old != ext {
				os.Remove(filepath.Join(s.admin.blogAvatarsDir(), domain+old))
			}
		}
		dst = filepath.Join(s.admin.blogAvatarsDir(), domain+ext)
		ret = "images/blogroll/" + domain + ext

	case "project":
		// 项目卡配图：按仓库名（小写、只留 a-z0-9-）存进 images/projects/，
		// 和友链头像同一套按名 glob 的路子，也走 Astro 资产管线做构建期压缩
		name := nameSan.ReplaceAllString(strings.ToLower(strings.TrimSpace(r.FormValue("name"))), "-")
		name = strings.Trim(name, "-")
		if name == "" {
			fail(w, http.StatusBadRequest, "项目配图上传要带仓库名")
			return
		}
		if !imageExts[ext] {
			fail(w, http.StatusBadRequest, "配图只收 png / jpg / webp / gif / avif")
			return
		}
		for old := range imageExts {
			if old != ext {
				os.Remove(filepath.Join(s.admin.projectThumbsDir(), name+old))
			}
		}
		dst = filepath.Join(s.admin.projectThumbsDir(), name+ext)
		ret = "images/projects/" + name + ext

	case "site":
		// 站点级图片：博主头像 / 首页画卡 / 三张快照，名字只认白名单里那几个
		name := strings.ToLower(strings.TrimSpace(r.FormValue("name")))
		if !siteImageNames[name] {
			fail(w, http.StatusBadRequest, "name 只能是 avatar / art / snapshot-1 / snapshot-2 / snapshot-3")
			return
		}
		if !imageExts[ext] {
			fail(w, http.StatusBadRequest, "图片只收 png / jpg / webp / gif / avif")
			return
		}
		for old := range imageExts {
			if old != ext {
				os.Remove(filepath.Join(s.admin.siteImagesDir(), name+old))
			}
		}
		dst = filepath.Join(s.admin.siteImagesDir(), name+ext)
		ret = "images/site/" + name + ext

	case "favicon":
		// 站标：SVG 落 public/favicon.svg（矢量主用，任意尺寸都利）；
		// PNG 则同一份内容写 favicon-32.png 与 apple-touch-icon.png 两个位置
		//（浏览器自会缩放，建议方形 ≥180px）。public/ 原样进产物，文件名固定
		pub := filepath.Join(s.admin.blogDir, "public")
		switch ext {
		case ".svg":
			dst = filepath.Join(pub, "favicon.svg")
			ret = "/favicon.svg"
		case ".png":
			if err := os.WriteFile(filepath.Join(pub, "apple-touch-icon.png"), data, 0o644); err != nil {
				fail(w, http.StatusInternalServerError, "写入失败: "+err.Error())
				return
			}
			dst = filepath.Join(pub, "favicon-32.png")
			ret = "/favicon-32.png"
		default:
			fail(w, http.StatusBadRequest, "站标只收 svg 或 png（建议方形，png 边长 ≥180）")
			return
		}

	case "music":
		if !musicExts[ext] {
			fail(w, http.StatusBadRequest, "音乐只收 mp3 / m4a / ogg / flac / lrc")
			return
		}
		base := strings.TrimSuffix(filepath.Base(hdr.Filename), filepath.Ext(hdr.Filename))
		base = nameSan.ReplaceAllString(strings.ToLower(base), "-")
		base = strings.Trim(base, "-")
		if base == "" {
			base = randomToken()[:8]
		}
		dst = filepath.Join(s.admin.musicDir(), base+ext)
		ret = "/music/" + base + ext

	default:
		fail(w, http.StatusBadRequest, "kind 只能是 cover / image / avatar / project / site / favicon / music")
		return
	}

	// 插图按内容命名：已存在就是同一张图，直接复用（封面/头像/音乐按名覆盖，照常写）
	if kind == "image" {
		if _, err := os.Stat(dst); err == nil {
			writeJSON(w, http.StatusOK, map[string]string{"path": ret, "reused": "true"})
			return
		}
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		fail(w, http.StatusInternalServerError, "写入失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": ret})
}

// ---- 概览 ----

type slugCount struct {
	Slug  string `json:"slug"`
	Count int    `json:"count"`
}

func (s *server) topCounts(table string) []slugCount {
	rows, err := s.db.Query(
		`SELECT slug, COUNT(*) AS n FROM ` + table + ` WHERE slug != 'site' GROUP BY slug ORDER BY n DESC LIMIT 5`,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []slugCount
	for rows.Next() {
		var sc slugCount
		if rows.Scan(&sc.Slug, &sc.Count) == nil {
			out = append(out, sc)
		}
	}
	return out
}

func (s *server) adminSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}
	posts, drafts := 0, 0
	if entries, err := os.ReadDir(s.admin.postsDir()); err == nil {
		for _, e := range entries {
			ext := filepath.Ext(e.Name())
			if e.IsDir() || (ext != ".md" && ext != ".mdx") {
				continue
			}
			raw, err := os.ReadFile(filepath.Join(s.admin.postsDir(), e.Name()))
			if err != nil {
				continue
			}
			if meta, _, err := parsePost(raw); err == nil {
				posts++
				if meta.Draft {
					drafts++
				}
			}
		}
	}

	var siteLikes, postLikes, views int
	s.db.QueryRow(`SELECT COUNT(*) FROM likes WHERE slug = 'site'`).Scan(&siteLikes)
	s.db.QueryRow(`SELECT COUNT(*) FROM likes WHERE slug != 'site'`).Scan(&postLikes)
	s.db.QueryRow(`SELECT COUNT(*) FROM views`).Scan(&views)

	writeJSON(w, http.StatusOK, map[string]any{
		"posts":     posts,
		"drafts":    drafts,
		"siteLikes": siteLikes,
		"postLikes": postLikes,
		"views":     views,
		"topViews":  s.topCounts("views"),
		"topLikes":  s.topCounts("likes"),
		"buildCmd":  s.admin.buildCmd != "",
	})
}

// ---- 统计 ----

// adminStats：管理台「统计」页的数据源 —— 近 30 天逐日 阅读/访客/点赞、总量、在线人数。
// views 表本来就存着 (slug, visitor, day)，这里只是把躺着的数据聚成曲线，不新增任何采集。
func (s *server) adminStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}

	const days = 30
	now := time.Now().UTC()
	since := now.AddDate(0, 0, -(days - 1)).Format("2006-01-02")

	type dayStat struct {
		Day      string `json:"day"`
		Views    int    `json:"views"`
		Visitors int    `json:"visitors"`
		Likes    int    `json:"likes"`
	}
	// 先铺满 30 天的零值序列，再往里填 —— 没访问的日子在图上也要占位
	byDay := map[string]*dayStat{}
	series := make([]*dayStat, 0, days)
	for i := 0; i < days; i++ {
		d := now.AddDate(0, 0, -(days - 1 - i)).Format("2006-01-02")
		st := &dayStat{Day: d}
		byDay[d] = st
		series = append(series, st)
	}

	// 查询失败宁可整页报错，也不端出一版全 0 的「假数据」—— 排查故障时
	// 「数据清零」和「查不到数据」是两个完全不同的方向，不能混为一谈
	rows, err := s.db.Query(
		`SELECT day, COUNT(*), COUNT(DISTINCT visitor) FROM views WHERE day >= ? GROUP BY day`,
		since,
	)
	if err != nil {
		fail(w, http.StatusInternalServerError, "统计查询失败")
		return
	}
	for rows.Next() {
		var d string
		var v, u int
		if rows.Scan(&d, &v, &u) == nil {
			if st := byDay[d]; st != nil {
				st.Views, st.Visitors = v, u
			}
		}
	}
	rows.Close()

	// likes 的 created 是 'YYYY-MM-DD HH:MM:SS'，字符串比较对日期前缀成立
	rows, err = s.db.Query(
		`SELECT substr(created, 1, 10) AS d, COUNT(*) FROM likes WHERE created >= ? GROUP BY d`,
		since,
	)
	if err != nil {
		fail(w, http.StatusInternalServerError, "统计查询失败")
		return
	}
	for rows.Next() {
		var d string
		var n int
		if rows.Scan(&d, &n) == nil {
			if st := byDay[d]; st != nil {
				st.Likes = n
			}
		}
	}
	rows.Close()

	// 总量：views 一趟扫描出两个数；likes 用 COUNT+FILTER 一趟分出站赞/文章赞
	//（不用 SUM(CASE…)：空表时 SUM 出 NULL 会 Scan 报错，COUNT 恒出 0）
	var totalViews, totalVisitors, siteLikes, postLikes int
	if err := s.db.QueryRow(
		`SELECT COUNT(*), COUNT(DISTINCT visitor) FROM views`,
	).Scan(&totalViews, &totalVisitors); err != nil {
		fail(w, http.StatusInternalServerError, "统计查询失败")
		return
	}
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FILTER (WHERE slug = 'site'), COUNT(*) FILTER (WHERE slug != 'site') FROM likes`,
	).Scan(&siteLikes, &postLikes); err != nil {
		fail(w, http.StatusInternalServerError, "统计查询失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"online": s.presence.count(),
		"days":   series,
		"totals": map[string]int{
			"views": totalViews, "visitors": totalVisitors,
			"siteLikes": siteLikes, "postLikes": postLikes,
		},
	})
}

// ---- 构建 ----

func (s *server) adminBuild(w http.ResponseWriter, r *http.Request) {
	a := s.admin
	switch r.Method {
	case http.MethodGet:
		a.buildMu.Lock()
		resp := map[string]any{"running": a.building, "last": a.lastBuild}
		a.buildMu.Unlock()
		writeJSON(w, http.StatusOK, resp)

	case http.MethodPost:
		if a.buildCmd == "" {
			fail(w, http.StatusNotImplemented, "没配 -build-cmd：本地开发用 astro dev 会自动热更新，不需要构建")
			return
		}
		a.buildMu.Lock()
		if a.building {
			a.buildMu.Unlock()
			fail(w, http.StatusConflict, "已经在构建了")
			return
		}
		a.building = true
		a.buildMu.Unlock()

		go func() {
			start := time.Now()
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
			defer cancel()
			var cmd *exec.Cmd
			if runtime.GOOS == "windows" {
				cmd = exec.CommandContext(ctx, "cmd", "/c", a.buildCmd)
			} else {
				cmd = exec.CommandContext(ctx, "sh", "-c", a.buildCmd)
			}
			cmd.Dir = a.blogDir
			// 超时要杀整棵进程树（proc_*.go），并给 Wait 一个收尾期限：否则残留的
			// node 握着输出管道，CombinedOutput 永不返回，building 从此卡在 true，
			// 之后每次点构建都是 409「已经在构建了」，只能重启进程救
			killTree(cmd)
			cmd.WaitDelay = 10 * time.Second
			out, err := cmd.CombinedOutput()
			tail := string(out)
			if len(tail) > 4000 {
				tail = "…" + tail[len(tail)-4000:]
			}
			a.buildMu.Lock()
			a.building = false
			a.lastBuild = &buildResult{
				OK:         err == nil,
				Output:     tail,
				FinishedAt: time.Now().Format(time.RFC3339),
				Took:       time.Since(start).Round(time.Second).String(),
			}
			a.buildMu.Unlock()

			// 全站模式下构建成功 → 热替换静态缓存，新产物立即上线，不用重启进程
			if err == nil && s.static != nil {
				if rerr := s.static.Reload(); rerr != nil {
					log.Printf("static reload failed: %v", rerr)
				}
			}
		}()
		writeJSON(w, http.StatusAccepted, map[string]bool{"started": true})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / POST")
	}
}
