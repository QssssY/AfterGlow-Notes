/**
 * 站点数据的多语言覆盖合并。
 *
 * 基准是 src/data/<名字>.json（中文，管理后台改的就是这一份），
 * 译文放 src/data/<名字>.<语种>.json —— **只写要翻的字段**，其余自动回落中文。
 * 这样后台加一条分享、改一次简介，不会因为译文文件没跟上就让英文站露出空洞。
 *
 * 数组的对应关系尽量不按下标死认（后台一拖排序，译文就全错位了），而是先找身份字段
 * 按它配对，找不到才退回下标。
 *
 * 身份字段只能挑**永远不会被翻译**的：repo / href / domain 这类地址与标识。
 * 曾把 name / title 也算进去，是个坑：这两个恰恰是最常翻的字段，一翻两边就对不上，
 * 译文会被静默丢弃（页面照样构建成功，只是一个字都没翻）—— 这种失败最难发现。
 *
 * 于是没有地址字段的短列表（reading / tools / stack / now.items / changelog）走下标：
 * 译文数组按位置对应，可以写 {} 跳过某条、也可以写短一点让后面的保持原文。
 * 代价是后台在这些列表里**插入或重排**条目后，译文要跟着挪一下位置。
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

/**
 * 数组配对时当主键的字段，按可靠性排序。
 * 只放不可翻译的标识 —— 别把 name / title 加回来（见文件头的说明）。
 */
const IDENTITY_KEYS = ['repo', 'href', 'domain'] as const

const isPlainObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** 两边都是对象数组、且共有同一个身份字段时，返回该字段名 */
function identityKey(base: Json[], patch: Json[]): string | null {
  if (!base.every(isPlainObject) || !patch.every(isPlainObject)) return null
  for (const key of IDENTITY_KEYS) {
    const inBase = base.every((item) => typeof (item as JsonObject)[key] === 'string')
    const inPatch = patch.every((item) => typeof (item as JsonObject)[key] === 'string')
    if (inBase && inPatch) return key
  }
  return null
}

function mergeArray(base: Json[], patch: Json[]): Json[] {
  const key = identityKey(base, patch)

  if (key) {
    const byId = new Map<string, JsonObject>()
    for (const item of patch) byId.set(String((item as JsonObject)[key]), item as JsonObject)
    return base.map((item) => {
      const hit = byId.get(String((item as JsonObject)[key]))
      return hit ? (mergeValue(item, hit) as Json) : item
    })
  }

  // 退回下标对应：译文短了，后面的条目保持中文原文
  return base.map((item, i) => (i < patch.length ? (mergeValue(item, patch[i]!) as Json) : item))
}

function mergeValue(base: Json, patch: Json): Json {
  if (Array.isArray(base) && Array.isArray(patch)) return mergeArray(base, patch)
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: JsonObject = { ...base }
    for (const [k, v] of Object.entries(patch)) {
      // 显式写 null = 「这条译文里删掉这个字段」（比如某语种不需要的小标）
      if (v === null) delete out[k]
      else out[k] = k in base ? mergeValue(base[k]!, v) : v
    }
    return out
  }
  // 标量与类型不一致的情况：译文直接顶掉基准
  return patch
}

/** 把译文覆盖合并到基准数据上，返回新对象（不改原数据） */
export function mergeContent<T>(base: T, patch: unknown): T {
  if (patch === undefined || patch === null) return base
  return mergeValue(base as Json, patch as Json) as T
}
