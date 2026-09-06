<script setup lang="ts">
import { useToolPreferences } from '~/composables/useToolPreferences'
import { findCategoryBySlug, getPublicToolsByCategory, TOOL_CATEGORIES } from '~/registry'

const route = useRoute()
const category = findCategoryBySlug(String(route.params.slug))

if (!category) {
  throw createError({
    statusCode: 404,
    message: '分类不存在',
  })
}

const tools = getPublicToolsByCategory(category.slug)
const localToolCount = tools.filter((tool) => tool.localOnly).length
const otherCategories = TOOL_CATEGORIES
  .filter((otherCategory) => otherCategory.slug !== category.slug)
  .map((otherCategory) => ({
    category: otherCategory,
    toolCount: getPublicToolsByCategory(otherCategory.slug).length,
  }))
const { isFavorite, toggleFavorite } = useToolPreferences()

usePublicSeo({
  title: `${category.title} · Tool Deck`,
  description: category.description,
  pathname: `/categories/${category.slug}`,
})
</script>

<template>
  <div class="category-page">
    <section class="category-page__header">
      <div class="site-container category-page__header-inner">
        <nav class="category-page__breadcrumb" aria-label="面包屑">
          <NuxtLink to="/" class="category-page__breadcrumb-link">工具台</NuxtLink>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{{ category.title }}</span>
        </nav>

        <div class="category-page__heading">
          <ToolIconPlaceholder :category="category.slug" class="category-page__icon" />
          <div class="category-page__heading-copy">
            <h1 class="category-page__title">{{ category.title }}</h1>
            <p class="category-page__description">{{ category.description }}</p>
            <div class="category-page__stats" aria-label="分类统计">
              <span class="category-page__stat">
                <strong>{{ tools.length }}</strong>
                <span>个工具</span>
              </span>
              <span class="category-page__stat-divider" aria-hidden="true" />
              <span class="category-page__stat-muted">{{ localToolCount }} 个本地处理</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="site-container category-page__body">
      <div v-if="tools.length" class="tool-grid">
        <ToolCard
          v-for="tool in tools"
          :key="tool.id"
          :tool="tool"
          :is-favorite="isFavorite(tool.slug)"
          @toggle-favorite="toggleFavorite"
        />
      </div>

      <div v-else class="empty-state">
        <span class="empty-state__marker">暂无公开工具</span>
        <h2 class="empty-state__title">这个分类还没有可直接使用的工具。</h2>
        <p class="empty-state__description">
          草稿工具不会提前出现在公开页面。完成实现和验收后，它们会从注册表进入对应分类。
        </p>
        <NuxtLink to="/" class="button button--secondary">返回工具目录</NuxtLink>
      </div>

      <section class="category-page__other-categories" aria-labelledby="other-categories-heading">
        <h2 id="other-categories-heading" class="category-page__other-title">其他分类</h2>
        <div class="category-page__other-list">
          <NuxtLink
            v-for="item in otherCategories"
            :key="item.category.slug"
            :to="`/categories/${item.category.slug}`"
            class="other-category-link"
          >
            <span
              class="other-category-link__dot"
              :class="`other-category-link__dot--${item.category.slug}`"
              aria-hidden="true"
            />
            <span>{{ item.category.title }}</span>
            <span class="other-category-link__count">{{ item.toolCount }}</span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
