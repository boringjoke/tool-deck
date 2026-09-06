<script setup lang="ts">
import { computed } from 'vue'
import { findCategoryBySlug } from '~/registry'
import type { ToolDefinition } from '~/types/tool'

interface ToolPageInfo {
  usage: readonly string[]
  notes: readonly string[]
}

const props = withDefaults(defineProps<{
  tool: ToolDefinition
  isFavorite?: boolean
  info?: ToolPageInfo
}>(), {
  isFavorite: false,
  info: undefined,
})

const emit = defineEmits<{
  'toggle-favorite': []
}>()

const category = computed(() => findCategoryBySlug(props.tool.category))
</script>

<template>
  <article class="tool-shell">
    <header class="tool-shell__header">
      <div class="site-container tool-shell__header-inner">
        <nav class="tool-shell__breadcrumb" aria-label="面包屑">
          <NuxtLink to="/" class="tool-shell__breadcrumb-link">工具台</NuxtLink>
          <span aria-hidden="true">/</span>
          <NuxtLink :to="`/categories/${props.tool.category}`" class="tool-shell__breadcrumb-link">
            {{ category?.title ?? '分类' }}
          </NuxtLink>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{{ props.tool.title }}</span>
        </nav>

        <div class="tool-shell__heading">
          <ToolIconPlaceholder :category="props.tool.category" />

          <div class="tool-shell__heading-copy">
            <div class="tool-shell__title-row">
              <h1 class="tool-shell__title">{{ props.tool.title }}</h1>
              <span
                class="status-chip"
                :class="props.tool.localOnly ? 'status-chip--teal' : 'status-chip--network'"
              >
                <span class="status-chip__dot" aria-hidden="true" />
                {{ props.tool.localOnly ? '本地处理' : '需要联网' }}
              </span>
            </div>
            <p class="tool-shell__description">{{ props.tool.description }}</p>
          </div>

          <FavoriteButton
            :active="props.isFavorite"
            :show-label="true"
            @toggle="emit('toggle-favorite')"
          />
        </div>
      </div>
    </header>

    <div class="tool-shell__body">
      <div class="site-container">
        <div class="tool-shell__content">
          <slot />
        </div>

        <section v-if="props.info" class="tool-shell__info" aria-label="工具说明">
          <div class="tool-shell__info-column">
            <h2 class="tool-shell__info-title">使用方法</h2>
            <ol class="tool-shell__info-list">
              <li v-for="(step, index) in props.info.usage" :key="`usage-${index}`">
                {{ step }}
              </li>
            </ol>
          </div>

          <div class="tool-shell__info-column">
            <h2 class="tool-shell__info-title">注意事项</h2>
            <ul class="tool-shell__info-list">
              <li v-for="(note, index) in props.info.notes" :key="`note-${index}`">
                {{ note }}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </article>
</template>
