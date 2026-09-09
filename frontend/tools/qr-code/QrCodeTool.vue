<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  createQrCodeDownloadFileName,
  downloadQrCodePng,
  downloadQrCodeSvg,
} from '~/adapters/qr-code'
import {
  DEFAULT_QR_CODE_SIZE,
  generateQrCode,
  getQrCodeUtf8ByteLength,
  QR_CODE_MAX_BYTES,
  QR_CODE_SIZES,
  type QrCodeExportFormat,
  type QrCodeSize,
  type QrCodeValue,
} from '~/core/qr-code'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const content = ref('')
const size = ref<QrCodeSize>(DEFAULT_QR_CODE_SIZE)
const result = ref<QrCodeValue | null>(null)
const error = ref<ToolError | null>(null)
const downloadNotice = ref('')
const isGenerating = ref(false)
const exportingFormat = ref<QrCodeExportFormat | null>(null)

const status = computed<ToolUiStatus>(() => {
  if (isGenerating.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return result.value ? 'success' : 'idle'
})

const byteLength = computed(() => getQrCodeUtf8ByteLength(content.value))
const isOverLimit = computed(() => byteLength.value > QR_CODE_MAX_BYTES)
const hasPendingChanges = computed(() => Boolean(
  result.value && (result.value.content !== content.value || result.value.size !== size.value),
))
const previewSource = computed(() => result.value
  ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.value.svg)}`
  : '')
const resultStateLabel = computed(() => {
  if (isGenerating.value) {
    return '正在生成新预览'
  }

  return error.value || hasPendingChanges.value ? '上一次成功结果' : '当前二维码预览'
})
const hasResettableState = computed(() => Boolean(
  content.value || result.value || error.value || downloadNotice.value,
))

/** 按当前文本和导出尺寸生成二维码预览。 */
async function generate() {
  if (isGenerating.value) {
    return
  }

  isGenerating.value = true
  error.value = null
  downloadNotice.value = ''

  const generated = await generateQrCode(content.value, { size: size.value })

  if (!generated.ok) {
    error.value = generated.error
    isGenerating.value = false
    return
  }

  result.value = generated.value
  isGenerating.value = false
}

/** 将上一次成功生成的二维码 SVG 下载到本地。 */
function downloadSvg() {
  if (!result.value || isGenerating.value || exportingFormat.value) {
    return
  }

  downloadNotice.value = ''
  exportingFormat.value = 'svg'
  const downloadResult = downloadQrCodeSvg(
    result.value.svg,
    createQrCodeDownloadFileName('svg'),
  )
  downloadNotice.value = downloadResult.message
  exportingFormat.value = null
}

/** 将上一次成功生成的二维码 PNG 下载到本地。 */
async function downloadPng() {
  if (!result.value || isGenerating.value || exportingFormat.value) {
    return
  }

  downloadNotice.value = ''
  exportingFormat.value = 'png'
  const generated = result.value
  const downloadResult = await downloadQrCodePng(
    generated.content,
    generated.size,
    createQrCodeDownloadFileName('png'),
  )
  downloadNotice.value = downloadResult.message
  exportingFormat.value = null
}

/** 清空二维码输入、结果和错误状态，但保留当前导出尺寸选择。 */
function clearAll() {
  content.value = ''
  result.value = null
  error.value = null
  downloadNotice.value = ''
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split qr-code-tool">
    <ToolInputPanel title="生成二维码" description="输入文本或 URL，在浏览器本地生成二维码，不会上传或保存内容。">
      <label class="tool-field qr-code-tool__content-field">
        <span class="tool-field__label">文本或 URL</span>
        <textarea
          v-model="content"
          class="tool-textarea qr-code-tool__content-input"
          rows="7"
          aria-label="二维码文本或 URL"
          aria-describedby="qr-code-byte-count qr-code-input-note"
          placeholder="例如：https://example.com"
        />
        <span
          id="qr-code-byte-count"
          class="qr-code-tool__byte-count"
          :class="{ 'qr-code-tool__byte-count--over': isOverLimit }"
        >
          {{ byteLength }} / {{ QR_CODE_MAX_BYTES }} UTF-8 字节
        </span>
      </label>

      <div class="tool-field-grid tool-field-grid--two qr-code-tool__settings">
        <label class="tool-field">
          <span class="tool-field__label">导出尺寸</span>
          <select v-model.number="size" class="tool-select" aria-label="二维码导出尺寸">
            <option v-for="option in QR_CODE_SIZES" :key="option" :value="option">
              {{ option }} 像素
            </option>
          </select>
        </label>

        <div class="qr-code-tool__fixed-settings">
          <span class="tool-field__label">固定设置</span>
          <p id="qr-code-input-note" class="tool-note">M 纠错级别 · 4 模块静区 · 黑白配色</p>
        </div>
      </div>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isGenerating" @click="generate">
          {{ isGenerating ? '生成中…' : '生成二维码' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="二维码预览"
      :status="status"
      :error="error"
      :show-content-on-processing="Boolean(result)"
      :preserve-content-on-error="true"
      empty-text="输入文本或 URL 后点击“生成二维码”，预览会显示在这里。"
    >
      <div v-if="result" class="qr-code-tool__result">
        <p class="qr-code-tool__result-label">{{ resultStateLabel }}</p>
        <div class="qr-code-tool__preview">
          <img :src="previewSource" alt="已生成二维码预览">
        </div>
        <dl class="qr-code-tool__meta">
          <div>
            <dt>内容字节</dt>
            <dd>{{ result.byteLength }}</dd>
          </div>
          <div>
            <dt>二维码版本</dt>
            <dd>V{{ result.version }}</dd>
          </div>
          <div>
            <dt>模块数量</dt>
            <dd>{{ result.moduleCount }} × {{ result.moduleCount }}</dd>
          </div>
          <div>
            <dt>导出尺寸</dt>
            <dd>{{ result.size }} px</dd>
          </div>
        </dl>
        <p v-if="error" class="tool-note qr-code-tool__stale-note" role="status">
          当前内容生成失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges" class="tool-note qr-code-tool__stale-note" role="status">
          当前输入或导出尺寸已修改，请重新生成二维码。
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
