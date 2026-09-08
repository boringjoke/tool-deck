<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  convertSimplifiedTraditional,
  type SimplifiedTraditionalMode,
} from '~/core/simplified-traditional'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const modeOptions: readonly { value: SimplifiedTraditionalMode; label: string }[] = [
  { value: 'simplified-to-traditional', label: '简体转繁体' },
  { value: 'traditional-to-simplified', label: '繁体转简体' },
]

const mode = ref<SimplifiedTraditionalMode>('simplified-to-traditional')
const input = ref('')
const output = ref('')
const outputMode = ref<SimplifiedTraditionalMode | null>(null)
const error = ref<ToolError | null>(null)
const isProcessing = ref(false)

/** 获取当前工具模式的显示名称。 */
function getModeLabel(value: SimplifiedTraditionalMode): string {
  return value === 'simplified-to-traditional' ? '简体转繁体' : '繁体转简体'
}

const currentModeLabel = computed(() => getModeLabel(mode.value))
const outputModeLabel = computed(() => getModeLabel(outputMode.value ?? mode.value))
const inputLabel = computed(() => mode.value === 'simplified-to-traditional' ? '简体中文文本' : '繁体中文文本')
const placeholder = computed(() => mode.value === 'simplified-to-traditional'
  ? '例如：开发工具和用户界面。'
  : '例如：開發工具和使用者介面。')
const inputNote = computed(() => mode.value === 'simplified-to-traditional'
  ? '使用 OpenCC 标准词库转换为标准繁体，不包含台湾或香港地域词。'
  : '使用 OpenCC 标准词库转换为简体，不进行语言识别或翻译。')
const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '输入文本后点击“开始转换”，结果会显示在这里。')

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

const hasResettableState = computed(() => Boolean(
  input.value
  || output.value
  || outputMode.value
  || error.value
  || mode.value !== 'simplified-to-traditional',
))

/** 切换工具模式并重置模式相关状态。 */
function setMode(nextMode: SimplifiedTraditionalMode) {
  if (mode.value === nextMode) {
    return
  }

  mode.value = nextMode
  input.value = ''
  error.value = null
}

/** 执行当前工具配置的转换操作。 */
async function runConversion() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true

  try {
    const result = await convertSimplifiedTraditional({ mode: mode.value, value: input.value })

    if (!result.ok) {
      error.value = result.error
      return
    }

    output.value = result.value
    outputMode.value = mode.value
    error.value = null
  } finally {
    isProcessing.value = false
  }
}

/** 清空当前工具的输入、结果和错误状态。 */
function clearAll() {
  mode.value = 'simplified-to-traditional'
  input.value = ''
  output.value = ''
  outputMode.value = null
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split simplified-traditional-tool">
    <ToolInputPanel title="转换配置" description="选择转换方向，在浏览器本地完成简繁文本转换。">
      <div class="tool-field">
        <span class="tool-field__label">转换方向</span>
        <div class="simplified-traditional-tool__mode-tabs" role="group" aria-label="简繁转换方向">
          <button
            v-for="option in modeOptions"
            :key="option.value"
            type="button"
            class="simplified-traditional-tool__mode-tab"
            :class="{ 'simplified-traditional-tool__mode-tab--active': mode === option.value }"
            :aria-pressed="mode === option.value"
            :disabled="isProcessing"
            @click="setMode(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">{{ inputLabel }}</span>
        <textarea
          v-model="input"
          class="tool-textarea tool-textarea--code simplified-traditional-tool__input"
          rows="10"
          :placeholder="placeholder"
          :aria-label="inputLabel"
          spellcheck="false"
        />
      </label>

      <p class="tool-note">{{ inputNote }}</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="runConversion">开始转换</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="`${outputModeLabel}结果`"
      :status="status"
      :error="error"
      :empty-text="emptyText"
      :processing-text="`正在${currentModeLabel}，请稍候。`"
    >
      <div class="output-block output-block--prominent simplified-traditional-tool__output">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>

    <section v-if="error && output" class="tool-panel simplified-traditional-tool__preserved-result" aria-label="上一次成功结果">
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留 · {{ outputModeLabel }}</span>
      </header>
      <p class="tool-note">本次{{ currentModeLabel }}失败，下面仍是上一次成功生成的{{ outputModeLabel }}结果，不代表当前输入已经处理成功。</p>
      <div class="output-block simplified-traditional-tool__output simplified-traditional-tool__output--preserved">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <div class="tool-panel__actions">
        <CopyButton :text="output" />
      </div>
    </section>
  </div>
</template>
