<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { QuickToolItem } from '~/utils/quick-tools'

type QuickToolView = 'all' | 'favorites' | 'recent'

const DISPLAY_LIMIT = 6

const props = defineProps<{
  items: readonly QuickToolItem[]
}>()

const emit = defineEmits<{
  'toggle-favorite': [slug: string]
  'clear-recent': []
}>()

const activeView = ref<QuickToolView>('all')
const isExpanded = ref(false)
const favoriteCount = computed(() => props.items.filter((item) => item.isFavorite).length)
const recentCount = computed(() => props.items.filter((item) => item.isRecent).length)
const filteredItems = computed(() => {
  if (activeView.value === 'favorites') {
    return props.items.filter((item) => item.isFavorite)
  }

  if (activeView.value === 'recent') {
    return props.items.filter((item) => item.isRecent)
  }

  return props.items
})
const visibleItems = computed(() =>
  isExpanded.value ? filteredItems.value : filteredItems.value.slice(0, DISPLAY_LIMIT),
)
const hasMoreItems = computed(() => filteredItems.value.length > DISPLAY_LIMIT)
/** 计算收起状态下尚未展示的工具数量，用于提示用户展开列表。 */
const hiddenItemCount = computed(() =>
  Math.max(filteredItems.value.length - visibleItems.value.length, 0),
)
const emptyViewLabel = computed(() => {
  if (activeView.value === 'favorites') {
    return '还没有收藏工具'
  }

  if (activeView.value === 'recent') {
    return '还没有最近使用记录'
  }

  return '还没有快捷工具'
})

/** 切换快捷工具区域的筛选视图并恢复紧凑展示。 */
function selectView(view: QuickToolView) {
  activeView.value = view
  isExpanded.value = false
}

/** 切换当前快捷工具筛选视图的完整列表展示。 */
function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

/** 清空最近使用记录并回到去重后的全部快捷工具视图。 */
function handleClearRecent() {
  activeView.value = 'all'
  isExpanded.value = false
  emit('clear-recent')
}

/** 当当前筛选项被清空时，恢复到仍然可用的全部视图。 */
function resetUnavailableView() {
  if (activeView.value === 'favorites' && favoriteCount.value === 0) {
    activeView.value = 'all'
    isExpanded.value = false
  }

  if (activeView.value === 'recent' && recentCount.value === 0) {
    activeView.value = 'all'
    isExpanded.value = false
  }
}

watch([favoriteCount, recentCount], resetUnavailableView)
</script>

<template>
  <section class="quick-tools" aria-labelledby="quick-tools-heading">
    <div class="quick-tools__header">
      <div class="quick-tools__heading">
        <div class="quick-tools__title-row">
          <span class="quick-tools__dot" aria-hidden="true" />
          <h2 id="quick-tools-heading" class="quick-tools__title">我的工具</h2>
          <span class="quick-tools__count">{{ props.items.length }} 个工具</span>
        </div>
        <p class="quick-tools__summary">收藏优先，最近使用自动补充</p>
      </div>

      <button
        v-if="recentCount"
        type="button"
        class="section-action"
        @click="handleClearRecent"
      >
        清空最近使用
      </button>
    </div>

    <div class="quick-tools__toolbar">
      <div class="quick-tools__tabs" role="tablist" aria-label="我的工具筛选">
        <button
          type="button"
          class="quick-tools__tab"
          :class="{ 'quick-tools__tab--active': activeView === 'all' }"
          role="tab"
          :aria-selected="activeView === 'all'"
          aria-controls="quick-tools-list"
          @click="selectView('all')"
        >
          全部 <span>{{ props.items.length }}</span>
        </button>
        <button
          v-if="favoriteCount"
          type="button"
          class="quick-tools__tab"
          :class="{ 'quick-tools__tab--active': activeView === 'favorites' }"
          role="tab"
          :aria-selected="activeView === 'favorites'"
          aria-controls="quick-tools-list"
          @click="selectView('favorites')"
        >
          已收藏 <span>{{ favoriteCount }}</span>
        </button>
        <button
          v-if="recentCount"
          type="button"
          class="quick-tools__tab"
          :class="{ 'quick-tools__tab--active': activeView === 'recent' }"
          role="tab"
          :aria-selected="activeView === 'recent'"
          aria-controls="quick-tools-list"
          @click="selectView('recent')"
        >
          最近使用 <span>{{ recentCount }}</span>
        </button>
      </div>

      <div v-if="hasMoreItems" class="quick-tools__expand-group">
        <button
          type="button"
          class="quick-tools__expand"
          :aria-expanded="isExpanded"
          aria-controls="quick-tools-list"
          @click="toggleExpanded"
        >
          {{ isExpanded ? '收起' : '显示全部' }}
        </button>
      </div>
    </div>

    <ul id="quick-tools-list" class="quick-tools__list" aria-label="快捷工具列表">
      <li v-for="item in visibleItems" :key="item.tool.id" class="quick-tools__item">
        <NuxtLink :to="`/tools/${item.tool.slug}`" class="quick-tools__link">
          <span
            class="quick-tools__marker"
            :class="`quick-tools__marker--${item.tool.category}`"
            aria-hidden="true"
          />
          <span class="quick-tools__name">{{ item.tool.title }}</span>
          <span class="quick-tools__badges">
            <span v-if="item.isFavorite" class="quick-tools__badge quick-tools__badge--favorite">已收藏</span>
            <span v-if="item.isRecent" class="quick-tools__badge quick-tools__badge--recent">最近使用</span>
          </span>
          <span class="quick-tools__arrow" aria-hidden="true">→</span>
        </NuxtLink>
        <FavoriteButton
          :active="item.isFavorite"
          @toggle="emit('toggle-favorite', item.tool.slug)"
        />
      </li>
      <li v-if="hiddenItemCount" class="quick-tools__more-hint">
        <span aria-hidden="true">…</span>
        <span class="sr-only">还有 {{ hiddenItemCount }} 个工具未显示</span>
      </li>
    </ul>

    <p v-if="!visibleItems.length" class="quick-tools__empty">{{ emptyViewLabel }}</p>
  </section>
</template>
