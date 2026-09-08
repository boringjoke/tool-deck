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

/** 提供收藏、最近使用和本地存储提示等工具偏好能力。 */
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

  /** 显示本地存储不可用时的提示信息。 */
  function showStorageNotice() {
    storageNotice.value = '本地存储不可用，本次操作仍会在当前页面暂时生效。'
  }

  /** 判断指定工具是否已被收藏。 */
  function isFavorite(slug: string): boolean {
    return favoriteSlugs.value.includes(slug)
  }

  /** 切换指定工具的收藏状态。 */
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

  /** 记录工具最近使用时间并更新本地列表。 */
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

  /** 清空最近使用工具记录。 */
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
