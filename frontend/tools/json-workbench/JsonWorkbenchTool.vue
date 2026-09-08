<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  compressJson,
  flattenJson,
  formatJson,
  getJsonErrorLocation,
  unflattenJson,
  type JsonErrorLocation,
  type JsonIndent,
} from '~/core/json-formatter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

type JsonMode = 'format' | 'compress' | 'flatten' | 'unflatten'

const modeOptions: readonly { value: JsonMode; label: string }[] = [
  { value: 'format', label: '格式化' },
  { value: 'compress', label: '压缩' },
  { value: 'flatten', label: '扁平化' },
  { value: 'unflatten', label: '反扁平化' },
]

const mode = ref<JsonMode>('format')
const input = ref('')
const indent = ref<JsonIndent>(2)
const output = ref('')
const outputMode = ref<JsonMode | null>(null)
const error = ref<ToolError | null>(null)
const errorInput = ref('')
const inputEditor = ref<HTMLTextAreaElement | null>(null)
const editorScrollTop = ref(0)
const editorScrollLeft = ref(0)
const isProcessing = ref(false)

/** 获取当前工具模式的显示名称。 */
function getModeLabel(value: JsonMode): string {
  switch (value) {
    case 'format':
      return '格式化'
    case 'compress':
      return '压缩'
    case 'flatten':
      return '扁平化'
    case 'unflatten':
      return '反扁平化'
  }
}

const currentModeLabel = computed(() => getModeLabel(mode.value))
const outputModeLabel = computed(() => getModeLabel(outputMode.value ?? mode.value))
const actionLabel = computed(() => `开始${currentModeLabel.value}`)
const inputLabel = computed(() => `待${currentModeLabel.value} JSON`)
const processingText = computed(() => `正在${currentModeLabel.value} JSON，请稍候。`)
const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : `输入 JSON 后点击“${actionLabel.value}”，结果会显示在这里。`)
const inputNote = computed(() => {
  switch (mode.value) {
    case 'format':
      return '只接受标准 JSON 语法；不设置输入硬上限，格式化不会在输入过程中实时执行。'
    case 'compress':
      return '只接受标准 JSON 语法；压缩只移除结构性空白，不会在输入过程中实时执行。'
    case 'flatten':
      return '只接受标准 JSON 语法；扁平化使用点号路径，点号和反斜线会自动转义。'
    case 'unflatten':
      return '只接受标准 JSON 语法；反扁平化要求路径键对象，数组索引必须从 0 开始连续。'
  }
})

const status = computed<ToolUiStatus>(() => {
  if (isProcessing.value) {
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

const errorLocation = computed<JsonErrorLocation | null>(() => {
  if (!error.value || !errorInput.value) {
    return null
  }

  return getJsonErrorLocation(error.value.message, errorInput.value)
})

const inputLines = computed(() => input.value.split(/\r\n|\r|\n/u))
const highlightedErrorLine = computed<number | null>(() => {
  if (!errorLocation.value || input.value !== errorInput.value) {
    return null
  }

  const lineIndex = errorLocation.value.line - 1

  return lineIndex >= 0 && lineIndex < inputLines.value.length
    ? errorLocation.value.line
    : null
})
const editorHighlightStyle = computed(() => ({
  transform: `translate(${-editorScrollLeft.value}px, ${-editorScrollTop.value}px)`,
}))

const hasResettableState = computed(() => Boolean(
  input.value
  || output.value
  || error.value
  || indent.value !== 2
  || mode.value !== 'format'
  || outputMode.value,
))

/** 切换工具模式并重置模式相关状态。 */
function setMode(nextMode: JsonMode) {
  if (mode.value === nextMode) {
    return
  }

  mode.value = nextMode
  error.value = null
  errorInput.value = ''
}

/** 根据当前 JSON 模式执行对应操作。 */
function runOperation() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true
  const operation = mode.value

  try {
    const result = operation === 'format'
      ? formatJson(input.value, { indent: indent.value })
      : operation === 'compress'
        ? compressJson(input.value)
        : operation === 'flatten'
          ? flattenJson(input.value, { indent: indent.value })
          : unflattenJson(input.value, { indent: indent.value })

    if (!result.ok) {
      error.value = result.error
      errorInput.value = input.value
      return
    }

    if ('formatted' in result.value) {
      output.value = result.value.formatted
    } else if ('compressed' in result.value) {
      output.value = result.value.compressed
    } else if ('flattened' in result.value) {
      output.value = result.value.flattened
    } else {
      output.value = result.value.unflattened
    }
    outputMode.value = operation
    error.value = null
    errorInput.value = ''
  } finally {
    isProcessing.value = false
  }
}

/** 同步 JSON 编辑区和错误高亮层的滚动位置。 */
function syncEditorScroll(event: Event) {
  const editor = event.currentTarget

  if (!(editor instanceof HTMLTextAreaElement)) {
    return
  }

  editorScrollTop.value = editor.scrollTop
  editorScrollLeft.value = editor.scrollLeft
}

/** 清空当前工具的输入、结果和错误状态。 */
function clearAll() {
  input.value = ''
  indent.value = 2
  output.value = ''
  outputMode.value = null
  error.value = null
  errorInput.value = ''
  mode.value = 'format'
  editorScrollTop.value = 0
  editorScrollLeft.value = 0

  if (inputEditor.value) {
    inputEditor.value.scrollTop = 0
    inputEditor.value.scrollLeft = 0
  }
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split json-workbench-tool">
    <ToolInputPanel title="JSON 输入" description="输入或粘贴标准 JSON，选择处理方式后在本地完成操作。">
      <div class="tool-field">
        <span class="tool-field__label">处理方式</span>
        <div class="json-workbench-tool__mode-tabs" role="group" aria-label="JSON 处理方式">
          <button
            v-for="option in modeOptions"
            :key="option.value"
            type="button"
            class="json-workbench-tool__mode-tab"
            :class="{ 'json-workbench-tool__mode-tab--active': mode === option.value }"
            :aria-pressed="mode === option.value"
            :disabled="isProcessing"
            @click="setMode(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">JSON 文本</span>
        <div class="json-workbench-tool__editor">
          <pre
            class="json-workbench-tool__editor-highlights"
            aria-hidden="true"
            :style="editorHighlightStyle"
          ><code><span
            v-for="(line, lineIndex) in inputLines"
            :key="lineIndex"
            class="json-workbench-tool__editor-highlight-line"
            :class="{ 'json-workbench-tool__editor-highlight-line--error': lineIndex + 1 === highlightedErrorLine }"
          >{{ line || ' ' }}</span></code></pre>
          <textarea
            ref="inputEditor"
            v-model="input"
            class="tool-textarea tool-textarea--code json-workbench-tool__input"
            rows="14"
            placeholder='例如：{"name":"Tool Deck","items":[1,2,3]}'
            :aria-label="inputLabel"
            spellcheck="false"
            @scroll="syncEditorScroll"
          />
        </div>
      </label>

      <label v-if="mode !== 'compress'" class="tool-field">
        <span class="tool-field__label">缩进方式</span>
        <select v-model="indent" class="tool-select" aria-label="JSON 缩进方式">
          <option :value="2">2 个空格</option>
          <option :value="4">4 个空格</option>
          <option value="tab">Tab</option>
        </select>
      </label>

      <p class="tool-note">{{ inputNote }}</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="runOperation">{{ actionLabel }}</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="`${outputModeLabel}结果`"
      :status="status"
      :error="error"
      :empty-text="emptyText"
      :processing-text="processingText"
    >
      <pre class="json-workbench-tool__output"><code>{{ output }}</code></pre>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>

    <section v-if="error && output" class="tool-panel json-workbench-tool__preserved-result" aria-label="上一次成功结果">
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留 · {{ outputModeLabel }}</span>
      </header>
      <p class="tool-note">本次{{ currentModeLabel }}失败，下面仍是上一次成功生成的{{ outputModeLabel }}结果，不代表当前输入已经处理成功。</p>
      <pre class="json-workbench-tool__output json-workbench-tool__output--preserved"><code>{{ output }}</code></pre>
      <div class="tool-panel__actions">
        <CopyButton :text="output" />
      </div>
    </section>
  </div>
</template>
