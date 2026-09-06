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
