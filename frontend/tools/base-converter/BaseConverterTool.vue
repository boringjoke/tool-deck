<script setup lang="ts">
import { computed, ref } from 'vue'
import { convertBase, MAX_BASE, MAX_INPUT_LENGTH, MIN_BASE } from '~/core/base-converter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const value = ref('')
const fromBase = ref(10)
const toBase = ref(16)
const uppercase = ref(true)
const addPrefix = ref(false)
const output = ref('')
const error = ref<ToolError | null>(null)

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  return output.value ? 'success' : 'idle'
})

const hasResettableState = computed(() => Boolean(
  value.value
  || output.value
  || error.value
  || fromBase.value !== 10
  || toBase.value !== 16
  || !uppercase.value
  || addPrefix.value,
))

/** 执行当前工具的日期或时间转换。 */
function convert() {
  const result = convertBase({
    value: value.value,
    fromBase: fromBase.value,
    toBase: toBase.value,
    uppercase: uppercase.value,
    addPrefix: addPrefix.value,
  })

  if (!result.ok) {
    output.value = ''
    error.value = result.error
    return
  }

  output.value = result.value
  error.value = null
}

/** 清空当前工具的输入、结果和错误状态。 */
function clearAll() {
  value.value = ''
  fromBase.value = 10
  toBase.value = 16
  uppercase.value = true
  addPrefix.value = false
  output.value = ''
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split base-converter-tool">
    <ToolInputPanel title="进制配置" description="支持 2–36 自定义进制、大整数、负数和匹配输入前缀。">
      <div class="tool-field-grid tool-field-grid--two">
        <label class="tool-field">
          <span class="tool-field__label">源进制（{{ MIN_BASE }}–{{ MAX_BASE }}）</span>
          <input v-model.number="fromBase" class="tool-input" type="number" :min="MIN_BASE" :max="MAX_BASE" step="1" aria-label="源进制">
        </label>
        <label class="tool-field">
          <span class="tool-field__label">目标进制（{{ MIN_BASE }}–{{ MAX_BASE }}）</span>
          <input v-model.number="toBase" class="tool-input" type="number" :min="MIN_BASE" :max="MAX_BASE" step="1" aria-label="目标进制">
        </label>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">整数文本（最多 {{ MAX_INPUT_LENGTH }} 个字符）</span>
        <textarea v-model="value" class="tool-textarea tool-textarea--code base-converter-tool__value" rows="5" placeholder="例如：0xFF 或 -1010" aria-label="待转换整数"></textarea>
      </label>

      <div class="tool-check-grid">
        <label class="tool-check-field"><input v-model="uppercase" type="checkbox"><span>输出大写字母</span></label>
        <label class="tool-check-field"><input v-model="addPrefix" type="checkbox"><span>输出 0b / 0o / 0x 前缀</span></label>
      </div>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" @click="convert">开始转换</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel title="转换结果" :status="status" :error="error" empty-text="输入整数并点击“开始转换”，结果会显示在这里。">
      <div class="output-block output-block--prominent">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>
  </div>
</template>
