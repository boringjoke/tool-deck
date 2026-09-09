<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  calculateColorContrast,
  COLOR_FORMATS,
  COLOR_FORMAT_LABELS,
  convertColor,
  DEFAULT_COLOR_FORMAT,
  formatColorValue,
  isColorFormat,
  type ColorConversion,
  type ColorContrast,
  type ColorFormat,
} from '~/core/color'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

interface ContrastRecord {
  format: ColorFormat
  foreground: string
  background: string
  result: ColorContrast
}

const format = ref<ColorFormat>(DEFAULT_COLOR_FORMAT)
const input = ref('')
const pickerValue = ref('#000000')
const conversion = ref<ColorConversion | null>(null)
const conversionError = ref<ToolError | null>(null)
const isConverting = ref(false)

const contrastFormat = ref<ColorFormat>(DEFAULT_COLOR_FORMAT)
const foregroundInput = ref('')
const backgroundInput = ref('')
const foregroundPickerValue = ref('#000000')
const backgroundPickerValue = ref('#FFFFFF')
const contrastRecord = ref<ContrastRecord | null>(null)
const contrastError = ref<ToolError | null>(null)
const isCheckingContrast = ref(false)

const conversionPlaceholder = computed(() => {
  if (format.value === 'RGB') return '例如：rgb(59, 130, 246)'
  if (format.value === 'HSL') return '例如：hsl(217, 91%, 60%)'
  return '例如：#3B82F6 或 #3B82F680'
})

const conversionStatus = computed<ToolUiStatus>(() => {
  if (isConverting.value) return 'processing'
  if (conversionError.value) return 'error'
  return conversion.value ? 'success' : 'idle'
})

const contrastStatus = computed<ToolUiStatus>(() => {
  if (isCheckingContrast.value) return 'processing'
  if (contrastError.value) return 'error'
  return contrastRecord.value ? 'success' : 'idle'
})

const conversionPending = computed(() => Boolean(
  conversion.value
  && (conversion.value.input !== input.value || conversion.value.format !== format.value),
))

const contrastPending = computed(() => Boolean(
  contrastRecord.value
  && (
    contrastRecord.value.format !== contrastFormat.value
    || contrastRecord.value.foreground !== foregroundInput.value
    || contrastRecord.value.background !== backgroundInput.value
  ),
))

const outputRows = computed(() => conversion.value
  ? [
      { key: 'hex', label: 'HEX', value: conversion.value.outputs.hex },
      { key: 'rgb', label: 'RGB / RGBA', value: conversion.value.outputs.rgb },
      { key: 'hsl', label: 'HSL / HSLA', value: conversion.value.outputs.hsl },
    ]
  : [])

const contrastCopyText = computed(() => {
  if (!contrastRecord.value) return ''

  const result = contrastRecord.value.result
  return [
    `前景色：${contrastRecord.value.foreground}`,
    `背景色：${contrastRecord.value.background}`,
    `对比度：${result.ratioText}`,
    `普通文本 AA：${result.normalAa ? '通过' : '未通过'}`,
    `大号文本 AA：${result.largeAa ? '通过' : '未通过'}`,
    `普通文本 AAA：${result.normalAaa ? '通过' : '未通过'}`,
    `大号文本 AAA：${result.largeAaa ? '通过' : '未通过'}`,
  ].join('\n')
})

const hasResettableState = computed(() => Boolean(
  input.value
  || conversion.value
  || conversionError.value
  || format.value !== DEFAULT_COLOR_FORMAT
  || foregroundInput.value
  || backgroundInput.value
  || contrastRecord.value
  || contrastError.value
  || contrastFormat.value !== DEFAULT_COLOR_FORMAT
  || foregroundPickerValue.value !== '#000000'
  || backgroundPickerValue.value !== '#FFFFFF',
))

/** 处理转换格式变化并在输入有效时同步输入格式。 */
function handleFormatChange(event: Event) {
  const nextFormat = (event.target as HTMLSelectElement).value
  if (!isColorFormat(nextFormat)) return

  const previousFormat = format.value
  const parsed = input.value
    ? convertColor({ format: previousFormat, value: input.value })
    : null

  format.value = nextFormat
  if (parsed?.ok) {
    input.value = formatColorValue(parsed.value.color, nextFormat)
  }
  conversionError.value = null
}

/** 将原生颜色选择器的结果写入当前转换格式输入框。 */
function handlePickerChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  const picked = convertColor({ format: 'HEX', value })
  if (!picked.ok) return

  pickerValue.value = value
  input.value = formatColorValue(picked.value.color, format.value)
  conversionError.value = null
}

/** 执行当前颜色输入的格式转换。 */
function runConversion() {
  if (isConverting.value) return

  isConverting.value = true
  conversionError.value = null

  try {
    const result = convertColor({ format: format.value, value: input.value })
    if (!result.ok) {
      conversionError.value = result.error
      return
    }

    conversion.value = result.value
    pickerValue.value = result.value.outputs.hex.slice(0, 7)
  } finally {
    isConverting.value = false
  }
}

/** 处理对比度格式变化并在两侧输入有效时同步输入格式。 */
function handleContrastFormatChange(event: Event) {
  const nextFormat = (event.target as HTMLSelectElement).value
  if (!isColorFormat(nextFormat)) return

  const previousFormat = contrastFormat.value
  const foreground = foregroundInput.value
    ? convertColor({ format: previousFormat, value: foregroundInput.value })
    : null
  const background = backgroundInput.value
    ? convertColor({ format: previousFormat, value: backgroundInput.value })
    : null

  contrastFormat.value = nextFormat
  if (foreground?.ok) {
    foregroundInput.value = formatColorValue(foreground.value.color, nextFormat)
  }
  if (background?.ok) {
    backgroundInput.value = formatColorValue(background.value.color, nextFormat)
  }
  contrastError.value = null
}

/** 将原生颜色选择器的结果写入前景色输入框。 */
function handleForegroundPickerChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  const picked = convertColor({ format: 'HEX', value })
  if (!picked.ok) return

  foregroundPickerValue.value = value
  foregroundInput.value = formatColorValue(picked.value.color, contrastFormat.value)
  contrastError.value = null
}

/** 将原生颜色选择器的结果写入背景色输入框。 */
function handleBackgroundPickerChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  const picked = convertColor({ format: 'HEX', value })
  if (!picked.ok) return

  backgroundPickerValue.value = value
  backgroundInput.value = formatColorValue(picked.value.color, contrastFormat.value)
  contrastError.value = null
}

/** 执行前景色与背景色的基础对比度检查。 */
function runContrastCheck() {
  if (isCheckingContrast.value) return

  isCheckingContrast.value = true
  contrastError.value = null

  try {
    const result = calculateColorContrast({
      foreground: { format: contrastFormat.value, value: foregroundInput.value },
      background: { format: contrastFormat.value, value: backgroundInput.value },
    })

    if (!result.ok) {
      contrastError.value = result.error
      return
    }

    contrastRecord.value = {
      format: contrastFormat.value,
      foreground: foregroundInput.value,
      background: backgroundInput.value,
      result: result.value,
    }
  } finally {
    isCheckingContrast.value = false
  }
}

/** 清空颜色转换、对比度和颜色选择器状态。 */
function clearAll() {
  format.value = DEFAULT_COLOR_FORMAT
  input.value = ''
  pickerValue.value = '#000000'
  conversion.value = null
  conversionError.value = null
  isConverting.value = false

  contrastFormat.value = DEFAULT_COLOR_FORMAT
  foregroundInput.value = ''
  backgroundInput.value = ''
  foregroundPickerValue.value = '#000000'
  backgroundPickerValue.value = '#FFFFFF'
  contrastRecord.value = null
  contrastError.value = null
  isCheckingContrast.value = false
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split color-tool">
    <ToolInputPanel title="颜色转换" description="输入颜色格式，在浏览器本地完成转换，不会上传或保存内容。">
      <label class="tool-field">
        <span class="tool-field__label">输入格式</span>
        <select :value="format" class="tool-select" aria-label="颜色输入格式" @change="handleFormatChange">
          <option v-for="option in COLOR_FORMATS" :key="option" :value="option">
            {{ COLOR_FORMAT_LABELS[option] }}
          </option>
        </select>
      </label>

      <label class="tool-field">
        <span class="tool-field__label">颜色值</span>
        <input
          v-model="input"
          class="tool-input color-tool__input"
          type="text"
          inputmode="text"
          autocomplete="off"
          :placeholder="conversionPlaceholder"
          aria-label="颜色值"
          aria-describedby="color-format-note"
        >
      </label>

      <div class="color-tool__picker-row">
        <label class="tool-field color-tool__picker-field">
          <span class="tool-field__label">辅助取色</span>
          <input
            class="color-tool__picker"
            type="color"
            :value="pickerValue"
            aria-label="选择颜色"
            @input="handlePickerChange"
          >
        </label>
        <p class="tool-note">原生取色器只选择不透明颜色；透明度请在文本格式中输入。</p>
      </div>

      <p id="color-format-note" class="tool-note">支持 HEX、RGB/RGBA 和 HSL/HSLA；数值越界时不会自动截断或修正。</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isConverting" @click="runConversion">
          {{ isConverting ? '转换中…' : '转换颜色' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="转换结果"
      :status="conversionStatus"
      :error="conversionError"
      :show-content-on-processing="Boolean(conversion)"
      :preserve-content-on-error="true"
      empty-text="输入颜色值并选择格式后点击“转换颜色”，结果会显示在这里。"
    >
      <div v-if="conversion" class="color-tool__conversion-result">
        <div class="color-tool__swatch-frame">
          <div
            class="color-tool__swatch"
            :style="{ backgroundColor: conversion.outputs.rgb }"
            role="img"
            :aria-label="`颜色预览 ${conversion.outputs.hex}`"
          />
        </div>

        <p v-if="conversionPending" class="tool-note color-tool__stale-note" role="status">
          当前颜色或格式已改变，下面仍是上一次成功转换的结果；点击“转换颜色”更新结果。
        </p>

        <div class="color-tool__output-list">
          <div v-for="row in outputRows" :key="row.key" class="color-tool__output-row">
            <span class="color-tool__output-label">{{ row.label }}</span>
            <code>{{ row.value }}</code>
            <CopyButton :text="row.value" :label="`复制 ${row.label}`" />
          </div>
        </div>
      </div>
    </ToolResultPanel>

    <ToolInputPanel title="基础对比度" description="输入前景色和背景色，查看 WCAG 对比度提示。">
      <label class="tool-field">
        <span class="tool-field__label">输入格式</span>
        <select
          :value="contrastFormat"
          class="tool-select"
          aria-label="对比度输入格式"
          @change="handleContrastFormatChange"
        >
          <option v-for="option in COLOR_FORMATS" :key="option" :value="option">
            {{ COLOR_FORMAT_LABELS[option] }}
          </option>
        </select>
      </label>

      <div class="tool-field-grid tool-field-grid--two color-tool__contrast-fields">
        <label class="tool-field">
          <span class="tool-field__label">前景色</span>
          <input
            v-model="foregroundInput"
            class="tool-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            placeholder="#111827"
            aria-label="对比度前景色"
          >
        </label>
        <label class="tool-field">
          <span class="tool-field__label">背景色</span>
          <input
            v-model="backgroundInput"
            class="tool-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            placeholder="#FFFFFF"
            aria-label="对比度背景色"
          >
        </label>
      </div>

      <div class="color-tool__picker-grid">
        <label class="tool-field color-tool__picker-field">
          <span class="tool-field__label">选择前景色</span>
          <input
            v-model="foregroundPickerValue"
            class="color-tool__picker"
            type="color"
            aria-label="选择对比度前景色"
            @input="handleForegroundPickerChange"
          >
        </label>
        <label class="tool-field color-tool__picker-field">
          <span class="tool-field__label">选择背景色</span>
          <input
            v-model="backgroundPickerValue"
            class="color-tool__picker"
            type="color"
            aria-label="选择对比度背景色"
            @input="handleBackgroundPickerChange"
          >
        </label>
      </div>

      <p class="tool-note">对比度检查只接受不透明颜色；透明度转换仍可在上方完成。</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isCheckingContrast" @click="runContrastCheck">
          {{ isCheckingContrast ? '检查中…' : '检查对比度' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="对比度结果"
      :status="contrastStatus"
      :error="contrastError"
      :show-content-on-processing="Boolean(contrastRecord)"
      :preserve-content-on-error="true"
      empty-text="输入前景色和背景色后点击“检查对比度”，结果会显示在这里。"
    >
      <div v-if="contrastRecord" class="color-tool__contrast-result">
        <div class="color-tool__contrast-swatches" aria-label="前景色和背景色预览">
          <div class="color-tool__contrast-swatch-card">
            <div
              class="color-tool__contrast-swatch"
              :style="{ backgroundColor: formatColorValue(contrastRecord.result.foreground, 'HEX') }"
              role="img"
              :aria-label="`前景色 ${formatColorValue(contrastRecord.result.foreground, 'HEX')}`"
            />
            <span>前景色</span>
          </div>
          <div class="color-tool__contrast-swatch-card">
            <div
              class="color-tool__contrast-swatch"
              :style="{ backgroundColor: formatColorValue(contrastRecord.result.background, 'HEX') }"
              role="img"
              :aria-label="`背景色 ${formatColorValue(contrastRecord.result.background, 'HEX')}`"
            />
            <span>背景色</span>
          </div>
        </div>

        <div class="color-tool__ratio">
          <span class="color-tool__ratio-label">对比度比例</span>
          <strong>{{ contrastRecord.result.ratioText }}</strong>
        </div>

        <div class="color-tool__contrast-grid">
          <div :class="['color-tool__contrast-check', { 'color-tool__contrast-check--pass': contrastRecord.result.normalAa }]">
            <span>普通文本 · AA</span>
            <strong>{{ contrastRecord.result.normalAa ? '通过' : '未通过' }}</strong>
          </div>
          <div :class="['color-tool__contrast-check', { 'color-tool__contrast-check--pass': contrastRecord.result.largeAa }]">
            <span>大号文本 · AA</span>
            <strong>{{ contrastRecord.result.largeAa ? '通过' : '未通过' }}</strong>
          </div>
          <div :class="['color-tool__contrast-check', { 'color-tool__contrast-check--pass': contrastRecord.result.normalAaa }]">
            <span>普通文本 · AAA</span>
            <strong>{{ contrastRecord.result.normalAaa ? '通过' : '未通过' }}</strong>
          </div>
          <div :class="['color-tool__contrast-check', { 'color-tool__contrast-check--pass': contrastRecord.result.largeAaa }]">
            <span>大号文本 · AAA</span>
            <strong>{{ contrastRecord.result.largeAaa ? '通过' : '未通过' }}</strong>
          </div>
        </div>

        <p v-if="contrastPending" class="tool-note color-tool__stale-note" role="status">
          当前对比度输入或格式已改变，下面仍是上一次成功检查的结果；点击“检查对比度”更新结果。
        </p>
      </div>

      <template #actions>
        <CopyButton :text="contrastCopyText" label="复制对比度" />
      </template>
    </ToolResultPanel>
  </div>
</template>
