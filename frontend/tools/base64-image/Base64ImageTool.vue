<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { copyText } from '~/adapters/clipboard'
import {
  decodeBase64ImageText,
  downloadBase64Image,
  downloadBase64ImageText,
  readBase64ImageFile,
  revokeBase64ImageObjectUrl,
  type Base64ImageFileValue,
  type DecodedBase64ImageValue,
  type Base64ImageTextRepresentation,
} from '~/adapters/base64-image'
import {
  type Base64ImageFormat,
} from '~/core/base64-image'
import { failure, type ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

type Base64ImageMode = 'file-to-base64' | 'base64-to-image'

const FORMAT_OPTIONS: ReadonlyArray<{ value: Base64ImageFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
  { value: 'gif', label: 'GIF' },
]

const mode = ref<Base64ImageMode>('file-to-base64')
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const base64Text = ref('')
const rawFormat = ref<Base64ImageFormat>('png')
const fileResult = ref<Base64ImageFileValue | null>(null)
const decodedResult = ref<DecodedBase64ImageValue | null>(null)
const processedFile = ref<File | null>(null)
const processedBase64Text = ref('')
const processedRawFormat = ref<Base64ImageFormat>('png')
const error = ref<ToolError | null>(null)
const notice = ref('')
const isProcessing = ref(false)

const status = computed<ToolUiStatus>(() => {
  if (isProcessing.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return fileResult.value || decodedResult.value ? 'success' : 'idle'
})

const currentResult = computed(() => fileResult.value || decodedResult.value)
const hasPendingChanges = computed(() => {
  if (!currentResult.value) {
    return false
  }

  if (mode.value === 'file-to-base64') {
    return selectedFile.value !== processedFile.value
  }

  const isDataUrl = /^data:/iu.test(base64Text.value.trim())
  return base64Text.value !== processedBase64Text.value
    || (!isDataUrl && rawFormat.value !== processedRawFormat.value)
})

const resultStateLabel = computed(() => {
  if (isProcessing.value) {
    return '正在生成新结果'
  }

  return error.value || hasPendingChanges.value
    ? '上一次成功结果'
    : '当前转换结果'
})

const hasResettableState = computed(() => Boolean(
  selectedFile.value
  || base64Text.value
  || fileResult.value
  || decodedResult.value
  || error.value
  || notice.value,
))

const inputDescription = computed(() => mode.value === 'file-to-base64'
  ? '选择一张本地图片，保留原始字节生成 Data URL 和纯 Base64。'
  : '粘贴 Data URL 或纯 Base64；纯 Base64 需要选择图片格式。')

const emptyResultText = computed(() => mode.value === 'file-to-base64'
  ? '选择 PNG、JPEG、WebP 或 GIF 图片后点击“转换为 Base64”，结果会显示在这里。'
  : '粘贴图片 Base64 后点击“转换为图片”，预览会显示在这里。')

const selectedFileSummary = computed(() => {
  if (!selectedFile.value) {
    return ''
  }

  return `${selectedFile.value.name} · ${formatByteLength(selectedFile.value.size)}`
})

/** 将字节数转换为适合页面展示的简短文本。 */
function formatByteLength(value: number): string {
  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MiB`
}

/** 返回首版支持格式的展示名称。 */
function formatLabel(format: Base64ImageFormat): string {
  return FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? format
}

/** 释放当前 Base64 转图片结果使用的对象 URL。 */
function revokeDecodedResult() {
  if (decodedResult.value) {
    revokeBase64ImageObjectUrl(decodedResult.value.previewSource)
  }

  decodedResult.value = null
}

/** 清理当前转换结果，但保留输入以便失败时继续修正。 */
function clearCurrentResult() {
  fileResult.value = null
  revokeDecodedResult()
  processedFile.value = null
  processedBase64Text.value = ''
}

/** 切换操作模式并回到该模式的初始空状态。 */
function switchMode(nextMode: Base64ImageMode) {
  if (isProcessing.value || mode.value === nextMode) {
    return
  }

  mode.value = nextMode
  selectedFile.value = null
  base64Text.value = ''
  rawFormat.value = 'png'
  clearCurrentResult()
  processedRawFormat.value = 'png'
  error.value = null
  notice.value = ''

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

/** 读取文件选择框中的单张图片。 */
function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  error.value = null
  notice.value = ''
}

/** 将当前图片文件转换为 Base64 文本。 */
async function convertFile() {
  if (isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''

  if (!selectedFile.value) {
    const emptyInput = failure('empty-input', '请先选择一张 PNG、JPEG、WebP 或 GIF 图片。')
    if (!emptyInput.ok) {
      error.value = emptyInput.error
    }
    return
  }

  isProcessing.value = true
  const converted = await readBase64ImageFile(selectedFile.value)

  if (!converted.ok) {
    error.value = converted.error
    isProcessing.value = false
    return
  }

  fileResult.value = converted.value
  processedFile.value = selectedFile.value
  isProcessing.value = false
}

/** 将当前 Base64 文本解析、校验并生成图片预览。 */
function convertBase64() {
  if (isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''

  if (!base64Text.value.trim()) {
    const emptyInput = failure('empty-input', '请先粘贴 Data URL 或纯 Base64 图片内容。')
    if (!emptyInput.ok) {
      error.value = emptyInput.error
    }
    return
  }

  isProcessing.value = true
  const converted = decodeBase64ImageText(base64Text.value, rawFormat.value)

  if (!converted.ok) {
    error.value = converted.error
    isProcessing.value = false
    return
  }

  revokeDecodedResult()
  decodedResult.value = converted.value
  processedBase64Text.value = base64Text.value
  processedRawFormat.value = rawFormat.value
  isProcessing.value = false
}

/** 复制某一份文本结果，并展示浏览器能力反馈。 */
async function copyResult(value: string) {
  const copied = await copyText(value)
  notice.value = copied.message
}

/** 下载 Data URL 或纯 Base64 文本。 */
function downloadTextResult(representation: Base64ImageTextRepresentation) {
  if (!fileResult.value || isProcessing.value) {
    return
  }

  const downloaded = downloadBase64ImageText(fileResult.value, representation)
  if (!downloaded.ok) {
    error.value = downloaded.error
    notice.value = ''
    return
  }

  error.value = null
  notice.value = downloaded.value
}

/** 下载 Base64 解码后的原始图片。 */
function downloadImageResult() {
  if (!decodedResult.value || isProcessing.value) {
    return
  }

  const downloaded = downloadBase64Image(decodedResult.value)
  if (!downloaded.ok) {
    error.value = downloaded.error
    notice.value = ''
    return
  }

  error.value = null
  notice.value = downloaded.value
}

/** 清空输入、结果、错误和对象 URL，回到当前模式的空状态。 */
function clearAll() {
  if (isProcessing.value) {
    return
  }

  selectedFile.value = null
  base64Text.value = ''
  rawFormat.value = 'png'
  clearCurrentResult()
  processedRawFormat.value = 'png'
  error.value = null
  notice.value = ''

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

watch([selectedFile, base64Text, rawFormat], () => {
  if (!isProcessing.value) {
    error.value = null
    notice.value = ''
  }
})

onBeforeUnmount(() => {
  if (decodedResult.value) {
    revokeBase64ImageObjectUrl(decodedResult.value.previewSource)
  }
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split base64-image-tool">
    <ToolInputPanel title="Base64 图片转换" :description="inputDescription">
      <div class="base64-image-tool__mode-switch" role="tablist" aria-label="转换方向">
        <button
          type="button"
          class="base64-image-tool__mode-tab"
          :class="{ 'base64-image-tool__mode-tab--active': mode === 'file-to-base64' }"
          role="tab"
          :aria-selected="mode === 'file-to-base64'"
          :disabled="isProcessing"
          @click="switchMode('file-to-base64')"
        >
          <span class="base64-image-tool__mode-kicker">01</span>
          <span>图片 → Base64</span>
        </button>
        <span class="base64-image-tool__mode-arrow" aria-hidden="true">↔</span>
        <button
          type="button"
          class="base64-image-tool__mode-tab"
          :class="{ 'base64-image-tool__mode-tab--active': mode === 'base64-to-image' }"
          role="tab"
          :aria-selected="mode === 'base64-to-image'"
          :disabled="isProcessing"
          @click="switchMode('base64-to-image')"
        >
          <span class="base64-image-tool__mode-kicker">02</span>
          <span>Base64 → 图片</span>
        </button>
      </div>

      <div v-if="mode === 'file-to-base64'" class="base64-image-tool__input-body">
        <label class="tool-field">
          <span class="tool-field__label">图片文件</span>
          <input
            ref="fileInputRef"
            class="base64-image-tool__file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-describedby="base64-image-file-note"
            :disabled="isProcessing"
            @change="handleFileChange"
          >
          <span id="base64-image-file-note" class="base64-image-tool__file-note">
            {{ selectedFileSummary || '仅支持 PNG、JPEG、WebP、GIF，单张最大 10 MiB。' }}
          </span>
        </label>

        <p class="tool-note base64-image-tool__privacy-note">
          读取和编码均在当前浏览器内存完成，不会上传文件；不会通过 Canvas 改变原始图片字节。
        </p>

        <div class="tool-panel__actions">
          <button
            type="button"
            class="button button--primary"
            :disabled="isProcessing"
            @click="convertFile"
          >
            {{ isProcessing ? '转换中…' : '转换为 Base64' }}
          </button>
          <ClearButton :disabled="!hasResettableState || isProcessing" @clear="clearAll" />
        </div>
      </div>

      <div v-else class="base64-image-tool__input-body">
        <label class="tool-field">
          <span class="tool-field__label">Base64 内容</span>
          <textarea
            v-model="base64Text"
            class="tool-textarea tool-textarea--code base64-image-tool__base64-input"
            rows="10"
            spellcheck="false"
            autocomplete="off"
            aria-label="Base64 图片内容"
            placeholder="data:image/png;base64,... 或粘贴纯 Base64 内容"
            :disabled="isProcessing"
          />
        </label>

        <label class="tool-field">
          <span class="tool-field__label">纯 Base64 的图片格式</span>
          <select v-model="rawFormat" class="tool-select" :disabled="isProcessing">
            <option v-for="option in FORMAT_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <span class="base64-image-tool__field-note">Data URL 会自动读取其中的 MIME 类型，此选择不会覆盖 Data URL。</span>
        </label>

        <div class="tool-panel__actions">
          <button
            type="button"
            class="button button--primary"
            :disabled="isProcessing"
            @click="convertBase64"
          >
            {{ isProcessing ? '转换中…' : '转换为图片' }}
          </button>
          <ClearButton :disabled="!hasResettableState || isProcessing" @clear="clearAll" />
        </div>
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="转换结果"
      :status="status"
      :error="error"
      :show-content-on-processing="Boolean(currentResult)"
      :preserve-content-on-error="true"
      :empty-text="emptyResultText"
    >
      <div v-if="fileResult" class="base64-image-tool__result">
        <div class="base64-image-tool__result-heading">
          <div>
            <p class="base64-image-tool__result-label">{{ resultStateLabel }}</p>
            <p class="base64-image-tool__result-summary">
              {{ formatLabel(fileResult.format) }} · {{ formatByteLength(fileResult.byteLength) }} · 原始字节保留
            </p>
          </div>
          <span class="base64-image-tool__format-badge">双文本输出</span>
        </div>

        <div class="base64-image-tool__preview base64-image-tool__preview--checkerboard">
          <img :src="fileResult.previewSource" :alt="`${formatLabel(fileResult.format)} 图片预览`">
        </div>

        <dl class="base64-image-tool__meta">
          <div>
            <dt>图片格式</dt>
            <dd>{{ formatLabel(fileResult.format) }}</dd>
          </div>
          <div>
            <dt>原始大小</dt>
            <dd>{{ formatByteLength(fileResult.byteLength) }}</dd>
          </div>
          <div>
            <dt>Data URL 长度</dt>
            <dd>{{ fileResult.dataUrl.length.toLocaleString() }}</dd>
          </div>
          <div>
            <dt>文件名</dt>
            <dd>不使用原文件名</dd>
          </div>
        </dl>

        <label class="tool-field base64-image-tool__output-field">
          <span class="tool-field__label">Data URL</span>
          <textarea
            class="tool-textarea tool-textarea--code base64-image-tool__output-text"
            :value="fileResult.dataUrl"
            readonly
            spellcheck="false"
            aria-label="Data URL 结果"
          />
        </label>

        <label class="tool-field base64-image-tool__output-field">
          <span class="tool-field__label">纯 Base64</span>
          <textarea
            class="tool-textarea tool-textarea--code base64-image-tool__output-text"
            :value="fileResult.base64"
            readonly
            spellcheck="false"
            aria-label="纯 Base64 结果"
          />
        </label>

        <p v-if="error" class="tool-note base64-image-tool__stale-note" role="status">
          当前输入转换失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges" class="tool-note base64-image-tool__stale-note" role="status">
          当前图片已更换，请重新转换后再使用结果。
        </p>
      </div>

      <div v-else-if="decodedResult" class="base64-image-tool__result">
        <div class="base64-image-tool__result-heading">
          <div>
            <p class="base64-image-tool__result-label">{{ resultStateLabel }}</p>
            <p class="base64-image-tool__result-summary">
              {{ formatLabel(decodedResult.format) }} · {{ formatByteLength(decodedResult.byteLength) }} · 原始字节保留
            </p>
          </div>
          <span class="base64-image-tool__format-badge">图片预览</span>
        </div>

        <div class="base64-image-tool__preview base64-image-tool__preview--checkerboard">
          <img :src="decodedResult.previewSource" :alt="`${formatLabel(decodedResult.format)} 图片预览`">
        </div>

        <dl class="base64-image-tool__meta">
          <div>
            <dt>图片格式</dt>
            <dd>{{ formatLabel(decodedResult.format) }}</dd>
          </div>
          <div>
            <dt>解码大小</dt>
            <dd>{{ formatByteLength(decodedResult.byteLength) }}</dd>
          </div>
          <div>
            <dt>MIME</dt>
            <dd>{{ decodedResult.mimeType }}</dd>
          </div>
          <div>
            <dt>文件名</dt>
            <dd>base64-image-YYYYMMDD.{{ decodedResult.format === 'jpeg' ? 'jpg' : decodedResult.format }}</dd>
          </div>
        </dl>

        <p v-if="error" class="tool-note base64-image-tool__stale-note" role="status">
          当前输入转换失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges" class="tool-note base64-image-tool__stale-note" role="status">
          当前 Base64 内容已修改，请重新转换后再下载图片。
        </p>
      </div>

      <p v-if="notice" class="tool-note" role="status">{{ notice }}</p>

      <template #actions>
        <template v-if="fileResult">
          <CopyButton
            :text="fileResult.dataUrl"
            label="复制 Data URL"
            :disabled="isProcessing"
          />
          <CopyButton
            :text="fileResult.base64"
            label="复制纯 Base64"
            :disabled="isProcessing"
          />
          <button
            type="button"
            class="button button--secondary"
            :disabled="isProcessing"
            @click="downloadTextResult('data-url')"
          >
            下载 Data URL
          </button>
          <button
            type="button"
            class="button button--secondary"
            :disabled="isProcessing"
            @click="downloadTextResult('raw')"
          >
            下载纯 Base64
          </button>
        </template>
        <button
          v-else-if="decodedResult"
          type="button"
          class="button button--primary"
          :disabled="isProcessing"
          @click="downloadImageResult"
        >
          下载图片
        </button>
      </template>
    </ToolResultPanel>
  </div>
</template>
