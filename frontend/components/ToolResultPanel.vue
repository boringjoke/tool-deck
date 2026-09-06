<script setup lang="ts">
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

withDefaults(defineProps<{
  title?: string
  status: ToolUiStatus
  error?: ToolError | null
  emptyText?: string
  processingText?: string
}>(), {
  title: '结果',
  error: null,
  emptyText: '输入内容并执行操作后，结果会显示在这里。',
  processingText: '正在处理，请稍候。',
})
</script>

<template>
  <section class="tool-panel tool-result-panel" aria-live="polite">
    <header class="tool-panel__header">
      <h2 class="tool-panel__title">{{ title }}</h2>
      <span class="tool-panel__status" :class="`tool-panel__status--${status}`">
        {{ status === 'processing' ? '处理中' : status === 'success' ? '已完成' : status === 'error' ? '需要修正' : '等待输入' }}
      </span>
    </header>

    <div class="tool-panel__body">
      <div v-if="status === 'idle'" class="tool-state tool-state--empty">{{ emptyText }}</div>
      <div v-else-if="status === 'processing'" class="tool-state">{{ processingText }}</div>
      <ErrorNotice v-else-if="status === 'error' && error" :error="error" />
      <template v-else>
        <slot />
        <div v-if="$slots.actions" class="tool-panel__actions">
          <slot name="actions" />
        </div>
      </template>
    </div>
  </section>
</template>
