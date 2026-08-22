// 管理后台的写接口 —— 网页端 /admin 的后端。
//
// 设计取向：博客本体是纯静态 + git 是唯一事实源，所以这里不建内容数据库，
// 所有「改内容」都落成仓库里的文件：
//   - 文章        → src/content/posts/<slug>.md（YAML front-matter + 正文）
//   - 站点数据    → src/data/<name>.json（站点文案 / 关于页 / 项目 / 友链 / 播放列表等）
//   - 上传        → 封面进 src/content/posts/_covers/，插图进 public/images/uploads/（内容寻址去重），
//                   友链头像按域名进 images/blogroll/，项目配图按仓库名进 images/projects/，
//                   音乐进 public/music/
//
// dev 模式下 astro dev 监听这些文件，保存即热更新；部署后改完要重新构建
// （/api/admin/build 可配一条构建命令，没配就提示手动构建）。
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
	pass     string // 登录口令
	blogDir  string // 仓库根目录（绝对路径）
	buildCmd string // 可选：重新构建站点的命令

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
func (a *adminState) musicDir() string { return filepath.Join(a.blogDir, "public", "music") }

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
	minItems int    // 组件会取 [0] 的集合不许清空（repos Featured 卡、播放器）
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
	mux.HandleFunc("/api/admin/login", s.cors(s.adminLogin))
	mux.HandleFunc("/api/admin/summary", s.cors(s.adminAuth(s.adminSummary)))
	mux.HandleFunc("/api/admin/posts", s.cors(s.adminAuth(s.adminPostList)))
	mux.HandleFunc("/api/admin/posts/{slug}", s.cors(s.adminAuth(s.adminPost)))
	mux.HandleFunc("/api/admin/data/{name}", s.cors(s.adminAuth(s.adminData)))
	mux.HandleFunc("/api/admin/upload", s.cors(s.adminAuth(s.adminUpload)))
	mux.HandleFunc("/api/admin/build", s.cors(s.adminAuth(s.adminBuild)))
}

// ---- 鉴权 ----

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // 系统熵源坏了没有降级余地
	}
	return hex.EncodeToString(b)
}

func (s *server) adminLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "只支持 POST")
		return
	}
	a := s.admin

	// 口令尝试限流：每 IP 每天 20 次，跨天清零（和点赞限流同款、但更紧）
	day := time.Now().UTC().Format("2006-01-02")
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

func (s *server) adminData(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	spec, ok := dataFiles[name]
	if !ok {
		fail(w, http.StatusNotFound, "没有这种数据")
		return
	}
	path := filepath.Join(s.admin.dataDir(), name+".json")

	switch r.Method {
	case http.MethodGet:
		raw, err := os.ReadFile(path)
		if err != nil {
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
			if len(list) < spec.minItems {
				fail(w, http.StatusBadRequest, fmt.Sprintf("至少要保留 %d 条（页面组件会取第一条）", spec.minItems))
				return
			}
		case "object":
			if _, ok := v.(map[string]any); !ok {
				fail(w, http.StatusBadRequest, "这份数据应该是对象")
				return
			}
		}
		// json.Indent 保留客户端的键序 —— 重新 Unmarshal/Marshal 会把键排成字典序，git diff 会乱
		var out bytes.Buffer
		if err := json.Indent(&out, raw, "", "  "); err != nil {
			fail(w, http.StatusBadRequest, "格式化失败")
			return
		}
		out.WriteByte('\n')
		if err := os.WriteFile(path, out.Bytes(), 0o644); err != nil {
			fail(w, http.StatusInternalServerError, "写入失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / PUT")
	}
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
		fail(w, http.StatusBadRequest, "kind 只能是 cover / image / avatar / project / site / music")
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
		}()
		writeJSON(w, http.StatusAccepted, map[string]bool{"started": true})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / POST")
	}
}
