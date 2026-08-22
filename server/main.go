// 炉火录的动态数据服务 —— 点赞与阅读计数。
//
// 站点本体是纯静态（Astro 构建产物），这个服务只管两件访客产生的数据：
//   - 点赞：每 (slug, visitor) 一票，可点可取消；visitor 是浏览器端生成的匿名随机 id
//   - 阅读：每 (slug, visitor, 日) 记一次，同一人同一天重复打开不加数
//
// 有意不存的东西：IP、UA、来路 —— 关于页「细则」承诺过不做画像，
// 限流用的 IP 只进内存不落库，进程一重启就没了。
//
// 单二进制 + SQLite 单文件（modernc.org/sqlite 纯 Go 实现，交叉编译不需要 CGO），
// 2 核 2G 的小机子跑这个绰绰有余。部署见同目录 README。
package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// ---- 输入校验 ----
// slug 是文章文件名或 "site"（全站点赞）；visitor 是 crypto.randomUUID() 或退化值 "anon"
var (
	slugRe    = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	visitorRe = regexp.MustCompile(`^[A-Za-z0-9-]{4,64}$`)
)

type server struct {
	db     *sql.DB
	origin string

	// 管理后台（admin.go）；-admin-pass 不设则为 nil，整组接口不注册
	admin *adminState

	// GitHub 数据代理的服务端缓存（github.go）
	github *ghCache

	// 写操作限流：每 IP 每天最多 maxWrites 次，只在内存里记
	mu        sync.Mutex
	writeDay  string
	writes    map[string]int
	maxWrites int
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "监听地址（生产上放在 Caddy/Nginx 反代之后）")
	dbPath := flag.String("db", "hearth.db", "SQLite 数据库文件路径")
	origin := flag.String("origin", "*", "CORS 允许的来源，如 https://example.com；* 表示不限")
	maxWrites := flag.Int("max-writes", 200, "每个 IP 每天允许的写操作次数")
	adminPass := flag.String("admin-pass", os.Getenv("ADMIN_PASSWORD"), "管理后台口令；不设则管理接口整组关闭")
	blogDir := flag.String("blog-dir", "..", "博客仓库根目录（管理接口读写文章与数据文件）")
	buildCmd := flag.String("build-cmd", os.Getenv("BLOG_BUILD_CMD"), "可选：重新构建站点的命令（如 pnpm build），/api/admin/build 用")
	flag.Parse()

	db, err := sql.Open("sqlite", *dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		log.Fatalf("打开数据库失败: %v", err)
	}
	// modernc/sqlite 单连接最稳：博客体量下没有并发写的必要
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS likes (
			slug    TEXT NOT NULL,
			visitor TEXT NOT NULL,
			created TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (slug, visitor)
		);
		CREATE TABLE IF NOT EXISTS views (
			slug    TEXT NOT NULL,
			visitor TEXT NOT NULL,
			day     TEXT NOT NULL,
			PRIMARY KEY (slug, visitor, day)
		);
	`); err != nil {
		log.Fatalf("建表失败: %v", err)
	}

	s := &server{
		db:        db,
		origin:    *origin,
		writes:    map[string]int{},
		maxWrites: *maxWrites,
		github:    newGhCache(os.Getenv("GITHUB_TOKEN")),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/likes", s.cors(s.handleLikes))
	mux.HandleFunc("/api/views", s.cors(s.handleViews))
	mux.HandleFunc("/api/github", s.cors(s.handleGithub))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})

	// 管理后台（admin.go）：不设口令就完全不注册，对外零暴露
	if *adminPass != "" {
		abs, err := filepath.Abs(*blogDir)
		if err != nil {
			log.Fatalf("解析 -blog-dir 失败: %v", err)
		}
		if _, err := os.Stat(filepath.Join(abs, "src", "content", "posts")); err != nil {
			log.Fatalf("-blog-dir 不像博客仓库（找不到 src/content/posts）: %s", abs)
		}
		s.admin = &adminState{
			pass:     *adminPass,
			blogDir:  abs,
			buildCmd: *buildCmd,
			sessions: map[string]time.Time{},
			tries:    map[string]int{},
		}
		registerAdminRoutes(mux, s)
		log.Printf("admin enabled (blog-dir=%s, build-cmd=%q)", abs, *buildCmd)
	}

	// Read 60s：管理后台要传封面/音乐（最大 30MB），10s 会掐断慢网上传
	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("listening on %s (db=%s origin=%s)", *addr, *dbPath, *origin)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop
	log.Println("shutting down")
	httpServer.Close()
	db.Close()
}

// ---- HTTP 基建 ----

func (s *server) cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// clientIP 只用于内存限流，不写盘。信任反代补的头（部署要求见 README）。
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if rip := r.Header.Get("X-Real-Ip"); rip != "" {
		return rip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// allowWrite 做每 IP 每天的写限流；跨天时整表清零
func (s *server) allowWrite(r *http.Request) bool {
	day := time.Now().UTC().Format("2006-01-02")
	ip := clientIP(r)

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.writeDay != day {
		s.writeDay = day
		s.writes = map[string]int{}
	}
	if s.writes[ip] >= s.maxWrites {
		return false
	}
	s.writes[ip]++
	return true
}

type writeBody struct {
	Slug    string `json:"slug"`
	Visitor string `json:"visitor"`
	Action  string `json:"action"`
}

// readBody 解析并校验 POST 体；出错时已写响应，调用方直接 return
func readBody(w http.ResponseWriter, r *http.Request) (writeBody, bool) {
	var b writeBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&b); err != nil {
		fail(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return b, false
	}
	if !slugRe.MatchString(b.Slug) {
		fail(w, http.StatusBadRequest, "slug 不合法")
		return b, false
	}
	if !visitorRe.MatchString(b.Visitor) {
		fail(w, http.StatusBadRequest, "visitor 不合法")
		return b, false
	}
	return b, true
}

// ---- 点赞 ----

func (s *server) likeState(slug, visitor string) (count int, liked bool, err error) {
	if err = s.db.QueryRow(`SELECT COUNT(*) FROM likes WHERE slug = ?`, slug).Scan(&count); err != nil {
		return
	}
	if visitor != "" {
		var n int
		if err = s.db.QueryRow(
			`SELECT COUNT(*) FROM likes WHERE slug = ? AND visitor = ?`, slug, visitor,
		).Scan(&n); err != nil {
			return
		}
		liked = n > 0
	}
	return
}

func (s *server) handleLikes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		slug := r.URL.Query().Get("slug")
		if !slugRe.MatchString(slug) {
			fail(w, http.StatusBadRequest, "slug 不合法")
			return
		}
		visitor := r.URL.Query().Get("visitor")
		if visitor != "" && !visitorRe.MatchString(visitor) {
			visitor = ""
		}
		count, liked, err := s.likeState(slug, visitor)
		if err != nil {
			fail(w, http.StatusInternalServerError, "查询失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"count": count, "liked": liked})

	case http.MethodPost:
		if !s.allowWrite(r) {
			fail(w, http.StatusTooManyRequests, "今天点得够多啦")
			return
		}
		b, ok := readBody(w, r)
		if !ok {
			return
		}
		var err error
		switch b.Action {
		case "like":
			_, err = s.db.Exec(
				`INSERT INTO likes (slug, visitor) VALUES (?, ?) ON CONFLICT DO NOTHING`,
				b.Slug, b.Visitor,
			)
		case "unlike":
			_, err = s.db.Exec(`DELETE FROM likes WHERE slug = ? AND visitor = ?`, b.Slug, b.Visitor)
		default:
			fail(w, http.StatusBadRequest, "action 只能是 like 或 unlike")
			return
		}
		if err != nil {
			fail(w, http.StatusInternalServerError, "写入失败")
			return
		}
		count, liked, err := s.likeState(b.Slug, b.Visitor)
		if err != nil {
			fail(w, http.StatusInternalServerError, "查询失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"count": count, "liked": liked})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / POST")
	}
}

// ---- 阅读计数 ----

func (s *server) viewCount(slug string) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM views WHERE slug = ?`, slug).Scan(&n)
	return n, err
}

func (s *server) handleViews(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		slug := r.URL.Query().Get("slug")
		if !slugRe.MatchString(slug) {
			fail(w, http.StatusBadRequest, "slug 不合法")
			return
		}
		n, err := s.viewCount(slug)
		if err != nil {
			fail(w, http.StatusInternalServerError, "查询失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"count": n})

	case http.MethodPost:
		if !s.allowWrite(r) {
			fail(w, http.StatusTooManyRequests, "太频繁了")
			return
		}
		b, ok := readBody(w, r)
		if !ok {
			return
		}
		day := time.Now().UTC().Format("2006-01-02")
		if _, err := s.db.Exec(
			`INSERT INTO views (slug, visitor, day) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
			b.Slug, b.Visitor, day,
		); err != nil {
			fail(w, http.StatusInternalServerError, "写入失败")
			return
		}
		n, err := s.viewCount(b.Slug)
		if err != nil {
			fail(w, http.StatusInternalServerError, "查询失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"count": n})

	default:
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / POST")
	}
}
