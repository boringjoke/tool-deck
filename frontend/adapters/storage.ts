export const STORAGE_KEYS = {
  favorites: 'tool-deck:favorites:v1',
  recent: 'tool-deck:recent:v1',
} as const

export const MAX_RECENT_TOOLS = 12

export type FavoriteStorage = string[]

export interface RecentStorageItem {
  slug: string
  lastUsedTime: string
}

export type RecentStorage = RecentStorageItem[]

/** 获取当前浏览器的本地存储对象。 */
function getClientStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 检查当前环境是否可以安全使用本地存储。 */
export function isLocalStorageAvailable(): boolean {
  const storage = getClientStorage()

  if (!storage) {
    return false
  }

  try {
    const probeKey = 'tool-deck:storage-probe'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

/** 解析收藏工具存储内容并过滤无效工具标识。 */
export function parseFavoriteStorage(raw: string | null): FavoriteStorage {
  if (!raw) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return [...new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0))]
  } catch {
    return []
  }
}

/** 判断最近使用记录是否符合存储结构。 */
function isRecentStorageItem(value: unknown): value is RecentStorageItem {
  if (!value || typeof value !== 'object') {
    return false
  }

  const item = value as Record<string, unknown>
  return (
    typeof item.slug === 'string' &&
    item.slug.length > 0 &&
    typeof item.lastUsedTime === 'string' &&
    !Number.isNaN(Date.parse(item.lastUsedTime))
  )
}

/** 解析最近使用存储内容并清理无效记录。 */
export function parseRecentStorage(raw: string | null): RecentStorage {
  if (!raw) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(isRecentStorageItem)
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const timeDifference = Date.parse(right.item.lastUsedTime) - Date.parse(left.item.lastUsedTime)
        return timeDifference || left.index - right.index
      })
      .slice(0, MAX_RECENT_TOOLS)
      .map(({ item }) => item)
  } catch {
    return []
  }
}

/** 读取收藏工具标识列表。 */
export function loadFavoriteSlugs(): FavoriteStorage {
  const storage = getClientStorage()

  if (!storage) {
    return []
  }

  try {
    return parseFavoriteStorage(storage.getItem(STORAGE_KEYS.favorites))
  } catch {
    return []
  }
}

/** 保存收藏工具标识列表到本地存储。 */
export function saveFavoriteSlugs(slugs: readonly string[]): boolean {
  const storage = getClientStorage()

  if (!storage) {
    return false
  }

  try {
    storage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...new Set(slugs)]))
    return true
  } catch {
    return false
  }
}

/** 读取最近使用工具记录。 */
export function loadRecentItems(): RecentStorage {
  const storage = getClientStorage()

  if (!storage) {
    return []
  }

  try {
    return parseRecentStorage(storage.getItem(STORAGE_KEYS.recent))
  } catch {
    return []
  }
}

/** 保存最近使用工具记录到本地存储。 */
export function saveRecentItems(items: readonly RecentStorageItem[]): boolean {
  const storage = getClientStorage()

  if (!storage) {
    return false
  }

  try {
    storage.setItem(STORAGE_KEYS.recent, JSON.stringify(parseRecentStorage(JSON.stringify(items))))
    return true
  } catch {
    return false
  }
}
