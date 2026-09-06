<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatJson, type JsonIndent } from '~/core/json-formatter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const input = ref('')
const indent = ref<JsonIndent>(2)
const output = ref('')
const error = ref<ToolError | null>(null)
const isFormatting = ref(false)

const status = computed<ToolUiStatus>(() => {
  if (isFormatting.value) {
    return 'processing'
  }

  if (error.value?.code === 'empty-input') {
    return 'idle'
  }

  if (error.value) {
    return 'error'
  }

  return output.value ? 'success' : 'idle'
})

const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '输入 JSON 后点击“开始格式化”，结果会显示在这里。')

const hasResettableState = computed(() => Boolean(
  input.value
  || output.value
  || error.value
  || indent.value !== 2,
))

function runFormatting() {
  if (isFormatting.value) {
    return
  }

  isFormatting.value = true

  try {
    const result = formatJson(input.value, { indent: indent.value })

    if (!result.ok) {
      error.value = result.error
      return
    }

    output.value = result.value.formatted
    error.value = null
  } finally {
    isFormatting.value = false
  }
}

function clearAll() {
  input.value = ''
  indent.value = 2
  output.value = ''
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split json-workbench-tool">
    <ToolInputPanel title="JSON 输入" description="输入或粘贴标准 JSON，点击按钮后在本地完成格式化。">
      <label class="tool-field">
        <span class="tool-field__label">JSON 文本</span>
        <textarea
          v-model="input"
          class="tool-textarea tool-textarea--code json-workbench-tool__input"
          rows="14"
          placeholder='例如：{"name":"Tool Deck","items":[1,2,3]}'
          aria-label="待格式化 JSON"
          spellcheck="false"
        />
      </label>

      <label class="tool-field">
        <span class="tool-field__label">缩进方式</span>
        <select v-model="indent" class="tool-select" aria-label="JSON 缩进方式">
          <option :value="2">2 个空格</option>
          <option :value="4">4 个空格</option>
          <option value="tab">Tab</option>
        </select>
      </label>

      <p class="tool-note">只接受标准 JSON 语法；不设置输入硬上限，格式化不会在输入过程中实时执行。</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isFormatting" @click="runFormatting">开始格式化</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="格式化结果"
      :status="status"
      :error="error"
      :empty-text="emptyText"
      processing-text="正在格式化 JSON，请稍候。"
    >
      <pre class="json-workbench-tool__output"><code>{{ output }}</code></pre>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>

    <section v-if="error && output" class="tool-panel json-workbench-tool__preserved-result" aria-label="上一次成功结果">
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留</span>
      </header>
      <p class="tool-note">本次格式化失败，下面仍是上一次成功生成的结果，不代表当前输入已经格式化成功。</p>
      <pre class="json-workbench-tool__output json-workbench-tool__output--preserved"><code>{{ output }}</code></pre>
      <div class="tool-panel__actions">
        <CopyButton :text="output" />
      </div>
    </section>
  </div>
</template>
