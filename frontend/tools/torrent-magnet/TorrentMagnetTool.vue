
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  copyTorrentMagnet,
  downloadTorrentMagnet,
  readTorrentFile,
  type TorrentAnalysis,
} from '~/adapters/torrent-magnet'
import { failure, type ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const result = ref<TorrentAnalysis | null>(null)
const processedFile = ref<File | null>(null)
const error = ref<ToolError | null>(null)
const notice = ref('')
const isProcessing = ref(false)
const operationSequence = ref(0)

const selectedFileSummary = computed(() => {
  if (!selectedFile.value) {
    return ''
  }

  return selectedFile.value.name + ' · ' + formatByteLength(selectedFile.value.size)
})

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

  return result.value ? 'success' : 'idle'
})

const hasPendingChanges = computed(() => Boolean(
  result.value && processedFile.value !== selectedFile.value,
))

const resultStateLabel = computed(() => {
  if (isProcessing.value) {
    return '正在生成新结果'
  }

  return error.value || hasPendingChanges.value
    ? '上一次成功结果'
    : '当前 Magnet'
})

const emptyResultText = computed(() => {
  if (error.value?.code === 'empty-input') {
    return error.value.message
  }

  return selectedFile.value
    ? '文件已选择；点击“分析并生成 Magnet”查看 Torrent 摘要和结果。'
    : '选择一个本地 .torrent 文件后，点击“分析并生成 Magnet”。'
})

const hasResettableState = computed(() => Boolean(
  selectedFile.value
  || result.value
  || error.value
  || notice.value,
))

/** 将字节数转换为适合页面展示的简短文本。 */
function formatByteLength(value: number): string {
  if (value < 1024) {
    return value + ' B'
  }

  if (value < 1024 * 1024) {
    return (value / 1024).toFixed(1) + ' KiB'
  }

  return (value / (1024 * 1024)).toFixed(2) + ' MiB'
}

/** 选择本地 Torrent 文件，只显示文件信息，不提前读取或解析。 */
function handleFileChange(event: Event) {
  if (isProcessing.value) {
    return
  }

  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  error.value = null
  notice.value = ''
}

/** 读取、解析并为当前文件生成完整 Magnet。 */
async function analyze() {
  if (isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''

  if (!selectedFile.value) {
    const emptyInput = failure('empty-input', '请先选择一个本地 .torrent 文件。')
    if (!emptyInput.ok) {
      error.value = emptyInput.error
    }
    return
  }

  const sequence = operationSequence.value + 1
  operationSequence.value = sequence
  isProcessing.value = true

  const processed = await readTorrentFile(selectedFile.value)
  if (sequence !== operationSequence.value) {
    isProcessing.value = false
    return
  }

  if (!processed.ok) {
    error.value = processed.error
    isProcessing.value = false
    return
  }

  result.value = processed.value
  processedFile.value = selectedFile.value
  error.value = null
  isProcessing.value = false
}

/** 复制当前成功生成的 Magnet。 */
async function copyMagnet() {
  if (!result.value || isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''
  const copied = await copyTorrentMagnet(result.value.magnet)

  if (copied.ok) {
    notice.value = copied.value
  } else {
    error.value = copied.error
  }
}

/** 下载当前成功生成的 Magnet 文本。 */
function downloadMagnet() {
  if (!result.value || isProcessing.value) {
    return
  }

  error.value = null
  notice.value = ''
  const downloaded = downloadTorrentMagnet(result.value.magnet)

  if (downloaded.ok) {
    notice.value = downloaded.value
  } else {
    error.value = downloaded.error
  }
}

/** 清空当前文件、结果、错误和通知。 */
function clearAll() {
  if (isProcessing.value) {
    return
  }

  operationSequence.value += 1
  selectedFile.value = null
  result.value = null
  processedFile.value = null
  error.value = null
  notice.value = ''

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split torrent-magnet-tool">
    <ToolInputPanel
      title="分析 Torrent"
      description="选择一个本地 .torrent 文件，严格读取 v1 元数据并在当前浏览器内存中生成 Magnet。"
    >
      <label class="tool-field">
        <span class="tool-field__label">Torrent 文件</span>
        <input
          ref="fileInputRef"
          class="torrent-magnet-tool__file-input"
          type="file"
          accept=".torrent,application/x-bittorrent,application/octet-stream"
          :disabled="isProcessing"
          aria-label="选择 Torrent 文件"
          @change="handleFileChange"
        >
        <span class="torrent-magnet-tool__file-note">
          {{ selectedFileSummary || '只处理单个本地文件；最大 10 MiB，不上传、不访问网络。' }}
        </span>
      </label>

      <p class="tool-note torrent-magnet-tool__privacy-note">
        选择文件后不会自动解析；点击分析时才读取、校验 Bencode 并计算 v1 info-hash。
      </p>

      <div class="tool-panel__actions">
        <button
          type="button"
          class="button button--primary"
          :disabled="isProcessing"
          @click="analyze"
        >
          {{ isProcessing ? '分析中…' : '分析并生成 Magnet' }}
        </button>
        <ClearButton :disabled="!hasResettableState || isProcessing" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="Torrent 结果"
      :status="status"
      :error="error"
      :show-content-on-processing="Boolean(result)"
      :preserve-content-on-error="true"
      :empty-text="emptyResultText"
      processing-text="正在读取 Torrent、计算 info-hash 并生成 Magnet，请稍候。"
    >
      <div v-if="result" class="torrent-magnet-tool__result">
        <div class="torrent-magnet-tool__result-heading">
          <div>
            <p class="torrent-magnet-tool__result-label">{{ resultStateLabel }}</p>
            <p class="torrent-magnet-tool__result-summary">
              {{ result.format.toUpperCase() }} · {{ result.mode === 'single' ? '单文件' : '多文件' }} · {{ formatByteLength(result.totalSize) }}
            </p>
          </div>
          <span class="torrent-magnet-tool__format-badge">v1 Magnet</span>
        </div>

        <dl class="torrent-magnet-tool__meta">
          <div>
            <dt>名称</dt>
            <dd>{{ result.name }}</dd>
          </div>
          <div>
            <dt>文件</dt>
            <dd>{{ result.fileCount }} 个 · {{ result.mode === 'single' ? '单文件' : '多文件' }}</dd>
          </div>
          <div>
            <dt>Piece 长度</dt>
            <dd>{{ formatByteLength(result.pieceLength) }}</dd>
          </div>
          <div>
            <dt>v1 Piece 数量</dt>
            <dd>{{ result.pieceCount }}</dd>
          </div>
          <div>
            <dt>Info-hash</dt>
            <dd class="torrent-magnet-tool__hash">{{ result.infoHashHex }}</dd>
          </div>
          <div>
            <dt>输入文件</dt>
            <dd>{{ result.fileName }} · {{ formatByteLength(result.byteLength) }}</dd>
          </div>
        </dl>

        <section class="torrent-magnet-tool__section" aria-labelledby="torrent-magnet-trackers-title">
          <div class="torrent-magnet-tool__section-heading">
            <h3 id="torrent-magnet-trackers-title">Tracker</h3>
            <span>{{ result.trackers.length }} 个</span>
          </div>
          <ul v-if="result.trackers.length" class="torrent-magnet-tool__tracker-list">
            <li v-for="(tracker, index) in result.trackers" :key="index">
              <code>{{ tracker.display }}</code>
              <span v-if="!tracker.uri">（仅展示，未放入 Magnet）</span>
            </li>
          </ul>
          <p v-else class="torrent-magnet-tool__muted">未声明 Tracker。</p>
          <p v-if="result.omittedTrackerCount" class="tool-note torrent-magnet-tool__encoding-note">
            {{ result.omittedTrackerCount }} 个 Tracker 因 UTF-8 无法安全编码，未写入 Magnet。
          </p>
        </section>

        <section class="torrent-magnet-tool__section" aria-labelledby="torrent-magnet-files-title">
          <div class="torrent-magnet-tool__section-heading">
            <h3 id="torrent-magnet-files-title">文件清单摘要</h3>
            <span>显示 {{ result.files.length }} / {{ result.fileCount }}</span>
          </div>
          <ul class="torrent-magnet-tool__file-list">
            <li v-for="(file, index) in result.files" :key="index">
              <span>{{ file.path }}</span>
              <span>{{ formatByteLength(file.length) }}</span>
            </li>
          </ul>
          <p v-if="result.filesTruncated" class="tool-note torrent-magnet-tool__encoding-note">
            文件较多，仅展示前 2,000 项；总大小和文件数量仍按完整元数据统计。
          </p>
        </section>

        <label class="tool-field torrent-magnet-tool__magnet-field">
          <span class="tool-field__label">Magnet 链接</span>
          <textarea
            class="tool-textarea tool-textarea--code torrent-magnet-tool__magnet"
            :value="result.magnet"
            rows="5"
            readonly
            spellcheck="false"
            aria-label="生成的 Magnet 链接"
          />
        </label>

        <p v-if="result.hasEncodingWarning" class="tool-note torrent-magnet-tool__encoding-note" role="status">
          部分名称、路径或 Tracker 使用了替换字符；无法安全放入 Magnet 的可选文本已省略。info-hash 仍按原始字节计算。
        </p>
        <p v-if="error" class="tool-note torrent-magnet-tool__stale-note" role="status">
          当前操作失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges" class="tool-note torrent-magnet-tool__stale-note" role="status">
          当前选择的文件尚未分析，以上为上一次成功生成的结果。
        </p>
      </div>

      <p v-if="notice" class="tool-note" role="status">{{ notice }}</p>

      <template #actions>
        <button
          v-if="result"
          type="button"
          class="button button--secondary"
          :disabled="isProcessing"
          @click="copyMagnet"
        >
          复制 Magnet
        </button>
        <button
          v-if="result"
          type="button"
          class="button button--primary"
          :disabled="isProcessing"
          @click="downloadMagnet"
        >
          下载 TXT
        </button>
      </template>
    </ToolResultPanel>
  </div>
</template>
