<script setup lang="ts">
import { computed } from 'vue'
import type { ToolDefinition } from '~/types/tool'

const props = defineProps<{
  tool: ToolDefinition
  isFavorite?: boolean
}>()

const emit = defineEmits<{
  'toggle-favorite': [slug: string]
}>()

const categoryGlyph = computed(() => {
  const glyphs: Record<string, string> = {
    'developer-text': '{}',
    'date-conversion': '↔',
    'content-generation': '✦',
    interactive: '◌',
    knowledge: '▦',
  }

  return glyphs[props.tool.category] ?? '•'
})
</script>

<template>
  <article class="tool-card">
    <div class="tool-card__header">
      <span
        class="tool-card__icon"
        :class="`tool-card__icon--${props.tool.category}`"
        aria-hidden="true"
      >{{ categoryGlyph }}</span>

      <div class="tool-card__main">
        <div class="tool-card__title-row">
          <NuxtLink :to="`/tools/${props.tool.slug}`" class="tool-card__title-link">
            <h3 class="tool-card__title">{{ props.tool.title }}</h3>
          </NuxtLink>
          <FavoriteButton
            :active="props.isFavorite ?? false"
            @toggle="emit('toggle-favorite', props.tool.slug)"
          />
        </div>
        <p class="tool-card__description">{{ props.tool.description }}</p>
      </div>
    </div>

    <div class="tool-card__footer">
      <span
        class="tool-card__privacy"
        :class="{ 'tool-card__privacy--network': !props.tool.localOnly }"
      >
        <span class="tool-card__privacy-dot" aria-hidden="true" />
        {{ props.tool.localOnly ? '本地处理' : '需要联网' }}
      </span>
      <NuxtLink :to="`/tools/${props.tool.slug}`" class="tool-card__open">
        打开 <span aria-hidden="true">→</span>
      </NuxtLink>
    </div>
  </article>
</template>
