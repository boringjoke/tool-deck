<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  convertMorse,
  getMorseInputLength,
  MORSE_MAX_INPUT_LENGTH,
  type MorseDirection,
} from '~/core/morse-code'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const directionOptions: readonly { value: MorseDirection; label: string }[] = [
  { value: 'text-to-morse', label: '文本转摩斯码' },
  { value: 'morse-to-text', label: '摩斯码转文本' },
]

const direction = ref<MorseDirection>('text-to-morse')
const input = ref('')
const output = ref('')
const outputDirection = ref<MorseDirection | null>(null)
const error = ref<ToolError | null>(null)
const isProcessing = ref(false)

const inputLength = computed(() => getMorseInputLength(input.value))
const isInputOverLimit = computed(() => inputLength.value > MORSE_MAX_INPUT_LENGTH)
const inputLabel = computed(() => direction.value === 'text-to-morse' ? '普通文本' : '摩斯码')
const outputDirectionLabel = computed(() => getDirectionLabel(outputDirection.value ?? direction.value))
const placeholder = computed(() => direction.value === 'text-to-morse'
  ? '例如：Hello, World!'
  : '例如：.... . .-.. .-.. --- / .-- --- .-. .-.. -..')
const inputNote = computed(() => direction.value === 'text-to-morse'
  ? '支持英文字母、数字和已列出的常用标点；中文和其他符号不会自动转码。'
  : '字符代码使用空格分隔，单词使用“/”分隔；结果会统一输出大写字母。')
const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '输入内容后点击“开始转换”，结果会显示在这里。')
const status = computed<ToolUiStatus>(() => {
  if (isProcessing.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return output.value ? 'success' : 'idle'
})
const hasResettableState = computed(() => Boolean(
  input.value
  || output.value
  || outputDirection.value
  || error.value
  || direction.value !== 'text-to-morse',
))

/** 获取摩斯码工具转换方向的显示名称。 */
function getDirectionLabel(value: MorseDirection): string {
  return value === 'text-to-morse' ? '文本转摩斯码' : '摩斯码转文本'
}

/** 切换转换方向并清除不再适用的结果状态。 */
function setDirection(nextDirection: MorseDirection) {
  if (direction.value === nextDirection) {
    return
  }

  direction.value = nextDirection
  output.value = ''
  outputDirection.value = null
  error.value = null
}

/** 执行当前方向的摩斯码转换。 */
function runConversion() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true

  try {
    const result = convertMorse(input.value, { direction: direction.value })

    if (!result.ok) {
      error.value = result.error
      return
    }

    output.value = result.value.output
    outputDirection.value = direction.value
    error.value = null
  } finally {
    isProcessing.value = false
  }
}

/** 清空当前工具的输入、结果、方向和错误状态。 */
function clearAll() {
  direction.value = 'text-to-morse'
  input.value = ''
  output.value = ''
  outputDirection.value = null
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split morse-code-tool">
    <ToolInputPanel title="转换配置" description="选择转换方向，在浏览器本地完成国际摩斯码转换。">
      <div class="tool-field">
        <span class="tool-field__label">转换方向</span>
        <div class="morse-code-tool__mode-tabs" role="group" aria-label="摩斯码转换方向">
          <button
            v-for="option in directionOptions"
            :key="option.value"
            type="button"
            class="morse-code-tool__mode-tab"
            :class="{ 'morse-code-tool__mode-tab--active': direction === option.value }"
            :aria-pressed="direction === option.value"
            :disabled="isProcessing"
            @click="setDirection(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">{{ inputLabel }}</span>
        <textarea
          v-model="input"
          class="tool-textarea tool-textarea--code morse-code-tool__input"
          rows="10"
          :placeholder="placeholder"
          :aria-label="inputLabel"
          aria-describedby="morse-code-input-note morse-code-input-length"
          spellcheck="false"
        />
      </label>

      <div id="morse-code-input-length" class="morse-code-tool__input-meta" :class="{ 'morse-code-tool__input-meta--over': isInputOverLimit }">
        <span>当前输入：{{ inputLength }} / {{ MORSE_MAX_INPUT_LENGTH }} 个 Unicode 字符</span>
        <span v-if="isInputOverLimit">已超出上限</span>
      </div>
      <p id="morse-code-input-note" class="tool-note">{{ inputNote }}</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="runConversion">开始转换</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="`${outputDirectionLabel}结果`"
      :status="status"
      :error="error"
      :empty-text="emptyText"
      :processing-text="`正在${outputDirectionLabel}，请稍候。`"
      :preserve-content-on-error="Boolean(output)"
    >
      <p v-if="error && output" class="tool-note morse-code-tool__stale-note">
        本次{{ getDirectionLabel(direction) }}失败，下面仍是上一次成功生成的{{ outputDirectionLabel }}结果，不代表当前输入已经处理成功。
      </p>
      <div class="output-block output-block--prominent morse-code-tool__output">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>
  </div>
</template>
