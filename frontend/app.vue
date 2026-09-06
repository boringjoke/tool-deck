<script setup lang="ts">
import { computed } from 'vue'
import { TOOL_CATEGORIES } from '~/registry'

const route = useRoute()
const router = useRouter()

const isDirectoryPage = computed(() => route.path === '/' || route.path.startsWith('/tools/'))

const searchQuery = computed({
  get: () => (typeof route.query.q === 'string' ? route.query.q : ''),
  set: (value: string) => {
    const nextQuery: Record<string, string> = {}
    const normalizedValue = value.trim()

    if (normalizedValue) {
      nextQuery.q = value
    }

    void router.replace({ path: '/', query: nextQuery })
  },
})

const activeCategory = computed(() => {
  const value = typeof route.query.cat === 'string' ? route.query.cat : ''
  return TOOL_CATEGORIES.some((category) => category.slug === value) ? value : 'all'
})

function selectCategory(slug: string) {
  void router.replace({
    path: '/',
    query: slug === 'all' ? {} : { cat: slug },
  })
}

function clearSearch() {
  searchQuery.value = ''
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <div class="site-container site-header__inner">
        <NuxtLink to="/" class="brand" aria-label="Tool Deck 首页">
          <span>Tool Deck</span>
          <span class="brand__tag">beta</span>
        </NuxtLink>

        <div v-if="isDirectoryPage" class="site-header__directory">
          <div class="header-search">
            <span class="header-search__icon" aria-hidden="true">⌕</span>
            <input
              id="header-tool-search"
              v-model="searchQuery"
              class="header-search__input"
              type="search"
              placeholder="搜索工具…"
              autocomplete="off"
              aria-label="搜索工具"
            >
            <button
              v-if="searchQuery"
              type="button"
              class="header-search__clear"
              aria-label="清除搜索"
              @click="clearSearch"
            >
              ×
            </button>
          </div>

          <nav class="category-tabs" aria-label="工具分类">
            <button
              type="button"
              class="category-tab"
              :class="{ 'category-tab--active': activeCategory === 'all' && !searchQuery }"
              :aria-pressed="activeCategory === 'all' && !searchQuery"
              @click="selectCategory('all')"
            >
              全部
            </button>
            <button
              v-for="category in TOOL_CATEGORIES"
              :key="category.slug"
              type="button"
              class="category-tab"
              :class="[
                `category-tab--${category.slug}`,
                { 'category-tab--active': activeCategory === category.slug && !searchQuery },
              ]"
              :aria-pressed="activeCategory === category.slug && !searchQuery"
              @click="selectCategory(category.slug)"
            >
              <span class="category-tab__dot" aria-hidden="true" />
              {{ category.title }}
            </button>
          </nav>
        </div>

      </div>
    </header>

    <main id="main-content" class="site-main">
      <NuxtPage />
    </main>

    <footer class="site-footer">
      <div class="site-container site-footer__inner">
        <span class="site-footer__brand">Tool Deck</span>
        <nav class="site-footer__links" aria-label="页脚导航">
          <NuxtLink to="/about" class="site-nav__link">关于项目</NuxtLink>
          <NuxtLink to="/privacy" class="site-nav__link">隐私说明</NuxtLink>
        </nav>
        <span class="site-footer__note">本地优先 · 无账号 · 无追踪</span>
      </div>
    </footer>
  </div>
</template>
