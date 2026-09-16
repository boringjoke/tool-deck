<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  downloadSignaturePng,
  renderSignatureCanvas,
} from '~/adapters/signature'
import { createDownloadFileName } from '~/adapters/download'
import {
  appendSignatureStrokePoint,
  beginSignatureStroke,
  clearSignatureStrokes,
  commitSignatureStroke,
  hasSignatureContent,
  normalizeSignaturePoint,
  SIGNATURE_CANVAS_HEIGHT,
  SIGNATURE_CANVAS_WIDTH,
  undoSignatureStroke,
  type SignaturePoint,
  type SignatureStroke,
  type SignatureStrokes,
} from '~/core/signature'
import { failure, type ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const strokes = ref<SignatureStroke[]>([])
const activeStroke = ref<SignatureStroke | null>(null)
const activePointerId = ref<number | null>(null)
const error = ref<ToolError | null>(null)
const exportNotice = ref('')
const isExporting = ref(false)

const displayedStrokes = computed<SignatureStrokes>(() => (
  activeStroke.value ? [...strokes.value, activeStroke.value] : strokes.value
))
const hasDisplayedContent = computed(() => hasSignatureContent(displayedStrokes.value))
const hasCommittedContent = computed(() => hasSignatureContent(strokes.value))
const isDrawing = computed(() => activeStroke.value !== null)
const status = computed<ToolUiStatus>(() => {
  if (isExporting.value || isDrawing.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return hasCommittedContent.value ? 'success' : 'idle'
})
const hasResettableState = computed(() => Boolean(
  strokes.value.length
  || activeStroke.value
  || error.value
  || exportNotice.value,
))

/** 将指针事件转换为固定 1200×400 逻辑画布坐标。 */
function getPointFromEvent(event: PointerEvent): ReturnType<typeof normalizeSignaturePoint> {
  const canvas = canvasRef.value
  if (!canvas) {
    return failure('operation-failed', '签名画布尚未准备好，请稍后重试。')
  }

  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return failure('operation-failed', '签名画布暂时不可用，请稍后重试。')
  }

  const point: SignaturePoint = {
    x: ((event.clientX - rect.left) / rect.width) * SIGNATURE_CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * SIGNATURE_CANVAS_HEIGHT,
  }

  return normalizeSignaturePoint(point)
}

/** 重绘当前笔画，Canvas 失败时保留笔画并展示可见错误。 */
function redrawCanvas() {
  if (!canvasRef.value) {
    return
  }

  const rendered = renderSignatureCanvas(canvasRef.value, displayedStrokes.value)
  if (!rendered.ok) {
    error.value = rendered.error
  }
}

/** 开始一条新的鼠标、触摸或触控笔笔画。 */
function handlePointerDown(event: PointerEvent) {
  if (isExporting.value || activePointerId.value !== null) {
    return
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return
  }

  event.preventDefault()
  const point = getPointFromEvent(event)
  if (!point.ok) {
    error.value = point.error
    return
  }

  const started = beginSignatureStroke(point.value)
  if (!started.ok) {
    error.value = started.error
    return
  }

  error.value = null
  exportNotice.value = ''
  activePointerId.value = event.pointerId
  activeStroke.value = started.value

  try {
    canvasRef.value?.setPointerCapture(event.pointerId)
  } catch {
    // Pointer capture is an enhancement; the drawing can continue without it.
  }
}

/** 追加当前笔画的坐标，坐标越界由核心规则收敛到画布边界。 */
function handlePointerMove(event: PointerEvent) {
  if (activePointerId.value !== event.pointerId || !activeStroke.value) {
    return
  }

  event.preventDefault()
  const point = getPointFromEvent(event)
  if (!point.ok) {
    error.value = point.error
    return
  }

  const appended = appendSignatureStrokePoint(activeStroke.value, point.value)
  if (!appended.ok) {
    error.value = appended.error
    return
  }

  activeStroke.value = appended.value
}

/** 结束当前指针笔画并写入多级撤销栈。 */
function finishPointerStroke(event: PointerEvent) {
  if (activePointerId.value !== event.pointerId) {
    return
  }

  event.preventDefault()
  const pointerId = activePointerId.value
  const currentStroke = activeStroke.value
  activePointerId.value = null
  activeStroke.value = null

  if (pointerId !== null) {
    try {
      if (canvasRef.value?.hasPointerCapture(pointerId)) {
        canvasRef.value.releasePointerCapture(pointerId)
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  if (!currentStroke) {
    return
  }

  const committed = commitSignatureStroke(strokes.value, currentStroke)
  if (!committed.ok) {
    error.value = committed.error
    return
  }

  strokes.value = committed.value
  error.value = null
}

/** 撤销最近一条完整笔画。 */
function undo() {
  if (isExporting.value || isDrawing.value || !strokes.value.length) {
    return
  }

  strokes.value = undoSignatureStroke(strokes.value)
  error.value = null
  exportNotice.value = ''
}

/** 清空全部笔画并恢复空状态，不弹出二次确认。 */
function clearAll() {
  if (isExporting.value) {
    return
  }

  const pointerId = activePointerId.value
  if (pointerId !== null) {
    try {
      if (canvasRef.value?.hasPointerCapture(pointerId)) {
        canvasRef.value.releasePointerCapture(pointerId)
      }
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  activePointerId.value = null
  activeStroke.value = null
  strokes.value = clearSignatureStrokes()
  error.value = null
  exportNotice.value = ''
}

/** 将当前签名渲染为透明 PNG，并通过既有 Blob 下载适配器保存。 */
async function exportPng() {
  if (isExporting.value || isDrawing.value) {
    return
  }

  if (!hasCommittedContent.value) {
    const emptyExport = failure('invalid-state', '请先绘制签名后再导出 PNG。')
    if (!emptyExport.ok) {
      error.value = emptyExport.error
    }
    exportNotice.value = ''
    return
  }

  isExporting.value = true
  error.value = null
  exportNotice.value = ''

  const exported = await downloadSignaturePng(
    strokes.value,
    createDownloadFileName('signature', 'png'),
  )

  if (!exported.ok) {
    error.value = exported.error
  } else {
    exportNotice.value = exported.value
  }

  isExporting.value = false
}

onMounted(() => {
  redrawCanvas()
  window.addEventListener('resize', redrawCanvas)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', redrawCanvas)
})

watch(displayedStrokes, redrawCanvas, { deep: true })
</script>

<template>
  <div class="tool-workspace tool-workspace--split signature-tool">
    <ToolInputPanel
      title="绘制签名"
      description="在透明画布上写下签名，内容只保留在当前页面内存，不会上传或保存。"
    >
      <div class="signature-tool__canvas-frame">
        <canvas
          ref="canvasRef"
          class="signature-tool__canvas"
          width="1200"
          height="400"
          tabindex="0"
          aria-label="电子签名画布"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="finishPointerStroke"
          @pointercancel="finishPointerStroke"
          @lostpointercapture="finishPointerStroke"
        />
        <span v-if="!hasDisplayedContent" class="signature-tool__canvas-hint" aria-hidden="true">
          在这里写下你的签名
        </span>
      </div>

      <p class="tool-note signature-tool__fixed-note">
        1200 × 400 px · 透明背景 · 鼠标、触摸和触控笔均可使用
      </p>

      <div class="tool-panel__actions">
        <button
          type="button"
          class="button button--secondary"
          :disabled="!strokes.length || isDrawing || isExporting"
          @click="undo"
        >
          撤销一笔
        </button>
        <ClearButton :disabled="!hasResettableState || isExporting" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="导出签名"
      :status="status"
      :error="error"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      empty-text="在左侧画布绘制签名后，可以下载透明 PNG。"
    >
      <div v-if="hasDisplayedContent" class="signature-tool__result">
        <div class="signature-tool__result-heading">
          <div>
            <p class="signature-tool__result-label">
              {{ isDrawing ? '正在绘制' : '签名已准备好' }}
            </p>
            <p class="signature-tool__result-summary">
              {{ displayedStrokes.length }} 笔 · 导出尺寸 {{ SIGNATURE_CANVAS_WIDTH }} × {{ SIGNATURE_CANVAS_HEIGHT }} px
            </p>
          </div>
          <span class="signature-tool__format-badge">透明 PNG</span>
        </div>

        <dl class="signature-tool__meta">
          <div>
            <dt>画布</dt>
            <dd>{{ SIGNATURE_CANVAS_WIDTH }} × {{ SIGNATURE_CANVAS_HEIGHT }} px</dd>
          </div>
          <div>
            <dt>背景</dt>
            <dd>透明</dd>
          </div>
          <div>
            <dt>撤销</dt>
            <dd>按笔画多级撤销</dd>
          </div>
          <div>
            <dt>文件名</dt>
            <dd>signature-YYYYMMDD.png</dd>
          </div>
        </dl>
      </div>

      <p v-if="exportNotice" class="tool-note" role="status">{{ exportNotice }}</p>

      <template #actions>
        <button
          type="button"
          class="button button--primary"
          :disabled="!hasCommittedContent || isDrawing || isExporting"
          @click="exportPng"
        >
          {{ isExporting ? '导出中…' : '导出透明 PNG' }}
        </button>
      </template>
    </ToolResultPanel>
  </div>
</template>
