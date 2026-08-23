// 静态站点托管 —— 让这台 2 核 2G 的小机子把整个博客扛起来，不只是数字接口。
//
// 设计围绕两个事实：
//  1. 带宽只有 1M（约 128KB/s）：字节数就是加载速度。所以文本资产在启动时
//     预压成 brotli/gzip 常驻内存（首页 HTML 125KB → br 后 ~15KB），压缩比
//     用最高档 —— 反正只压一次，访客拿到的都是现成字节。
//  2. 内存有 2G：除音乐外的整站产物（~5MB）全部进内存，响应零磁盘 IO。
//     超过 memLimit 的大文件（音乐）走磁盘流式，http.ServeContent 自带
//     Range 支持，播放器拖进度条才不用整首下完。
//
// 缓存策略按路径分层：_astro/ 带内容哈希 → immutable 一年；HTML 走协商缓存
// （no-cache + ETag，改版立即生效、没改就 304 零字节）；音乐一周；其余一小时。
// 管理台触发的构建完成后调 Reload() 热替换，不用重启进程。
//
// 和站点同源部署（PUBLIC_API_BASE=/）还有个隐性提速：/api/* 不再跨域，
// 浏览器不发 CORS 预检（每次写操作省一个往返），也不用再开第二条 TLS 连接。
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/andybalholm/brotli"
)

const (
	staticMemLimit    = 1 << 20          // 超过 1MB 不进内存（音乐/大图），走磁盘流式
	staticCompressMin = 256              // 太小的文件压了反而大，不压
	staticWriteWindow = 30 * time.Second // 两次写之间的最长间隔（见 progressWriter）
)

// staticMime：不依赖系统 MIME 表（Windows 注册表和精简版 Linux 都不可靠），
// 站里会出现的类型全部自己列。列表外的退回 application/octet-stream。
var staticMime = map[string]string{
	".html":        "text/html; charset=utf-8",
	".css":         "text/css; charset=utf-8",
	".js":          "text/javascript; charset=utf-8",
	".mjs":         "text/javascript; charset=utf-8",
	".json":        "application/json; charset=utf-8",
	".svg":         "image/svg+xml",
	".xml":         "application/xml; charset=utf-8",
	".txt":         "text/plain; charset=utf-8",
	".lrc":         "text/plain; charset=utf-8",
	".map":         "application/json; charset=utf-8",
	".png":         "image/png",
	".webp":        "image/webp",
	".avif":        "image/avif",
	".jpg":         "image/jpeg",
	".jpeg":        "image/jpeg",
	".gif":         "image/gif",
	".ico":         "image/x-icon",
	".woff2":       "font/woff2",
	".woff":        "font/woff",
	".mp3":         "audio/mpeg",
	".m4a":         "audio/mp4",
	".flac":        "audio/flac",
	".ogg":         "audio/ogg",
	".wasm":        "application/wasm",
	".webmanifest": "application/manifest+json",
}

// 值得压缩的扩展名（图片/字体/音频自身已压缩，再压白费 CPU）
var staticCompressible = map[string]bool{
	".html": true, ".css": true, ".js": true, ".mjs": true, ".json": true,
	".svg": true, ".xml": true, ".txt": true, ".lrc": true, ".map": true,
	".webmanifest": true,
}

type staticFile struct {
	disk      string // 磁盘绝对路径（大文件流式打开用）
	mimeType  string
	modTime   time.Time
	raw       []byte // nil = 不在内存，走磁盘
	br, gz    []byte // 预压副本；只有压得动的文本才有
	etag      string // 形如 `"a1b2…"`，内容哈希；磁盘文件为空（靠 Last-Modified）
	cache     string // Cache-Control 值
	html      bool   // HTML 页面：附加 Referrer-Policy
	adminPage bool   // /admin 下的页面：附加 X-Frame-Options 拒绝内嵌
}

type staticSite struct {
	dir string

	mu       sync.RWMutex
	files    map[string]*staticFile
	notFound *staticFile // 404.html（Astro 加了 404 页就自动启用），可为 nil
}

// cacheFor 按路径与类型分层下发缓存策略。
func cacheFor(rel, ext string) string {
	switch {
	case strings.HasPrefix(rel, "_astro/"):
		// 文件名带内容哈希，改内容就换名 —— 回访者一个字节都不用重拉
		return "public, max-age=31536000, immutable"
	case strings.HasPrefix(rel, "music/"):
		// 音乐是带宽大户且极少变：一周。换歌通常连文件名一起换
		return "public, max-age=604800"
	case strings.HasPrefix(rel, "pagefind/"):
		// pagefind.js 名字固定、索引分片带哈希：折中给一小时
		return "public, max-age=3600"
	case ext == ".html":
		// 协商缓存：内容常变，但没变时 304 零字节
		return "no-cache"
	case ext == ".xml" || ext == ".json" || ext == ".txt":
		// rss / sitemap：阅读器会轮询，给一小时挡住高频回源
		return "public, max-age=3600"
	default:
		// favicon / og 图 / 顶层图片：一天
		return "public, max-age=86400"
	}
}

// newStaticSite 全量加载一次；后续用 Reload() 热替换。
func newStaticSite(dir string) (*staticSite, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	st := &staticSite{dir: abs}
	if err := st.Reload(); err != nil {
		return nil, err
	}
	return st, nil
}

// Reload 重新扫描产物目录并原子替换内存缓存（构建完成后调用）。
func (st *staticSite) Reload() error {
	start := time.Now()

	// 先收集文件清单，再并行加载压缩 —— brotli 最高档很慢，2 个核都用上
	type job struct {
		rel  string
		disk string
		info fs.FileInfo
	}
	var jobs []job
	err := filepath.WalkDir(st.dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		rel := filepath.ToSlash(strings.TrimPrefix(p, st.dir))
		rel = strings.TrimPrefix(rel, "/")
		jobs = append(jobs, job{rel: rel, disk: p, info: info})
		return nil
	})
	if err != nil {
		return err
	}

	files := make(map[string]*staticFile, len(jobs))
	var mu sync.Mutex
	var memBytes, brBytes int

	sem := make(chan struct{}, max(2, runtime.NumCPU()))
	var wg sync.WaitGroup
	for _, j := range jobs {
		wg.Add(1)
		sem <- struct{}{}
		go func(j job) {
			defer func() { <-sem; wg.Done() }()

			ext := strings.ToLower(filepath.Ext(j.rel))
			mt, ok := staticMime[ext]
			if !ok {
				mt = "application/octet-stream"
			}
			if j.rel == "rss.xml" {
				mt = "application/rss+xml; charset=utf-8"
			}
			f := &staticFile{
				disk:      j.disk,
				mimeType:  mt,
				modTime:   j.info.ModTime(),
				cache:     cacheFor(j.rel, ext),
				html:      ext == ".html",
				adminPage: strings.HasPrefix(j.rel, "admin/"),
			}

			if j.info.Size() <= staticMemLimit {
				raw, err := os.ReadFile(j.disk)
				if err == nil {
					f.raw = raw
					sum := sha256.Sum256(raw)
					f.etag = `"` + hex.EncodeToString(sum[:12]) + `"`

					if staticCompressible[ext] && len(raw) >= staticCompressMin {
						var bb bytes.Buffer
						bw := brotli.NewWriterLevel(&bb, brotli.BestCompression)
						if _, err := bw.Write(raw); err == nil && bw.Close() == nil &&
							bb.Len() < len(raw)*9/10 {
							f.br = bytes.Clone(bb.Bytes())
						}
						var gb bytes.Buffer
						gw, _ := gzip.NewWriterLevel(&gb, gzip.BestCompression)
						if _, err := gw.Write(raw); err == nil && gw.Close() == nil &&
							gb.Len() < len(raw)*9/10 {
							f.gz = bytes.Clone(gb.Bytes())
						}
					}
				}
			}

			mu.Lock()
			files[j.rel] = f
			memBytes += len(f.raw)
			brBytes += len(f.br)
			mu.Unlock()
		}(j)
	}
	wg.Wait()

	st.mu.Lock()
	st.files = files
	st.notFound = files["404.html"]
	st.mu.Unlock()

	log.Printf("static: %d 个文件，内存 %.1fMB（br 副本 %.1fMB），耗时 %s",
		len(files), float64(memBytes)/1e6, float64(brBytes)/1e6,
		time.Since(start).Round(time.Millisecond))
	return nil
}

// lookup 把 URL 路径解析成产物文件：/about → about/index.html，/posts/x → posts/x/index.html。
// 不做补斜杠重定向 —— 1M 带宽上省一个往返比 URL 规范化重要。
func (st *staticSite) lookup(urlPath string) (f, nf *staticFile) {
	key := strings.TrimPrefix(path.Clean(urlPath), "/")
	if key == "" || key == "." {
		key = "index.html"
	}
	st.mu.RLock()
	defer st.mu.RUnlock()
	if f = st.files[key]; f == nil {
		f = st.files[key+"/index.html"]
	}
	if f == nil {
		f = st.files[key+".html"]
	}
	return f, st.notFound
}

// progressWriter 把全局的「整个响应限时 30 秒」换成「两次写之间限时 30 秒」
// （nginx send_timeout 的语义）：每写出一块就把写截止时间往后续一个窗口。
// 全局 WriteTimeout 是按 API 体量定的，掐不下静态资产 —— 1M 上行满速传一首
// 4MB 的歌就要 ~31 秒，几个访客分带宽时连 1MB 内的大图都悬。换成按进度续期后
// 传输总时长不再设限，但连接只要停止取数据，仍会在一个窗口内被掐断。
type progressWriter struct {
	w  http.ResponseWriter
	rc *http.ResponseController
}

func (pw *progressWriter) Header() http.Header         { return pw.w.Header() }
func (pw *progressWriter) WriteHeader(code int)        { pw.w.WriteHeader(code) }
func (pw *progressWriter) Unwrap() http.ResponseWriter { return pw.w }

func (pw *progressWriter) Write(p []byte) (int, error) {
	// 续期失败（连接已被劫持等罕见情形）就退回全局 WriteTimeout，不致命
	pw.rc.SetWriteDeadline(time.Now().Add(staticWriteWindow))
	return pw.w.Write(p)
}

func (st *staticSite) serve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET / HEAD")
		return
	}

	f, notFound := st.lookup(r.URL.Path)
	if f == nil {
		w.Header().Set("Cache-Control", "no-cache")
		if notFound != nil {
			w.Header().Set("Content-Type", notFound.mimeType)
			w.WriteHeader(http.StatusNotFound)
			if r.Method != http.MethodHead {
				w.Write(notFound.raw)
			}
			return
		}
		http.Error(w, "404 页面不存在", http.StatusNotFound)
		return
	}

	h := w.Header()
	h.Set("Content-Type", f.mimeType)
	h.Set("Cache-Control", f.cache)
	h.Set("X-Content-Type-Options", "nosniff")
	if f.html {
		// 出站 referrer 只带来源不带路径；管理台页面拒绝被 iframe 内嵌 ——
		// token 在 localStorage 拿不走，但 UI 覆盖诱点（点击劫持）也要断掉
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		if f.adminPage {
			h.Set("X-Frame-Options", "DENY")
		}
	}

	// 正文一律经 progressWriter 发：写截止时间按进度续期，慢网大文件才传得完
	pw := &progressWriter{w: w, rc: http.NewResponseController(w)}

	// 大文件：磁盘流式，ServeContent 处理 Range（音乐拖进度条）与 If-Modified-Since
	if f.raw == nil {
		file, err := os.Open(f.disk)
		if err != nil {
			fail(w, http.StatusInternalServerError, "文件读取失败")
			return
		}
		defer file.Close()
		http.ServeContent(pw, r, "", f.modTime, file)
		return
	}

	// 内存文件：按 Accept-Encoding 发预压副本。ETag 按编码分身
	//（RFC 9110：ETag 属于「表示」，同一资源不同编码不能共用一个）
	body, enc := f.raw, ""
	if ae := r.Header.Get("Accept-Encoding"); ae != "" {
		if f.br != nil && strings.Contains(ae, "br") {
			body, enc = f.br, "br"
		} else if f.gz != nil && strings.Contains(ae, "gzip") {
			body, enc = f.gz, "gzip"
		}
	}
	if f.br != nil || f.gz != nil {
		h.Add("Vary", "Accept-Encoding")
	}
	if f.etag != "" {
		etag := f.etag
		if enc != "" {
			etag = etag[:len(etag)-1] + "-" + enc + `"`
		}
		h.Set("ETag", etag)
	}
	if enc != "" {
		h.Set("Content-Encoding", enc)
	}
	// ServeContent 负责 If-None-Match → 304、Range、HEAD；名字传空 —— 类型已显式设置
	http.ServeContent(pw, r, "", f.modTime, bytes.NewReader(body))
}

// ---- 音乐目录供给（-music）----
//
// 音乐是版权物，不进 git 仓库 —— 文件躺在服务器的一个目录里，由这里在
// /music/* 供给。分体部署（页面在平台 CDN、产物里没有音乐）时前端把
// PUBLIC_MUSIC_BASE 指到本服务即可。跨域取歌靠外层 cors 包装发放行头：
// <audio crossorigin> 的频谱采样和歌词 fetch 都要它。
//
// 目录是平的（不收子目录）：只取 URL 的最后一段当文件名，路径穿越天然无从谈起；
// 再拒掉含 \ 与 .. 的名字 —— Windows 上 filepath.Join 会把反斜杠当分隔符。
func musicHandler(dir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			fail(w, http.StatusMethodNotAllowed, "只支持 GET / HEAD")
			return
		}
		name := path.Base(path.Clean(r.URL.Path))
		if name == "." || name == "/" || name == "music" ||
			strings.Contains(name, "\\") || strings.Contains(name, "..") {
			http.Error(w, "404 没有这首歌", http.StatusNotFound)
			return
		}

		file, err := os.Open(filepath.Join(dir, name))
		if err != nil {
			http.Error(w, "404 没有这首歌", http.StatusNotFound)
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || info.IsDir() {
			http.Error(w, "404 没有这首歌", http.StatusNotFound)
			return
		}

		h := w.Header()
		if mt, ok := staticMime[strings.ToLower(filepath.Ext(name))]; ok {
			h.Set("Content-Type", mt)
		}
		h.Set("Cache-Control", "public, max-age=604800")
		h.Set("X-Content-Type-Options", "nosniff")

		// Range（拖进度条）由 ServeContent 处理；progressWriter 让慢网传大文件
		// 不被全局 WriteTimeout 掐断（语义见上）
		pw := &progressWriter{w: w, rc: http.NewResponseController(w)}
		http.ServeContent(pw, r, "", info.ModTime(), file)
	}
}
