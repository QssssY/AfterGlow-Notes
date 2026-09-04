/**
 * 管理台两个后端（Go 服务 / GitHub 直连）共用的请求合同。
 *
 * 单独一个模块是为了不成环：admin.ts 要 import gh-cms.ts 做形态分派，而 gh-cms.ts
 * 也需要这里的 ApiError / ETAG_ABSENT —— 直接互相 import 虽然 ESM 能跑（都只在函数体里
 * 用到对方），但那种「能跑」是靠求值顺序碰巧成立的，不值得赌。
 */

/** 读一份数据时连它的版本号一起拿到（Go 端的 ETag / GitHub 的 blob sha） */
export interface ApiResult<T> {
  data: T
  etag: string | null
}

export interface ApiInit {
  method?: string
  body?: unknown
  /**
   * 乐观并发：上次读到的版本号。远端在这之后被改过则答 409，本次修改不落盘 ——
   * 所有「改内容」都是整文件 PUT，没这道校验就是「后写的赢」：数据页签开着调歌词偏移
   * 的同时在找歌页加了三首歌，回去一按保存，三首歌无声无息地消失。
   * 不传 = 不校验（无条件覆盖），curl 手动改数据仍然可用。
   */
  etag?: string | null
}

/**
 * 「这个文件还不存在」的版本号 —— 与 server/admin.go 的 etagAbsent 一字不差。
 * 新建时带它做 If-Match：文件已存在就 409，不会静默盖掉别人的东西。
 */
export const ETAG_ABSENT = '"absent"'

/** 服务明确拒绝（4xx/5xx）时抛的错，带状态码 —— 调用方能区分「服务说不行」
 *  和「根本连不上」：前者是可以下结论的应答，后者什么都说明不了 */
export class ApiError extends Error {
  // 显式字段而不是构造器参数属性（`readonly status: number`）：后者是要生成代码的 TS 语法，
  // node --experimental-strip-types 只会剥类型、遇到它直接报错 —— 仓库里的脚本
  //（scripts/i18n-report.mjs）就是那么跑 src 下的 .ts 的，别给以后埋一颗雷
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 409 = 远端已被别处改过。两个后端的冲突都归成它，页面统一按「刷新后重来」处理 */
export const isConflict = (err: unknown) => err instanceof ApiError && err.status === 409
