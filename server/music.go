// 在线找歌 —— 管理台「正在听」页签的音源接入。
//
// 定位：站长「策展」工具，不是对访客开放的点歌服务。整组接口都在管理鉴权
// 后面（adminAuth），访客侧永远碰不到聚合 API。
//
// 为什么是「入库下载」而不是「播放时反代」：聚合 API 返回的直链是带时间戳的
// 签名 URL，几十分钟就过期 —— 存进歌单没几天就全是死链。所以选中即把 mp3 + lrc
// 下载成本地文件（落 -music 目录，和手传的歌同一个地方），播放器照旧只认本地
// /music/*，运行时零依赖任何音源；聚合 API 挂了 / 换域名都不影响已入库的歌。
// 频率限制也只在站长偶尔找歌时碰得到，访客每次播放都是本地文件。
//
// 音源（-music-api-kind）：
//   unified（默认）—— 用户自建的统一封装层（F:\practice\music-api，:9000）：
//     一套 REST 聚合了网易云(带全局解灰) / QQ / 咪咕 / 酷我 / 酷狗。取直链先按
//     指定源精确取，拿不到（VIP/独家）自动退到 /api/url/auto 多源轮询兜底 ——
//     周杰伦这类灰歌能靠解灰 / 同名版本拿到可播音频（可能是翻唱，matched 会带回来）。
//     全平台 VIP 独家母带仍拿不到，那是源头付费墙。
//   gdstudio —— GD 音乐台公共接口，零部署兜底（forker 没自建服务时用）。
//
// 换其它自建服务（Meting / 裸 NCM 等）时，若形状不同，仿 uni* / gd* 再加一组
// 适配函数、在下面三个 src* 分派里加一支即可，上层 handler 不用动。
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// 出网取歌用的客户端：音源 API 与音频 CDN 共用。总超时给足（整曲下载慢网也要下得完）。
var musicClient = &http.Client{Timeout: 90 * time.Second}

const (
	// 部分 CDN 对空 UA 更敏感，统一带一个浏览器 UA
	musicUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
		"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	musicMaxBytes = 40 << 20 // 单曲下载上限（无损可能偏大，给到 40MB）
	// 完整曲的最低大小：低于此判为试听片段（VIP 未登录的预览多为 ~30s、几百 KB），
	// 一律不入库 ——「试听不要」。正常整曲最小也有约 2MB（2 分钟 128k），留足余量。
	musicMinFull = 1_500_000
	// 搜索每页条数。前端 data.astro 的 MS_PAGE 必须与此一致 ——
	// 「加载更多」按钮靠「本页满 musicPageSize 条 = 可能还有下一页」判断显隐。
	musicPageSize = 5
)

// 音源码白名单 —— 拼进出网 URL 前必过（别让 source 变成注入点）。统一层与 GD
// 两套的取值并集；具体哪个可搜/可用由上游决定，不可用时取直链会得到空 url。
var musicSources = map[string]bool{
	"netease": true, "ncm": true, "wy": true,
	"qq": true, "tx": true, "tencent": true,
	"migu": true, "mg": true,
	"kw": true, "kuwo": true, "kg": true, "kugou": true,
	"joox": true,
}

// 歌曲 id：网易/咪咕是数字串，QQ 是 songmid（字母数字），够用且挡住注入
var musicIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// 文件名里要剔除的字符：路径分隔符 / 各系统非法字符 / 控制字符。
// 中文、空格、连字符都保留 —— 与手传入库的歌（如「富士山下.mp3」）同风格。
var fnameBadChars = regexp.MustCompile(`[/\\:*?"<>|\x00-\x1f]`)

// musicEnabled：配了音源基址、且没显式关掉，才启用在线找歌
func (a *adminState) musicEnabled() bool {
	return a.musicAPI != "" && a.musicAPI != "off"
}

func (a *adminState) musicKindIsGD() bool { return a.musicAPIKind == "gdstudio" }

// ---- 搜索 ----

type musicHit struct {
	Source string `json:"source"`
	ID     string `json:"id"`
	Title  string `json:"title"`
	Artist string `json:"artist"`
	Album  string `json:"album"`
	VIP    bool   `json:"vip,omitempty"` // 已知需付费（网易 fee=1）：前端标灰提示，多半取不到直链
}

func (s *server) adminMusicSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		fail(w, http.StatusMethodNotAllowed, "只支持 GET")
		return
	}
	if !s.admin.musicEnabled() {
		fail(w, http.StatusNotImplemented, "在线找歌未启用（没配 -music-api / MUSIC_API_BASE，或设成了 off）")
		return
	}
	source := r.URL.Query().Get("source")
	if source == "" {
		source = "netease"
	}
	if !musicSources[source] {
		fail(w, http.StatusBadRequest, "不认识的音源")
		return
	}
	kw := strings.TrimSpace(r.URL.Query().Get("kw"))
	if kw == "" {
		fail(w, http.StatusBadRequest, "搜什么呢？关键词不能为空")
		return
	}
	if len([]rune(kw)) > 80 {
		fail(w, http.StatusBadRequest, "关键词太长了")
		return
	}
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if n, e := strconv.Atoi(p); e == nil && n >= 1 && n <= 20 {
			page = n
		}
	}
	hits, err := s.admin.srcSearch(source, kw, page)
	if err != nil {
		fail(w, http.StatusBadGateway, "找歌失败："+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": hits})
}

// ---- 入库（解析直链 → 下载 → 落 -music）----

func (s *server) adminMusicFetch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "只支持 POST")
		return
	}
	if !s.admin.musicEnabled() {
		fail(w, http.StatusNotImplemented, "在线找歌未启用（没配 -music-api / MUSIC_API_BASE，或设成了 off）")
		return
	}
	var req struct {
		Source string `json:"source"`
		ID     string `json:"id"`
		Title  string `json:"title"`
		Artist string `json:"artist"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		fail(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	if !musicSources[req.Source] {
		fail(w, http.StatusBadRequest, "不认识的音源")
		return
	}
	req.ID = strings.TrimSpace(req.ID)
	if !musicIDRe.MatchString(req.ID) {
		fail(w, http.StatusBadRequest, "歌曲 id 不合法")
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Artist = strings.TrimSpace(req.Artist)
	if req.Title == "" {
		fail(w, http.StatusBadRequest, "缺曲名")
		return
	}

	// 解析 + 下载：只认「精确源」。拿到的若是试听片段（VIP 未登录常给 ~30s 预览）
	// 或空，一律不入库 —— 不做多源兜底：兜底会抓到同名翻唱冒充原曲（站长明确不要）。
	var audio []byte
	var ext string

	if u, e := s.admin.srcResolvePrimary(req.Source, req.ID); e == nil && u != "" {
		if d, x, trial, derr := grabFull(u); derr == nil && !trial {
			audio, ext = d, x
		}
	}
	if audio == nil {
		fail(w, http.StatusUnprocessableEntity,
			"这首拿不到完整音源（VIP / 独家只给试听，或无版权）—— 没有入库。"+
				"换首歌、换个音源；想要这首的正版整曲，给统一层配上你自己的登录 cookie。")
		return
	}

	// 落 -music 目录
	stem := musicFilename(req.Title, req.Artist)
	if err := os.MkdirAll(s.admin.musicDir(), 0o755); err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	audioName := stem + ext
	if err := os.WriteFile(filepath.Join(s.admin.musicDir(), audioName), audio, 0o644); err != nil {
		fail(w, http.StatusInternalServerError, "写入失败："+err.Error())
		return
	}
	track := map[string]string{
		"title":  req.Title,
		"artist": req.Artist,
		"src":    "/music/" + audioName,
	}

	// 3) 歌词尽力而为：拿到就写 .lrc，拿不到不报错（纯音乐 / 无词很常见）
	if lrc, lerr := s.admin.srcLyric(req.Source, req.ID); lerr == nil && strings.TrimSpace(lrc) != "" {
		lrcName := stem + ".lrc"
		if os.WriteFile(filepath.Join(s.admin.musicDir(), lrcName), []byte(lrc), 0o644) == nil {
			track["lrc"] = "/music/" + lrcName
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "track": track})
}

// downloadAudio 下载直链，返回内容与推断出的扩展名
func downloadAudio(rawURL string) (data []byte, ext string, err error) {
	u, perr := url.Parse(rawURL)
	if perr != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, "", errors.New("直链不是合法的 http(s) 地址")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	req.Header.Set("User-Agent", musicUA)
	resp, err := musicClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("音频源返回 HTTP %d", resp.StatusCode)
	}
	data, err = io.ReadAll(io.LimitReader(resp.Body, musicMaxBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) > musicMaxBytes {
		return nil, "", errors.New("音频超过大小上限，没有下载")
	}
	if len(data) < 1024 {
		return nil, "", errors.New("下回来的内容太小，不像音频（多半这档没有真实直链）")
	}
	return data, audioExt(u.Path, resp.Header.Get("Content-Type")), nil
}

// grabFull 下载一条直链并判定是否完整曲；trial=true 表示拿到了但偏小（疑似试听），
// 调用方据此丢弃转下一候选。下载出错时 err 非空（同样不采用）。
func grabFull(rawURL string) (data []byte, ext string, trial bool, err error) {
	data, ext, err = downloadAudio(rawURL)
	if err != nil {
		return nil, "", false, err
	}
	if len(data) < musicMinFull {
		return data, ext, true, nil
	}
	return data, ext, false, nil
}

// audioExt 从 URL 路径后缀或 Content-Type 推断音频扩展名，都认不出就当 mp3
func audioExt(urlPath, contentType string) string {
	if e := strings.ToLower(filepath.Ext(urlPath)); musicExts[e] && e != ".lrc" {
		return e
	}
	switch {
	case strings.Contains(contentType, "flac"):
		return ".flac"
	case strings.Contains(contentType, "mp4"), strings.Contains(contentType, "m4a"), strings.Contains(contentType, "aac"):
		return ".m4a"
	case strings.Contains(contentType, "ogg"):
		return ".ogg"
	case strings.Contains(contentType, "mpeg"), strings.Contains(contentType, "mp3"):
		return ".mp3"
	}
	return ".mp3"
}

// musicFilename 由歌手 + 曲名拼一个可读、文件系统安全的名字（不含扩展名）
func musicFilename(title, artist string) string {
	stem := title
	if artist != "" {
		stem = artist + " - " + title
	}
	stem = fnameBadChars.ReplaceAllString(stem, "")
	stem = strings.Join(strings.Fields(stem), " ") // 折叠连续空白
	stem = strings.Trim(stem, " .")                // 结尾的点 / 空格在 Windows 上不合法
	if r := []rune(stem); len(r) > 60 {
		stem = strings.TrimSpace(string(r[:60]))
	}
	if stem == "" {
		stem = "track-" + randomToken()[:8]
	}
	return stem
}

// anyToStr：音源里 id 有时是数字有时是字符串，统一成串
func anyToStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case json.Number:
		return x.String()
	default:
		return ""
	}
}

// ---- 音源分派：按 -music-api-kind 走统一层或 GD ----

func (a *adminState) srcSearch(source, kw string, page int) ([]musicHit, error) {
	if a.musicKindIsGD() {
		return gdSearch(a.musicAPI, source, kw, page)
	}
	return uniSearch(a.musicAPI, source, kw, page)
}

// srcResolvePrimary：按指定源精确取直链（unified 走 /api/url，GD 走 br 逐档）。
// 空串 = 该源没有直链（不算错误，交由上层转 auto 兜底）。
func (a *adminState) srcResolvePrimary(source, id string) (string, error) {
	if a.musicKindIsGD() {
		for _, br := range []int{320, 128} {
			u, err := gdURL(a.musicAPI, source, id, br)
			if err != nil {
				return "", err
			}
			if u != "" {
				return u, nil
			}
		}
		return "", nil
	}
	return uniURL(a.musicAPI, source, id)
}

func (a *adminState) srcLyric(source, id string) (string, error) {
	if a.musicKindIsGD() {
		return gdLyric(a.musicAPI, source, id)
	}
	return uniLyric(a.musicAPI, source, id)
}

// ---- 适配：统一封装层（默认，:9000 风格）----
// 响应统一 {"code":0,"msg":"ok","source":"...","data":{...}}；逻辑失败为 code!=0（HTTP 502 也带 JSON 体）。

type uniEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

// uniGet 打统一层一次并解进 env；502（逻辑失败）也照常解 body，交调用方看 code
func uniGet(base, path string, params url.Values, env *uniEnvelope) error {
	full := strings.TrimRight(base, "/") + path + "?" + params.Encode()
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", musicUA)
	resp, err := musicClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, env); err != nil {
		return fmt.Errorf("统一层应答不是预期 JSON（HTTP %d，服务在跑吗）", resp.StatusCode)
	}
	return nil
}

func uniSearch(base, source, kw string, page int) ([]musicHit, error) {
	var env uniEnvelope
	if err := uniGet(base, "/api/search", url.Values{
		"source":  {source},
		"keyword": {kw},
		"page":    {strconv.Itoa(page)},
		"limit":   {strconv.Itoa(musicPageSize)},
	}, &env); err != nil {
		return nil, err
	}
	if env.Code != 0 {
		return nil, errors.New(env.Msg)
	}
	var d struct {
		List []struct {
			ID      any      `json:"id"`
			Name    string   `json:"name"`
			Artists []string `json:"artists"`
			Album   string   `json:"album"`
			Fee     *int     `json:"fee"`
		} `json:"list"`
	}
	if err := json.Unmarshal(env.Data, &d); err != nil {
		return nil, errors.New("搜索结果解析失败")
	}
	hits := make([]musicHit, 0, len(d.List))
	for _, it := range d.List {
		id := anyToStr(it.ID)
		if id == "" {
			continue
		}
		hits = append(hits, musicHit{
			Source: source,
			ID:     id,
			Title:  it.Name,
			Artist: strings.Join(it.Artists, " / "),
			Album:  it.Album,
			VIP:    it.Fee != nil && *it.Fee == 1, // 网易 fee：0 免费 / 1 VIP / 8 低音质免费
		})
	}
	return hits, nil
}

// uniURL：按指定源精确取直链（/api/url）。逻辑失败（code!=0）当作没有直链返回空串。
func uniURL(base, source, id string) (string, error) {
	var env uniEnvelope
	if err := uniGet(base, "/api/url", url.Values{
		"source":  {source},
		"songId":  {id},
		"quality": {"320k"},
	}, &env); err != nil {
		return "", err
	}
	if env.Code != 0 {
		return "", nil
	}
	var d struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(env.Data, &d) == nil {
		return strings.TrimSpace(d.URL), nil
	}
	return "", nil
}

func uniLyric(base, source, id string) (string, error) {
	var env uniEnvelope
	if err := uniGet(base, "/api/lyric", url.Values{
		"source": {source},
		"songId": {id},
	}, &env); err != nil {
		return "", err
	}
	if env.Code != 0 {
		return "", errors.New(env.Msg)
	}
	var d struct {
		Lyric string `json:"lyric"`
	}
	json.Unmarshal(env.Data, &d) // lx 源内层形状可能不同，取不到就空歌词，不算错
	return d.Lyric, nil
}

// ---- 适配：GD 音乐台 api.php（零部署兜底，-music-api-kind gdstudio）----

func gdGet(base string, params url.Values, v any) error {
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+sep+params.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", musicUA)
	resp, err := musicClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("音源 API 返回 HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return errors.New("音源应答不是预期 JSON（该源可能当前不可用）")
	}
	return nil
}

func gdSearch(base, source, kw string, page int) ([]musicHit, error) {
	var raw []struct {
		ID     any      `json:"id"`
		Name   string   `json:"name"`
		Artist []string `json:"artist"`
		Album  string   `json:"album"`
	}
	if err := gdGet(base, url.Values{
		"types":  {"search"},
		"source": {source},
		"name":   {kw},
		"count":  {strconv.Itoa(musicPageSize)},
		"pages":  {strconv.Itoa(page)},
	}, &raw); err != nil {
		return nil, err
	}
	hits := make([]musicHit, 0, len(raw))
	for _, it := range raw {
		id := anyToStr(it.ID)
		if id == "" {
			continue
		}
		hits = append(hits, musicHit{
			Source: source,
			ID:     id,
			Title:  it.Name,
			Artist: strings.Join(it.Artist, " / "),
			Album:  it.Album,
		})
	}
	return hits, nil
}

func gdURL(base, source, id string, br int) (string, error) {
	var raw struct {
		URL string `json:"url"`
	}
	if err := gdGet(base, url.Values{
		"types":  {"url"},
		"source": {source},
		"id":     {id},
		"br":     {strconv.Itoa(br)},
	}, &raw); err != nil {
		return "", err
	}
	return strings.TrimSpace(raw.URL), nil
}

func gdLyric(base, source, id string) (string, error) {
	var raw struct {
		Lyric string `json:"lyric"`
	}
	if err := gdGet(base, url.Values{
		"types":  {"lyric"},
		"source": {source},
		"id":     {id},
	}, &raw); err != nil {
		return "", err
	}
	return raw.Lyric, nil
}
