<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  downloadImageWatermark,
  processImageWatermark,
  readImageWatermarkFile,
  revokeImageWatermarkObjectUrl,
  type ImageWatermarkResult,
  type ImageWatermarkSource,
} from '~/adapters/image-watermark'
import {
  IMAGE_WATERMARK_DEFAULT_COLOR,
  IMAGE_WATERMARK_DEFAULT_OPACITY,
  IMAGE_WATERMARK_MAX_TEXT_LENGTH,
  IMAGE_WATERMARK_SIZES,
  type ImageWatermarkPosition,
  type ImageWatermarkSize,
} from '~/core/image-watermark'
import { type ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const POSITION_OPTIONS: ReadonlyArray<{ value: ImageWatermarkPosition; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top-center', label: '上中' },
  { value: 'top-right', label: '右上' },
  { value: 'middle-left', label: '左中' },
  { value: 'center', label: '中心' },
  { value: 'middle-right', label: '右中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-center', label: '下中' },
  { value: 'bottom-right', label: '右下' },
]

const SIZE_OPTIONS: ReadonlyArray<{ value: ImageWatermarkSize; label: string }> = [
  { value: 'small', label: '小 · 短边 2%' },
  { value: 'medium', label: '中 · 短边 3%' },
  { value: 'large', label: '大 · 短边 4%' },
]

interface ZoomedPreview {
  source: string
  label: string
  alt: string
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const source = ref<ImageWatermarkSource | null>(null)
const result = ref<ImageWatermarkResult | null>(null)
const processedFile = ref<File | null>(null)
const watermarkText = ref('')
const position = ref<ImageWatermarkPosition>('bottom-right')
const size = ref<ImageWatermarkSize>('medium')
const color = ref(IMAGE_WATERMARK_DEFAULT_COLOR)
const opacity = ref(IMAGE_WATERMARK_DEFAULT_OPACITY)
const error = ref<ToolError | null>(null)
const notice = ref('')
const isReadingFile = ref(false)
const isGenerating = ref(false)
const fileReadSequence = ref(0)
const zoomedPreview = ref<ZoomedPreview | null>(null)

const isProcessing = computed(() => isReadingFile.value || isGenerating.value)
const textLength = computed(() => Array.from(watermarkText.value).length)
const opacityPercent = computed(() => Math.round(opacity.value * 100))
const selectedFileSummary = computed(() => {
  if (!selectedFile.value) {
    return ''
  }

  return `${selectedFile.value.name} · ${formatByteLength(selectedFile.value.size)}`
})
const status = computed<ToolUiStatus>(() => {
  if (isProcessing.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return result.value ? 'success' : 'idle'
})
const hasPendingChanges = computed(() => {
  if (!result.value) {
    return false
  }

  return processedFile.value !== selectedFile.value
    || result.value.text !== watermarkText.value.trim()
    || result.value.position !== position.value
    || result.value.size !== size.value
    || result.value.color !== color.value.trim().toLowerCase()
    || result.value.opacity !== opacity.value
})
const resultStateLabel = computed(() => {
  if (isProcessing.value) {
    return '正在生成新结果'
  }

  return error.value || hasPendingChanges.value ? '上一次成功结果' : '当前水印结果'
})
const hasResettableState = computed(() => Boolean(
  selectedFile.value
  || source.value
  || result.value
  || watermarkText.value
  || position.value !== 'bottom-right'
  || size.value !== 'medium'
  || color.value !== IMAGE_WATERMARK_DEFAULT_COLOR
  || opacity.value !== IMAGE_WATERMARK_DEFAULT_OPACITY
  || error.value
  || notice.value,
))

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

/** 返回位置的简短展示名称。 */
function formatPosition(value: ImageWatermarkPosition): string {
  return POSITION_OPTIONS.find((option) => option.value === value)?.label ?? value
}

/** 返回字号档位的简短展示名称。 */
function formatSize(value: ImageWatermarkSize): string {
  return SIZE_OPTIONS.find((option) => option.value === value)?.label ?? value
}

/** 释放一组去重后的本地对象 URL。 */
function revokeUrls(urls: Array<string | undefined>) {
  new Set(urls.filter((url): url is string => Boolean(url))).forEach((url) => {
    revokeImageWatermarkObjectUrl(url)
  })
}

/** 清理输入反馈但保留当前参数和上一次成功结果。 */
function clearInputFeedback() {
  error.value = null
  notice.value = ''
}

/** 打开当前页面内的本地放大预览。 */
function openZoom(sourceUrl: string, label: string, alt: string) {
  zoomedPreview.value = {
    source: sourceUrl,
    label,
    alt,
  }
}

/** 关闭本地放大预览。 */
function closeZoom() {
  zoomedPreview.value = null
}

/** 使用 Escape 关闭放大预览，不影响图片处理状态。 */
function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && zoomedPreview.value) {
    closeZoom()
  }
}

/** 选择本地图片并提前完成格式、尺寸和原图预览检查。 */
async function handleFileChange(event: Event) {
  if (isProcessing.value) {
    return
  }

  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  const previousSource = source.value
  selectedFile.value = file
  source.value = null
  clearInputFeedback()

  if (previousSource
    && previousSource.previewSource !== result.value?.source.previewSource) {
    revokeImageWatermarkObjectUrl(previousSource.previewSource)
  }

  if (!file) {
    return
  }

  const sequence = fileReadSequence.value + 1
  fileReadSequence.value = sequence
  isReadingFile.value = true

  const loaded = await readImageWatermarkFile(file)
  if (sequence !== fileReadSequence.value) {
    if (loaded.ok) {
      revokeImageWatermarkObjectUrl(loaded.value.previewSource)
    }
    return
  }

  if (loaded.ok) {
    source.value = loaded.value
  } else {
    error.value = loaded.error
  }

  isReadingFile.value = false
}

/** 生成新水印结果；失败时保留上一次成功结果和当前输入。 */
async function generate() {
  if (isProcessing.value) {
    return
  }

  isGenerating.value = true
  error.value = null
  notice.value = ''

  if (!selectedFile.value) {
    error.value = {
      code: 'empty-input',
      message: '请选择一张 PNG、JPEG 或 WebP 图片。',
    }
    isGenerating.value = false
    return
  }

  const generated = await processImageWatermark(selectedFile.value, {
    text: watermarkText.value,
    position: position.value,
    size: size.value,
    color: color.value,
    opacity: opacity.value,
  })

  if (!generated.ok) {
    error.value = generated.error
    isGenerating.value = false
    return
  }

  const previousResult = result.value
  const previousSource = source.value
  result.value = generated.value
  source.value = generated.value.source
  processedFile.value = selectedFile.value
  error.value = null
  isGenerating.value = false

  revokeUrls([
    previousSource?.previewSource,
    previousResult?.source.previewSource,
    previousResult?.previewSource,
  ].filter((url) => url !== generated.value.source.previewSource && url !== generated.value.previewSource))
}

/** 下载当前成功生成的图片。 */
function download() {
  if (!result.value || isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''
  const downloaded = downloadImageWatermark(result.value)
  if (downloaded.ok) {
    notice.value = downloaded.value
  } else {
    error.value = downloaded.error
  }
}

/** 清空输入、预览、结果和错误，并恢复默认参数。 */
function clearAll() {
  if (isProcessing.value) {
    return
  }

  revokeUrls([
    source.value?.previewSource,
    result.value?.source.previewSource,
    result.value?.previewSource,
  ])
  fileReadSequence.value += 1
  selectedFile.value = null
  source.value = null
  result.value = null
  processedFile.value = null
  watermarkText.value = ''
  position.value = 'bottom-right'
  size.value = 'medium'
  color.value = IMAGE_WATERMARK_DEFAULT_COLOR
  opacity.value = IMAGE_WATERMARK_DEFAULT_OPACITY
  error.value = null
  notice.value = ''

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  closeZoom()
  fileReadSequence.value += 1
  revokeUrls([
    source.value?.previewSource,
    result.value?.source.previewSource,
    result.value?.previewSource,
  ])
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split image-watermark-tool">
    <ToolInputPanel
      title="添加文字水印"
      description="选择一张本地图片，在浏览器中叠加单条文字水印；输入和结果不会上传或保存。"
    >
      <label class="tool-field">
        <span class="tool-field__label">本地图片</span>
        <input
          ref="fileInputRef"
          class="image-watermark-tool__file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :disabled="isProcessing"
          aria-label="选择 PNG、JPEG 或 WebP 图片"
          @change="handleFileChange"
        >
        <span v-if="selectedFileSummary" class="image-watermark-tool__file-note">
          {{ selectedFileSummary }}<template v-if="source"> · {{ source.width }} × {{ source.height }} px</template>
        </span>
        <span v-else class="image-watermark-tool__file-note">
          支持 PNG、JPEG、WebP；单张不超过 10 MiB，最长边不超过 8,192 px。
        </span>
      </label>

      <label class="tool-field">
        <span class="tool-field__label">水印文字</span>
        <input
          v-model="watermarkText"
          class="tool-input"
          type="text"
          maxlength="64"
          autocomplete="off"
          aria-label="水印文字"
          placeholder="例如：Tool Deck"
          @input="clearInputFeedback"
        >
        <span class="image-watermark-tool__input-meta">
          {{ textLength }} / {{ IMAGE_WATERMARK_MAX_TEXT_LENGTH }} 个 Unicode 字符 · 不支持换行
        </span>
      </label>

      <div class="tool-field-grid tool-field-grid--two image-watermark-tool__options">
        <label class="tool-field">
          <span class="tool-field__label">位置</span>
          <select v-model="position" class="tool-input" aria-label="水印位置" @change="clearInputFeedback">
            <option v-for="option in POSITION_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">字号</span>
          <select v-model="size" class="tool-input" aria-label="水印字号" @change="clearInputFeedback">
            <option v-for="option in SIZE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="tool-field-grid tool-field-grid--two image-watermark-tool__options">
        <label class="tool-field image-watermark-tool__color-field">
          <span class="tool-field__label">文字颜色</span>
          <input
            v-model="color"
            class="image-watermark-tool__color-input"
            type="color"
            aria-label="水印文字颜色"
            @input="clearInputFeedback"
          >
          <span class="image-watermark-tool__input-meta">默认白色，带固定轻微阴影</span>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">透明度 · {{ opacityPercent }}%</span>
          <input
            v-model.number="opacity"
            class="image-watermark-tool__opacity-input"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            aria-label="水印透明度"
            @input="clearInputFeedback"
          >
          <span class="image-watermark-tool__input-meta">范围 10%–100%，步进 5%</span>
        </label>
      </div>

      <p class="tool-note image-watermark-tool__fixed-note">
        输出跟随输入格式 · 保持原像素尺寸 · 不保留 EXIF、ICC 等原文件元数据
      </p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="generate">
          {{ isGenerating ? '生成中…' : isReadingFile ? '读取中…' : '生成水印' }}
        </button>
        <ClearButton :disabled="!hasResettableState || isProcessing" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="水印预览"
      :status="status"
      :error="error"
      :show-content-on-idle="Boolean(source)"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      empty-text="选择图片并输入水印文字后，点击“生成水印”，结果会显示在这里。"
    >
      <div v-if="result || source" class="image-watermark-tool__result">
        <p v-if="result" class="image-watermark-tool__result-label">{{ resultStateLabel }}</p>
        <p v-else class="image-watermark-tool__result-label">原图已准备好</p>

        <div v-if="result" class="image-watermark-tool__preview-grid">
          <figure class="image-watermark-tool__preview-card">
            <figcaption>原图</figcaption>
            <div class="image-watermark-tool__preview">
              <button
                type="button"
                class="image-watermark-tool__preview-trigger"
                aria-label="放大原图预览"
                @click="openZoom(result.source.previewSource, '原图', '加水印前的原图放大预览')"
              >
                <img :src="result.source.previewSource" alt="加水印前的原图预览">
                <span class="image-watermark-tool__zoom-hint">点击放大</span>
              </button>
            </div>
          </figure>
          <figure class="image-watermark-tool__preview-card">
            <figcaption>加水印结果</figcaption>
            <div class="image-watermark-tool__preview">
              <button
                type="button"
                class="image-watermark-tool__preview-trigger"
                aria-label="放大加水印结果预览"
                @click="openZoom(result.previewSource, '加水印结果', '加水印后的图片放大预览')"
              >
                <img :src="result.previewSource" alt="加水印后的图片预览">
                <span class="image-watermark-tool__zoom-hint">点击放大</span>
              </button>
            </div>
          </figure>
        </div>

        <div v-else-if="source" class="image-watermark-tool__preview-grid image-watermark-tool__preview-grid--single">
          <figure class="image-watermark-tool__preview-card">
            <figcaption>原图</figcaption>
            <div class="image-watermark-tool__preview">
              <button
                type="button"
                class="image-watermark-tool__preview-trigger"
                aria-label="放大待处理原图预览"
                @click="openZoom(source.previewSource, '原图', '待处理的原图放大预览')"
              >
                <img :src="source.previewSource" alt="待处理的原图预览">
                <span class="image-watermark-tool__zoom-hint">点击放大</span>
              </button>
            </div>
          </figure>
        </div>

        <dl v-if="result" class="image-watermark-tool__meta">
          <div>
            <dt>图片尺寸</dt>
            <dd>{{ result.width }} × {{ result.height }} px</dd>
          </div>
          <div>
            <dt>水印参数</dt>
            <dd>{{ formatPosition(result.position) }} · {{ formatSize(result.size) }}</dd>
          </div>
          <div>
            <dt>格式与体积</dt>
            <dd>{{ result.format.toUpperCase() }} · {{ formatByteLength(result.outputByteLength) }}</dd>
          </div>
          <div>
            <dt>文件名</dt>
            <dd>{{ result.downloadFileName }}</dd>
          </div>
        </dl>

        <p v-if="error && result" class="tool-note image-watermark-tool__stale-note" role="status">
          当前配置处理失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges && result" class="tool-note image-watermark-tool__stale-note" role="status">
          当前图片或参数已修改，请重新生成水印。
        </p>
      </div>

      <p v-if="notice" class="tool-note" role="status">{{ notice }}</p>

      <template #actions>
        <button
          v-if="result"
          type="button"
          class="button button--primary"
          :disabled="isProcessing"
          @click="download"
        >
          下载 {{ result.format.toUpperCase() }} 图片
        </button>
      </template>
    </ToolResultPanel>

    <div
      v-if="zoomedPreview"
      class="image-watermark-tool__zoom-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="`${zoomedPreview.label}放大预览`"
      @click.self="closeZoom"
    >
      <div class="image-watermark-tool__zoom-dialog">
        <div class="image-watermark-tool__zoom-header">
          <p class="image-watermark-tool__zoom-title">{{ zoomedPreview.label }}</p>
          <button
            type="button"
            class="button button--secondary"
            aria-label="关闭放大预览"
            @click="closeZoom"
          >
            关闭
          </button>
        </div>
        <div class="image-watermark-tool__zoom-stage">
          <img class="image-watermark-tool__zoom-image" :src="zoomedPreview.source" :alt="zoomedPreview.alt">
        </div>
        <p class="image-watermark-tool__zoom-note">点击遮罩或按 Escape 关闭</p>
      </div>
    </div>
  </div>
</template>
