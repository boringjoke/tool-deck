<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToolPreferences } from '~/composables/useToolPreferences'
import { findCategoryBySlug, getPublicTools, getPublicToolsByCategory, TOOL_CATEGORIES } from '~/registry'
import type { ToolCategorySlug } from '~/types/tool'
import { mergeQuickTools } from '~/utils/quick-tools'
import { normalizeSearchText, searchPublicTools } from '~/utils/tool-search'

const route = useRoute()
const router = useRouter()
const publicTools = getPublicTools()
const {
  clearRecent,
  favoriteTools,
  isFavorite,
  recentTools,
  storageNotice,
  toggleFavorite,
} = useToolPreferences()

const searchQuery = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const activeCategory = computed(() => {
  const value = typeof route.query.cat === 'string' ? route.query.cat : ''
  return findCategoryBySlug(value)?.slug ?? 'all'
})
const isSearchActive = computed(() => normalizeSearchText(searchQuery.value).length > 0)
const searchResults = computed(() => searchPublicTools(searchQuery.value, publicTools))
const quickTools = computed(() => mergeQuickTools(favoriteTools.value, recentTools.value))
const visibleCategories = computed(() => {
  if (activeCategory.value === 'all') {
    return TOOL_CATEGORIES
  }

  return TOOL_CATEGORIES.filter((category) => category.slug === activeCategory.value)
})
const collapsedSections = ref<Set<string>>(new Set())

/** 清空页面搜索条件并恢复默认展示。 */
function clearSearch() {
  void router.replace({ path: '/', query: {} })
}

/** 切换首页工具分类区域的折叠状态。 */
function toggleSection(id: string) {
  const next = new Set(collapsedSections.value)

  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }

  collapsedSections.value = next
}

/** 判断工具分类区域当前是否折叠。 */
function isSectionCollapsed(id: string): boolean {
  return collapsedSections.value.has(id)
}

/** 获取指定分类下的公开工具列表。 */
function toolsForCategory(slug: ToolCategorySlug) {
  return getPublicToolsByCategory(slug)
}

usePublicSeo({
  title: 'Tool Deck · 在线实用工具',
  description: '打开即用的在线实用工具集合，优先在浏览器本地处理。',
  pathname: '/',
})
</script>

<template>
  <main class="site-container directory-page">
    <p v-if="storageNotice" class="storage-notice" role="status">{{ storageNotice }}</p>

    <template v-if="isSearchActive">
      <section class="directory-search-results" aria-labelledby="search-results-heading">
        <div class="directory-search-results__heading">
          <span id="search-results-heading">搜索「<strong>{{ searchQuery }}</strong>」的结果</span>
          <span class="directory-section__count">{{ searchResults.length }} 个</span>
        </div>

        <div v-if="searchResults.length" class="tool-grid">
          <ToolCard
            v-for="tool in searchResults"
            :key="tool.id"
            :tool="tool"
            :is-favorite="isFavorite(tool.slug)"
            @toggle-favorite="toggleFavorite"
          />
        </div>

        <div v-else class="directory-empty-state">
          <span class="directory-empty-state__icon" aria-hidden="true">⌕</span>
          <p>未找到与「{{ searchQuery }}」相关的工具</p>
          <button type="button" class="button button--secondary" @click="clearSearch">清除搜索</button>
        </div>
      </section>
    </template>

    <template v-else>
      <QuickToolSection
        v-if="activeCategory === 'all' && quickTools.length"
        :items="quickTools"
        @clear-recent="clearRecent"
        @toggle-favorite="toggleFavorite"
      />

      <ToolDirectorySection
        v-for="category in visibleCategories"
        :key="category.slug"
        :id="category.slug"
        :label="category.title"
        :accent="
          category.slug === 'developer-text'
            ? 'var(--td-primary)'
            : category.slug === 'date-conversion'
              ? '#0369a1'
              : category.slug === 'content-generation'
                ? 'var(--td-teal)'
              : category.slug === 'knowledge'
                  ? '#a35c00'
                  : '#7048cc'
        "
        :tools="toolsForCategory(category.slug)"
        :collapsed="isSectionCollapsed(category.slug)"
        :is-favorite="isFavorite"
        @toggle="toggleSection(category.slug)"
        @toggle-favorite="toggleFavorite"
      />
    </template>
  </main>
</template>
