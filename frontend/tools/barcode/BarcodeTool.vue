<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  createBarcodeDownloadFileName,
  createBarcodeSvgDataUrl,
  downloadBarcodePng,
  downloadBarcodeSvg,
  renderBarcodeSvg,
  type BarcodeExportFormat,
} from '~/adapters/barcode'
import {
  BARCODE_FORMATS,
  BARCODE_FORMAT_LABELS,
  DEFAULT_BARCODE_FORMAT,
  getBarcodeFormatLabel,
  validateBarcodeInput,
  type BarcodeFormat,
  type BarcodeValue,
} from '~/core/barcode'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const content = ref('')
const format = ref<BarcodeFormat>(DEFAULT_BARCODE_FORMAT)
const result = ref<(BarcodeValue & { svg: string }) | null>(null)
const error = ref<ToolError | null>(null)
const downloadNotice = ref('')
const isGenerating = ref(false)
const exportingFormat = ref<BarcodeExportFormat | null>(null)

const formatDescriptions: Readonly<Record<BarcodeFormat, string>> = {
  CODE128: '可见 ASCII 字符，最多 80 个字符；会保留原始空格。',
  CODE39: '大写字母、数字、空格和 - . $ / + %，最多 40 个字符。',
  EAN13: '输入 12 位主体自动补校验位，或输入 13 位完整编码进行校验。',
  UPC: '输入 11 位主体自动补校验位，或输入 12 位完整编码进行校验。',
}

const status = computed<ToolUiStatus>(() => {
  if (isGenerating.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return result.value ? 'success' : 'idle'
})

const formatDescription = computed(() => formatDescriptions[format.value])
const previewSource = computed(() => result.value
  ? createBarcodeSvgDataUrl(result.value.svg)
  : '')
const hasPendingChanges = computed(() => Boolean(
  result.value && (result.value.content !== content.value || result.value.format !== format.value),
))
const resultStateLabel = computed(() => {
  if (isGenerating.value) {
    return '正在生成新预览'
  }

  return error.value || hasPendingChanges.value ? '上一次成功结果' : '当前条形码预览'
})
const inputMode = computed(() => format.value === 'EAN13' || format.value === 'UPC'
  ? 'numeric'
  : 'text')
const hasResettableState = computed(() => Boolean(
  content.value || format.value !== DEFAULT_BARCODE_FORMAT || result.value || error.value || downloadNotice.value,
))

/** 按当前输入和码制生成条形码 SVG 预览。 */
function generate() {
  if (isGenerating.value) {
    return
  }

  isGenerating.value = true
  error.value = null
  downloadNotice.value = ''

  const validated = validateBarcodeInput(content.value, { format: format.value })
  if (!validated.ok) {
    error.value = validated.error
    isGenerating.value = false
    return
  }

  const rendered = renderBarcodeSvg(validated.value)
  if (!rendered.ok) {
    error.value = rendered.error
    isGenerating.value = false
    return
  }

  result.value = {
    ...validated.value,
    svg: rendered.value,
  }
  isGenerating.value = false
}

/** 将上一次成功生成的条形码 SVG 下载到本地。 */
function downloadSvg() {
  if (!result.value || isGenerating.value || exportingFormat.value) {
    return
  }

  downloadNotice.value = ''
  exportingFormat.value = 'svg'
  const downloadResult = downloadBarcodeSvg(
    result.value.svg,
    createBarcodeDownloadFileName('svg'),
  )
  downloadNotice.value = downloadResult.message
  exportingFormat.value = null
}

/** 将上一次成功生成的条形码 PNG 下载到本地。 */
function downloadPng() {
  if (!result.value || isGenerating.value || exportingFormat.value) {
    return
  }

  downloadNotice.value = ''
  exportingFormat.value = 'png'
  const downloadResult = downloadBarcodePng(
    result.value,
    createBarcodeDownloadFileName('png'),
  )
  downloadNotice.value = downloadResult.message
  exportingFormat.value = null
}

/** 清空条形码输入、结果和错误状态，并恢复默认 CODE128 码制。 */
function clearAll() {
  content.value = ''
  format.value = DEFAULT_BARCODE_FORMAT
  result.value = null
  error.value = null
  downloadNotice.value = ''
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split barcode-tool">
    <ToolInputPanel title="生成条形码" description="输入内容，在浏览器本地生成条形码，不会上传或保存内容。">
      <label class="tool-field barcode-tool__content-field">
        <span class="tool-field__label">条形码内容</span>
        <textarea
          v-model="content"
          class="tool-textarea barcode-tool__content-input"
          rows="6"
          :inputmode="inputMode"
          aria-label="条形码内容"
          aria-describedby="barcode-format-note"
          placeholder="例如：ABC-123 或 400638133393"
        />
      </label>

      <div class="tool-field-grid tool-field-grid--two barcode-tool__settings">
        <label class="tool-field">
          <span class="tool-field__label">条形码码制</span>
          <select v-model="format" class="tool-select" aria-label="条形码码制">
            <option v-for="option in BARCODE_FORMATS" :key="option" :value="option">
              {{ BARCODE_FORMAT_LABELS[option] }}
            </option>
          </select>
        </label>

        <div class="barcode-tool__fixed-settings">
          <span class="tool-field__label">当前规则</span>
          <p id="barcode-format-note" class="tool-note">{{ formatDescription }}</p>
        </div>
      </div>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isGenerating" @click="generate">
          {{ isGenerating ? '生成中…' : `生成${getBarcodeFormatLabel(format)}` }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="条形码预览"
      :status="status"
      :error="error"
      :show-content-on-processing="Boolean(result)"
      :preserve-content-on-error="true"
      empty-text="输入条形码内容并选择码制后点击“生成”，预览会显示在这里。"
    >
      <div v-if="result" class="barcode-tool__result">
        <p class="barcode-tool__result-label">{{ resultStateLabel }}</p>
        <div class="barcode-tool__preview">
          <img :src="previewSource" alt="已生成条形码预览">
        </div>
        <dl class="barcode-tool__meta">
          <div>
            <dt>码制</dt>
            <dd>{{ getBarcodeFormatLabel(result.format) }}</dd>
          </div>
          <div>
            <dt>最终编码</dt>
            <dd>{{ result.encodedValue }}</dd>
          </div>
          <div>
            <dt>条宽</dt>
            <dd>2 px</dd>
          </div>
          <div>
            <dt>条高</dt>
            <dd>100 px</dd>
          </div>
        </dl>
        <p v-if="error" class="tool-note barcode-tool__stale-note" role="status">
          当前内容生成失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges" class="tool-note barcode-tool__stale-note" role="status">
          当前输入或码制已修改，请重新生成条形码。
        </p>
      </div>
      <p v-if="downloadNotice" class="tool-note" role="status">{{ downloadNotice }}</p>

      <template #actions>
        <button
          type="button"
          class="button button--secondary"
          :disabled="!result || isGenerating || Boolean(exportingFormat)"
          @click="downloadSvg"
        >
          {{ exportingFormat === 'svg' ? '导出中…' : '导出 SVG' }}
        </button>
        <button
          type="button"
          class="button button--secondary"
          :disabled="!result || isGenerating || Boolean(exportingFormat)"
          @click="downloadPng"
        >
          {{ exportingFormat === 'png' ? '导出中…' : '导出 PNG' }}
        </button>
      </template>
    </ToolResultPanel>
  </div>
</template>
