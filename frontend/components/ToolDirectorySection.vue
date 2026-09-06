<script setup lang="ts">
import type { ToolDefinition } from '~/types/tool'

const props = defineProps<{
  id: string
  label: string
  accent: string
  tools: readonly ToolDefinition[]
  collapsed: boolean
  isFavorite: (slug: string) => boolean
}>()

const emit = defineEmits<{
  toggle: []
  'toggle-favorite': [slug: string]
}>()
</script>

<template>
  <section
    :id="props.id"
    class="directory-section"
    :style="{ '--section-accent': props.accent }"
  >
    <div class="directory-section__header-row">
      <button
        type="button"
        class="directory-section__header"
        :aria-expanded="!props.collapsed"
        :aria-controls="`${props.id}-tools`"
        @click="emit('toggle')"
      >
        <span class="directory-section__heading">
          <span class="directory-section__dot" aria-hidden="true" />
          <span class="directory-section__label">{{ props.label }}</span>
          <span class="directory-section__count">{{ props.tools.length }} 个工具</span>
        </span>
        <span class="directory-section__chevron" :class="{ 'directory-section__chevron--collapsed': props.collapsed }" aria-hidden="true">⌄</span>
      </button>

      <div v-if="$slots.actions" class="directory-section__actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="!props.collapsed" :id="`${props.id}-tools`" class="directory-section__body">
      <div v-if="props.tools.length" class="tool-grid">
        <ToolCard
          v-for="tool in props.tools"
          :key="tool.id"
          :tool="tool"
          :is-favorite="props.isFavorite(tool.slug)"
          @toggle-favorite="emit('toggle-favorite', $event)"
        />
      </div>
      <p v-else class="directory-section__empty">暂无已启用工具</p>
    </div>
  </section>
</template>
