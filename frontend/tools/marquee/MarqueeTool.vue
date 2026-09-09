<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  calculateMarqueeDurationMs,
  MARQUEE_DEFAULT_BACKGROUND_COLOR,
  MARQUEE_DEFAULT_FONT_SIZE,
  MARQUEE_DEFAULT_SPEED,
  MARQUEE_DEFAULT_TEXT_COLOR,
  MARQUEE_MAX_FONT_SIZE,
  MARQUEE_MAX_TEXT_LENGTH,
  MARQUEE_MAX_SPEED,
  MARQUEE_MIN_FONT_SIZE,
  MARQUEE_MIN_SPEED,
  normalizeMarqueeText,
  validateMarqueeConfig,
  type MarqueeConfig,
  type MarqueeSpeed,
} from '~/core/marquee'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

const speedOptions = [
  { value: 1, label: '慢' },
  { value: 2, label: '较慢' },
  { value: 3, label: '标准' },
  { value: 4, label: '较快' },
  { value: 5, label: '快' },
] as const

const text = ref('')
const fontSize = ref(MARQUEE_DEFAULT_FONT_SIZE)
const textColor = ref(MARQUEE_DEFAULT_TEXT_COLOR)
const backgroundColor = ref(MARQUEE_DEFAULT_BACKGROUND_COLOR)
const speed = ref<MarqueeSpeed>(MARQUEE_DEFAULT_SPEED)
const currentConfig = ref<MarqueeConfig | null>(null)
const error = ref<ToolError | null>(null)
const isDisplaying = ref(false)
const isReducedMotion = ref(false)
const isFullscreen = ref(false)
const isWakeLockActive = ref(false)
const capabilityNotices = ref<string[]>([])
const animationDurationMs = ref(6_000)
const animationViewportWidthPx = ref(0)
const animationTextWidthPx = ref(0)
const displayPanel = ref<HTMLElement | null>(null)
const displayText = ref<HTMLElement | null>(null)
let wakeLock: WakeLockSentinelLike | null = null
let fullscreenRequestedByTool = false

const speedLabel = computed(() => speedOptions.find((option) => option.value === speed.value)?.label ?? '标准')

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (isDisplaying.value) {
    return 'processing'
  }

  return currentConfig.value ? 'success' : 'idle'
})

const resultStatusLabel = computed(() => {
  if (isDisplaying.value) {
    return isReducedMotion.value ? '静态展示中' : '滚动展示中'
  }

  return currentConfig.value ? '已结束展示' : '等待开始'
})

const normalizedDraftText = computed(() => normalizeMarqueeText(text.value))

const previewConfig = computed<MarqueeConfig>(() => ({
  text: normalizedDraftText.value || '请输入展示文字',
  fontSize: clampPreviewNumber(fontSize.value, MARQUEE_MIN_FONT_SIZE, MARQUEE_MAX_FONT_SIZE, MARQUEE_DEFAULT_FONT_SIZE),
  textColor: normalizePreviewColor(textColor.value, MARQUEE_DEFAULT_TEXT_COLOR),
  backgroundColor: normalizePreviewColor(backgroundColor.value, MARQUEE_DEFAULT_BACKGROUND_COLOR),
  speed: clampPreviewNumber(speed.value, MARQUEE_MIN_SPEED, MARQUEE_MAX_SPEED, MARQUEE_DEFAULT_SPEED) as MarqueeSpeed,
}))

const stageConfig = computed(() => currentConfig.value ?? previewConfig.value)

const displayStyle = computed<Record<string, string>>(() => ({
  '--marquee-background-color': stageConfig.value.backgroundColor,
  '--marquee-text-color': stageConfig.value.textColor,
  '--marquee-font-size': `${stageConfig.value.fontSize}px`,
  '--marquee-duration': `${animationDurationMs.value}ms`,
  '--marquee-viewport-width': `${animationViewportWidthPx.value}px`,
  '--marquee-text-width': `${animationTextWidthPx.value}px`,
}))

const displayClasses = computed(() => ({
  'marquee-tool__display--active': isDisplaying.value && !isReducedMotion.value,
  'marquee-tool__display--reduced': isDisplaying.value && isReducedMotion.value,
}))

const hasResettableState = computed(() => Boolean(
  text.value
  || fontSize.value !== MARQUEE_DEFAULT_FONT_SIZE
  || textColor.value !== MARQUEE_DEFAULT_TEXT_COLOR
  || backgroundColor.value !== MARQUEE_DEFAULT_BACKGROUND_COLOR
  || speed.value !== MARQUEE_DEFAULT_SPEED
  || currentConfig.value
  || error.value
  || isDisplaying.value
  || capabilityNotices.value.length,
))

/** 将不可靠的预览数字限制在页面控件可展示的范围内。 */
function clampPreviewNumber(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

/** 将不可靠的预览颜色回退为安全的六位十六进制颜色。 */
function normalizePreviewColor(value: string, fallback: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback
}

/** 判断当前浏览器是否要求减少非必要动态效果。 */
function shouldReduceMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 清除当前错误，让用户继续编辑配置。 */
function clearError(): void {
  error.value = null
}

/** 添加不重复的浏览器能力提示。 */
function addCapabilityNotice(message: string): void {
  if (!capabilityNotices.value.includes(message)) {
    capabilityNotices.value.push(message)
  }
}

/** 根据当前文字宽度重新计算 CSS 滚动动画时长。 */
function updateAnimationMetrics(): void {
  if (!isDisplaying.value || !displayText.value || !displayPanel.value || !currentConfig.value || isReducedMotion.value) {
    return
  }

  const durationResult = calculateMarqueeDurationMs(
    displayText.value.scrollWidth,
    displayPanel.value.clientWidth,
    currentConfig.value.speed,
  )

  animationTextWidthPx.value = displayText.value.scrollWidth
  animationViewportWidthPx.value = displayPanel.value.clientWidth

  if (durationResult.ok) {
    animationDurationMs.value = durationResult.value
  }
}

/** 处理展示区域尺寸变化，保持滚动速度与视口尺寸同步。 */
function handleResize(): void {
  updateAnimationMetrics()
}

/** 处理 Wake Lock 被系统释放后的状态和提示。 */
function handleWakeLockRelease(): void {
  wakeLock = null
  isWakeLockActive.value = false

  if (isDisplaying.value) {
    addCapabilityNotice('屏幕常亮已被系统释放，请手动保持屏幕常亮。')
  }
}

/** 释放本项持有的屏幕常亮锁。 */
async function releaseWakeLock(): Promise<void> {
  const activeWakeLock = wakeLock
  wakeLock = null
  isWakeLockActive.value = false

  if (!activeWakeLock) {
    return
  }

  try {
    await activeWakeLock.release()
  } catch {
    // 屏幕常亮释放失败不影响结束展示。
  }
}

/** 尝试申请屏幕常亮，失败时保留展示并显示非阻断提示。 */
async function requestWakeLock(): Promise<void> {
  if (!isDisplaying.value || typeof navigator === 'undefined') {
    return
  }

  if (wakeLock) {
    return
  }

  const navigatorWithWakeLock = navigator as unknown as NavigatorWithWakeLock

  if (!navigatorWithWakeLock.wakeLock || typeof navigatorWithWakeLock.wakeLock.request !== 'function') {
    addCapabilityNotice('当前浏览器不支持屏幕常亮，请手动保持屏幕常亮。')
    return
  }

  try {
    wakeLock = await navigatorWithWakeLock.wakeLock.request('screen')
    isWakeLockActive.value = true
    wakeLock.addEventListener?.('release', handleWakeLockRelease)
  } catch {
    addCapabilityNotice('屏幕常亮不可用，请手动保持屏幕常亮。')
  }
}

/** 在页面恢复可见时重新申请可能被系统释放的屏幕常亮锁。 */
function handleVisibilityChange(): void {
  if (isDisplaying.value && document.visibilityState === 'visible') {
    void requestWakeLock()
  }
}

/** 处理用户主动退出全屏，保持展示状态并提示当前已降级。 */
function handleFullscreenChange(): void {
  const fullscreenActive = document.fullscreenElement === displayPanel.value
  isFullscreen.value = fullscreenActive

  if (!fullscreenActive && isDisplaying.value && fullscreenRequestedByTool) {
    fullscreenRequestedByTool = false
    addCapabilityNotice('已退出全屏，当前继续使用页面内展示。')
  }

  void nextTick(updateAnimationMetrics)
}

/** 尝试在全屏展示后锁定横屏，失败时不阻断展示。 */
async function requestLandscapeLock(): Promise<void> {
  if (!isFullscreen.value || typeof window === 'undefined') {
    return
  }

  const orientation = window.screen?.orientation

  if (!orientation || typeof orientation.lock !== 'function') {
    addCapabilityNotice('当前浏览器无法自动横屏，请手动旋转设备。')
    return
  }

  try {
    await orientation.lock('landscape')
  } catch {
    addCapabilityNotice('未能自动横屏，请手动旋转设备。')
  }
}

/** 尝试进入全屏并按浏览器能力降级为页面内展示。 */
async function requestFullscreenDisplay(): Promise<void> {
  const element = displayPanel.value

  if (!element || typeof element.requestFullscreen !== 'function') {
    addCapabilityNotice('当前浏览器不支持全屏，已使用页面内展示。')
    return
  }

  try {
    await element.requestFullscreen()
    fullscreenRequestedByTool = true
    isFullscreen.value = true
    await requestLandscapeLock()
  } catch {
    addCapabilityNotice('全屏不可用，当前使用页面内展示。')
  }
}

/** 开始一次固定配置的手持弹幕展示，并申请可选的浏览器展示能力。 */
async function startDisplay(): Promise<void> {
  if (isDisplaying.value) {
    return
  }

  const configResult = validateMarqueeConfig({
    text: text.value,
    fontSize: fontSize.value,
    textColor: textColor.value,
    backgroundColor: backgroundColor.value,
    speed: speed.value,
  })

  if (!configResult.ok) {
    error.value = configResult.error
    return
  }

  error.value = null
  capabilityNotices.value = []
  currentConfig.value = configResult.value
  isReducedMotion.value = shouldReduceMotion()
  isDisplaying.value = true

  await nextTick()
  updateAnimationMetrics()
  await requestFullscreenDisplay()
  await requestWakeLock()
}

/** 结束展示并清理全屏、横屏和屏幕常亮等本项资源。 */
async function stopDisplay(): Promise<void> {
  isDisplaying.value = false
  const shouldExitFullscreen = fullscreenRequestedByTool && document.fullscreenElement === displayPanel.value
  fullscreenRequestedByTool = false

  await releaseWakeLock()

  if (shouldExitFullscreen && typeof document.exitFullscreen === 'function') {
    try {
      await document.exitFullscreen()
    } catch {
      // 全屏退出失败不阻止页面返回配置状态。
    }
  }

  if (typeof window !== 'undefined' && typeof window.screen?.orientation?.unlock === 'function') {
    try {
      window.screen.orientation.unlock()
    } catch {
      // 横屏解锁失败不影响后续页面操作。
    }
  }

  isFullscreen.value = false
  currentConfig.value = null
}

/** 清空当前文字、视觉配置、展示状态、错误和能力提示。 */
function clearAll(): void {
  void stopDisplay()
  text.value = ''
  fontSize.value = MARQUEE_DEFAULT_FONT_SIZE
  textColor.value = MARQUEE_DEFAULT_TEXT_COLOR
  backgroundColor.value = MARQUEE_DEFAULT_BACKGROUND_COLOR
  speed.value = MARQUEE_DEFAULT_SPEED
  error.value = null
  capabilityNotices.value = []
}

/** 清理页面事件监听器和展示能力，避免组件卸载后残留浏览器状态。 */
async function cleanupDisplay(): Promise<void> {
  await stopDisplay()
}

onMounted(() => {
  isReducedMotion.value = shouldReduceMotion()
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('resize', handleResize)
  void cleanupDisplay()
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split marquee-tool">
    <ToolInputPanel title="手持弹幕" description="在浏览器本地设置一条文字、颜色、字号和速度后进行横向展示。">
      <div class="marquee-tool__intro">
        <span class="marquee-tool__eyebrow">SIGNAL BOARD</span>
        <p>配置一条醒目的展示文字，点击开始后可进入全屏模式。</p>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">展示文字</span>
        <input
          v-model="text"
          class="tool-input"
          type="text"
          autocomplete="off"
          placeholder="请输入展示文字"
          aria-label="展示文字"
          :disabled="isDisplaying"
          @input="clearError"
        >
        <span class="marquee-tool__field-help">{{ Array.from(text).length }}/{{ MARQUEE_MAX_TEXT_LENGTH }} 个字符，换行会转换为空格。</span>
      </label>

      <label class="tool-field">
        <span class="tool-field__label">字号 <strong>{{ fontSize }}px</strong></span>
        <input
          v-model.number="fontSize"
          class="marquee-tool__range"
          type="range"
          :min="MARQUEE_MIN_FONT_SIZE"
          :max="MARQUEE_MAX_FONT_SIZE"
          step="1"
          aria-label="字号"
          :disabled="isDisplaying"
          @input="clearError"
        >
      </label>

      <div class="marquee-tool__color-grid">
        <label class="tool-field">
          <span class="tool-field__label">文字颜色</span>
          <span class="marquee-tool__color-control">
            <input v-model="textColor" type="color" aria-label="文字颜色" :disabled="isDisplaying" @input="clearError">
            <code>{{ textColor }}</code>
          </span>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">背景颜色</span>
          <span class="marquee-tool__color-control">
            <input v-model="backgroundColor" type="color" aria-label="背景颜色" :disabled="isDisplaying" @input="clearError">
            <code>{{ backgroundColor }}</code>
          </span>
        </label>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">滚动速度 <strong>{{ speedLabel }}</strong></span>
        <input
          v-model.number="speed"
          class="marquee-tool__range"
          type="range"
          :min="MARQUEE_MIN_SPEED"
          :max="MARQUEE_MAX_SPEED"
          step="1"
          aria-label="滚动速度"
          :disabled="isDisplaying"
          @input="clearError"
        >
        <span class="marquee-tool__field-help">展示方向固定为从右向左。</span>
      </label>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isDisplaying" @click="startDisplay">
          开始展示
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="展示预览"
      :status="status"
      :error="error"
      aria-live="off"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      :empty-text="''"
    >
      <div
        ref="displayPanel"
        class="marquee-tool__display"
        :class="displayClasses"
        :style="displayStyle"
        :aria-busy="isDisplaying"
      >
        <div class="marquee-tool__display-label">
          <span>{{ isDisplaying ? resultStatusLabel : '实时预览' }}</span>
          <span v-if="isFullscreen">全屏</span>
        </div>

        <div ref="displayText" class="marquee-tool__display-text">{{ stageConfig.text }}</div>

        <div class="marquee-tool__display-footer">
          <span v-if="isDisplaying" class="marquee-tool__display-hint">
            {{ isReducedMotion ? '已按系统设置停用滚动' : '正在从右向左滚动' }}
          </span>
          <span v-if="isWakeLockActive" class="marquee-tool__display-hint">屏幕常亮已启用</span>
          <button v-if="isDisplaying" type="button" class="button button--ghost marquee-tool__stop" @click="stopDisplay">
            结束展示
          </button>
        </div>
      </div>

      <div v-if="capabilityNotices.length" class="marquee-tool__notices" role="status" aria-live="polite">
        <p v-for="notice in capabilityNotices" :key="notice">{{ notice }}</p>
      </div>

      <p class="marquee-tool__accessible-status" aria-live="polite">
        {{ isDisplaying ? `当前展示文字：${stageConfig.text}` : '输入文字后点击“开始展示”。' }}
      </p>
    </ToolResultPanel>
  </div>
</template>
