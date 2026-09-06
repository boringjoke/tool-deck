import { computed, onMounted, ref } from 'vue'
import { getPublicTools } from '../registry'
import {
  isLocalStorageAvailable,
  loadFavoriteSlugs,
  loadRecentItems,
  saveFavoriteSlugs,
  saveRecentItems,
  type RecentStorageItem,
} from '../adapters/storage'
import type { ToolDefinition } from '../types/tool'

const publicTools = getPublicTools()
const publicToolBySlug = new Map(publicTools.map((tool) => [tool.slug, tool]))

export function useToolPreferences() {
  const favoriteSlugs = ref<string[]>([])
  const recentItems = ref<RecentStorageItem[]>([])
  const isStorageReady = ref(false)
  const storageNotice = ref<string | null>(null)

  const favoriteTools = computed(() =>
    favoriteSlugs.value
      .map((slug) => publicToolBySlug.get(slug))
      .filter((tool): tool is ToolDefinition => Boolean(tool)),
  )

  const recentTools = computed(() =>
    recentItems.value
      .map((item) => publicToolBySlug.get(item.slug))
      .filter((tool): tool is ToolDefinition => Boolean(tool)),
  )

  onMounted(() => {
    favoriteSlugs.value = loadFavoriteSlugs().filter((slug) => publicToolBySlug.has(slug))
    recentItems.value = loadRecentItems().filter((item) => publicToolBySlug.has(item.slug))
    isStorageReady.value = true

    if (!isLocalStorageAvailable()) {
      storageNotice.value = '当前浏览器未允许本地存储，收藏和最近使用不会在刷新后保留。'
    }
  })

  function showStorageNotice() {
    storageNotice.value = '本地存储不可用，本次操作仍会在当前页面暂时生效。'
  }

  function isFavorite(slug: string): boolean {
    return favoriteSlugs.value.includes(slug)
  }

  function toggleFavorite(slug: string) {
    if (!publicToolBySlug.has(slug)) {
      return
    }

    const next = isFavorite(slug)
      ? favoriteSlugs.value.filter((favoriteSlug) => favoriteSlug !== slug)
      : [...favoriteSlugs.value, slug]

    favoriteSlugs.value = next

    if (!saveFavoriteSlugs(next)) {
      showStorageNotice()
    }
  }

  function recordRecent(slug: string) {
    if (!publicToolBySlug.has(slug)) {
      return
    }

    const next: RecentStorageItem[] = [
      {
        slug,
        lastUsedTime: new Date().toISOString(),
      },
      ...recentItems.value.filter((item) => item.slug !== slug),
    ].slice(0, 12)

    recentItems.value = next

    if (!saveRecentItems(next)) {
      showStorageNotice()
    }
  }

  function clearRecent() {
    recentItems.value = []

    if (!saveRecentItems([])) {
      showStorageNotice()
    }
  }

  return {
    clearRecent,
    favoriteTools,
    isFavorite,
    isStorageReady,
    recentTools,
    recordRecent,
    storageNotice,
    toggleFavorite,
  }
}
