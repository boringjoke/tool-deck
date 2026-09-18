<script setup lang="ts">
import type { ToolCategorySlug } from '~/types/tool'

const props = defineProps<{
  category: ToolCategorySlug
}>()

const categoryGlyphs: Record<ToolCategorySlug, string> = {
  'developer-text': '{}',
  'date-conversion': '↔',
  'content-generation': '✦',
  interactive: '◌',
  knowledge: '▦',
}
</script>

<template>
  <span
    class="tool-detail-icon"
    :class="`tool-detail-icon--${props.category}`"
    aria-hidden="true"
  >
    {{ categoryGlyphs[props.category] }}
  </span>
</template>
