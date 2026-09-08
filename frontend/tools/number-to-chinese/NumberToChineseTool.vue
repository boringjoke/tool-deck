<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  convertNumberChinese,
  type NumberChineseMode,
} from '~/core/number-to-chinese'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const modeOptions: readonly { value: NumberChineseMode; label: string }[] = [
  { value: 'number-to-chinese', label: '数字转大写数字' },
  { value: 'amount-to-chinese', label: '数字转大写金额' },
  { value: 'chinese-to-number', label: '大写转阿拉伯数字' },
]

const mode = ref<NumberChineseMode>('number-to-chinese')
const input = ref('')
const output = ref('')
const outputMode = ref<NumberChineseMode | null>(null)
const error = ref<ToolError | null>(null)
const isProcessing = ref(false)

/** 获取当前工具模式的显示名称。 */
function getModeLabel(value: NumberChineseMode): string {
  switch (value) {
    case 'number-to-chinese':
      return '数字转大写数字'
    case 'amount-to-chinese':
      return '数字转大写金额'
    case 'chinese-to-number':
      return '大写转阿拉伯数字'
  }
}

const currentModeLabel = computed(() => getModeLabel(mode.value))
const outputModeLabel = computed(() => getModeLabel(outputMode.value ?? mode.value))
const inputLabel = computed(() => mode.value === 'chinese-to-number' ? '中文大写数字或金额' : '阿拉伯数字')
const placeholder = computed(() => mode.value === 'chinese-to-number'
  ? '例如：壹万零壹元零伍分'
  : mode.value === 'amount-to-chinese'
    ? '例如：10001.05'
    : '例如：10001.05')
const inputNote = computed(() => {
  switch (mode.value) {
    case 'number-to-chinese':
      return '只接受标准十进制数字；小数按位转换，并保留输入的小数位。'
    case 'amount-to-chinese':
      return '金额使用元、角、分；最多两位小数，不会自动截断或四舍五入。'
    case 'chinese-to-number':
      return '支持中文大写数字和中文大写金额，使用规范的零、壹、贰等字符。'
  }
})
const actionLabel = computed(() => '开始转换')
const processingText = computed(() => `正在${currentModeLabel.value}，请稍候。`)
const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : `输入内容后点击“${actionLabel.value}”，结果会显示在这里。`)

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
  || mode.value !== 'number-to-chinese',
))

/** 切换工具模式并重置模式相关状态。 */
function setMode(nextMode: NumberChineseMode) {
  if (mode.value === nextMode) {
    return
  }

  mode.value = nextMode
  input.value = ''
  error.value = null
}

/** 执行当前工具配置的转换操作。 */
function runConversion() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true

  try {
    const result = convertNumberChinese({ mode: mode.value, value: input.value })

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
  mode.value = 'number-to-chinese'
  input.value = ''
  output.value = ''
  outputMode.value = null
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split number-to-chinese-tool">
    <ToolInputPanel title="转换配置" description="选择转换方式，在浏览器本地完成数字与中文大写文本转换。">
      <div class="tool-field">
        <span class="tool-field__label">转换方式</span>
        <div class="number-to-chinese-tool__mode-tabs" role="group" aria-label="数字转换方式">
          <button
            v-for="option in modeOptions"
            :key="option.value"
            type="button"
            class="number-to-chinese-tool__mode-tab"
            :class="{ 'number-to-chinese-tool__mode-tab--active': mode === option.value }"
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
          class="tool-textarea tool-textarea--code number-to-chinese-tool__input"
          rows="10"
          :placeholder="placeholder"
          :aria-label="inputLabel"
          spellcheck="false"
        />
      </label>

      <p class="tool-note">{{ inputNote }}</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="runConversion">{{ actionLabel }}</button>
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
      <div class="output-block output-block--prominent number-to-chinese-tool__output">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>

    <section v-if="error && output" class="tool-panel number-to-chinese-tool__preserved-result" aria-label="上一次成功结果">
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留 · {{ outputModeLabel }}</span>
      </header>
      <p class="tool-note">本次{{ currentModeLabel }}失败，下面仍是上一次成功生成的{{ outputModeLabel }}结果，不代表当前输入已经处理成功。</p>
      <div class="output-block number-to-chinese-tool__output number-to-chinese-tool__output--preserved">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <div class="tool-panel__actions">
        <CopyButton :text="output" />
      </div>
    </section>
  </div>
</template>
