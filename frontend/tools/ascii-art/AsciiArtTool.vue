<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  downloadAsciiArt,
  processAsciiArt,
  readAsciiArtFile,
  type AsciiArtResult,
  type AsciiArtSource,
} from '~/adapters/ascii-art'
import {
  ASCII_ART_COLUMN_OPTIONS,
  ASCII_ART_DEFAULT_COLUMNS,
  type AsciiArtColumns,
} from '~/core/ascii-art'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const source = ref<AsciiArtSource | null>(null)
const result = ref<AsciiArtResult | null>(null)
const processedFile = ref<File | null>(null)
const columns = ref<AsciiArtColumns>(ASCII_ART_DEFAULT_COLUMNS)
const error = ref<ToolError | null>(null)
const notice = ref('')
const isReadingFile = ref(false)
const isGenerating = ref(false)
const fileReadSequence = ref(0)

const isProcessing = computed(() => isReadingFile.value || isGenerating.value)
const selectedFileSummary = computed(() => {
  if (!selectedFile.value) {
    return ''
  }

  return selectedFile.value.name + ' · ' + formatByteLength(selectedFile.value.size)
})
const resultTitle = computed(() => result.value
  ? 'ASCII 画 · ' + result.value.columns + ' × ' + result.value.rows
  : 'ASCII 画结果')
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

  return result.value || source.value ? 'success' : 'idle'
})
const hasPendingChanges = computed(() => {
  if (!result.value) {
    return false
  }

  return processedFile.value !== selectedFile.value
    || result.value.columns !== columns.value
})
const resultStateLabel = computed(() => {
  if (isProcessing.value) {
    return '正在生成新结果'
  }

  return error.value || hasPendingChanges.value
    ? '上一次成功结果'
    : '当前 ASCII 画'
})
const emptyResultText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '选择一张 PNG、JPEG 或 WebP 图片，设置输出列数后点击“生成 ASCII 画”。')
const hasResettableState = computed(() => Boolean(
  selectedFile.value
  || source.value
  || result.value
  || columns.value !== ASCII_ART_DEFAULT_COLUMNS
  || error.value
  || notice.value,
))

/** 将字节数转换为适合页面展示的简短文本。 */
function formatByteLength(value: number): string {
  if (value < 1024) {
    return String(value) + ' B'
  }

  if (value < 1024 * 1024) {
    return (value / 1024).toFixed(1) + ' KiB'
  }

  return (value / (1024 * 1024)).toFixed(2) + ' MiB'
}

/** 选择本地图片并提前完成格式、尺寸和原图信息检查。 */
async function handleFileChange(event: Event) {
  if (isProcessing.value) {
    return
  }

  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  selectedFile.value = file
  source.value = null
  error.value = null
  notice.value = ''

  if (!file) {
    return
  }

  const sequence = fileReadSequence.value + 1
  fileReadSequence.value = sequence
  isReadingFile.value = true

  const loaded = await readAsciiArtFile(file)
  if (sequence !== fileReadSequence.value) {
    return
  }

  if (loaded.ok) {
    source.value = loaded.value
  } else {
    error.value = loaded.error
  }

  isReadingFile.value = false
}

/** 根据当前图片和列数生成 ASCII 画；失败时保留上一次成功结果。 */
async function generate() {
  if (isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''

  if (!selectedFile.value) {
    error.value = {
      code: 'empty-input',
      message: '请先选择一张 PNG、JPEG 或 WebP 静态图片。',
    }
    return
  }

  isGenerating.value = true
  const generated = await processAsciiArt(selectedFile.value, columns.value)

  if (!generated.ok) {
    error.value = generated.error
    isGenerating.value = false
    return
  }

  result.value = generated.value
  source.value = generated.value.source
  processedFile.value = selectedFile.value
  error.value = null
  isGenerating.value = false
}

/** 下载当前成功生成的 ASCII 画文本。 */
function download() {
  if (!result.value || isProcessing.value) {
    return
  }

  notice.value = ''
  const downloaded = downloadAsciiArt(result.value)
  if (downloaded.ok) {
    notice.value = downloaded.message
  } else {
    error.value = {
      code: 'operation-failed',
      message: downloaded.message,
    }
  }
}

/** 清空输入、结果、错误和反馈，恢复默认输出列数。 */
function clearAll() {
  if (isProcessing.value) {
    return
  }

  fileReadSequence.value += 1
  selectedFile.value = null
  source.value = null
  result.value = null
  processedFile.value = null
  columns.value = ASCII_ART_DEFAULT_COLUMNS
  error.value = null
  notice.value = ''

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

watch([selectedFile, columns], () => {
  if (!isProcessing.value) {
    error.value = null
    notice.value = ''
  }
})

onBeforeUnmount(() => {
  fileReadSequence.value += 1
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split ascii-art-tool">
    <ToolInputPanel
      title="生成 ASCII 画"
      description="选择一张本地图片，将亮度转换为等宽 ASCII 字符；输入和结果不会上传或保存。"
    >
      <label class="tool-field">
        <span class="tool-field__label">本地图片</span>
        <input
          ref="fileInputRef"
          class="ascii-art-tool__file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :disabled="isProcessing"
          aria-label="选择 PNG、JPEG 或 WebP 图片"
          @change="handleFileChange"
        >
        <span v-if="selectedFileSummary" class="ascii-art-tool__file-note">
          {{ selectedFileSummary }}<template v-if="source"> · {{ source.width }} × {{ source.height }} px</template>
        </span>
        <span v-else class="ascii-art-tool__file-note">
          支持 PNG、JPEG、WebP；单张不超过 10 MiB，最长边不超过 8,192 px。
        </span>
      </label>

      <label class="tool-field">
        <span class="tool-field__label">输出列数</span>
        <select
          v-model="columns"
          class="tool-input"
          :disabled="isProcessing"
          aria-label="ASCII 画输出列数"
        >
          <option v-for="option in ASCII_ART_COLUMN_OPTIONS" :key="option" :value="option">
            {{ option }} 列
          </option>
        </select>
        <span class="ascii-art-tool__input-meta">默认 80 列；字符高度按等宽字体比例校正</span>
      </label>

      <p class="tool-note ascii-art-tool__fixed-note">
        固定 10 档 ASCII 字符集 · 纯文本输出 · 透明区域按白色背景处理
      </p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="generate">
          {{ isGenerating ? '生成中…' : isReadingFile ? '读取中…' : '生成 ASCII 画' }}
        </button>
        <ClearButton :disabled="!hasResettableState || isProcessing" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="resultTitle"
      :status="status"
      :error="error"
      :show-content-on-idle="Boolean(source || result)"
      :show-content-on-processing="Boolean(source || result)"
      :preserve-content-on-error="true"
      :empty-text="emptyResultText"
      processing-text="正在读取图片并生成 ASCII 画，请稍候。"
    >
      <div v-if="result || source" class="ascii-art-tool__result">
        <div class="ascii-art-tool__result-heading">
          <p class="ascii-art-tool__result-label">{{ result ? resultStateLabel : '图片已准备好' }}</p>
          <span v-if="result" class="ascii-art-tool__result-kicker">
            {{ result.columns }} 列 · {{ result.rows }} 行
          </span>
        </div>

        <div v-if="result" class="ascii-art-tool__output-frame" tabindex="0" aria-label="ASCII 画文本预览">
          <pre class="ascii-art-tool__output"><code>{{ result.text }}</code></pre>
        </div>
        <div v-else class="ascii-art-tool__source-ready">
          已读取 {{ source?.width }} × {{ source?.height }} px 图片，点击“生成 ASCII 画”查看结果。
        </div>

        <dl v-if="result" class="ascii-art-tool__meta">
          <div>
            <dt>原图</dt>
            <dd>{{ result.source.format.toUpperCase() }} · {{ result.source.width }} × {{ result.source.height }} px</dd>
          </div>
          <div>
            <dt>字符网格</dt>
            <dd>{{ result.columns }} × {{ result.rows }} · {{ result.cellCount }} 个字符单元</dd>
          </div>
          <div>
            <dt>字符集</dt>
            <dd>10 档 ASCII · 深色到浅色</dd>
          </div>
          <div>
            <dt>文件名</dt>
            <dd>{{ result.downloadFileName }}</dd>
          </div>
        </dl>

        <p v-if="error && result" class="tool-note ascii-art-tool__stale-note" role="status">
          当前配置处理失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges && result" class="tool-note ascii-art-tool__stale-note" role="status">
          当前图片或列数已修改，请重新生成 ASCII 画。
        </p>
      </div>

      <p v-if="notice" class="tool-note" role="status">{{ notice }}</p>

      <template #actions>
        <CopyButton
          v-if="result"
          :text="result.text"
          label="复制 ASCII 画"
          :disabled="isProcessing"
        />
        <button
          v-if="result"
          type="button"
          class="button button--secondary"
          :disabled="isProcessing"
          @click="download"
        >
          下载 TXT
        </button>
      </template>
    </ToolResultPanel>
  </div>
</template>
