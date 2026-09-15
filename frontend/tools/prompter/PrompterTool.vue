<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  PROMPTER_DEFAULT_FONT_SIZE,
  PROMPTER_DEFAULT_SPEED,
  PROMPTER_MAX_FONT_SIZE,
  PROMPTER_MAX_TEXT_LENGTH,
  PROMPTER_MIN_FONT_SIZE,
  advancePrompter,
  createPrompterState,
  normalizePrompterText,
  pausePrompter,
  resumePrompter,
  startPrompter,
  stopPrompter,
  validatePrompterConfig,
  type PrompterConfig,
  type PrompterInput,
  type PrompterSpeed,
  type PrompterState,
} from '~/core/prompter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const speedOptions: Array<{ value: PrompterSpeed; label: string; pixels: string }> = [
  { value: 1, label: '慢速', pixels: '24 px/s' },
  { value: 2, label: '舒缓', pixels: '40 px/s' },
  { value: 3, label: '标准', pixels: '60 px/s' },
  { value: 4, label: '快速', pixels: '90 px/s' },
  { value: 5, label: '疾速', pixels: '130 px/s' },
]

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

interface OrientationLike {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}

const text = ref('')
const fontSize = ref(PROMPTER_DEFAULT_FONT_SIZE)
const speed = ref<PrompterSpeed>(PROMPTER_DEFAULT_SPEED)
const mirror = ref(false)
const currentConfig = ref<PrompterConfig | null>(null)
const prompterState = ref<PrompterState | null>(null)
const error = ref<ToolError | null>(null)
const isPreparing = ref(false)
const isReducedMotion = ref(false)
const isFullscreen = ref(false)
const isWakeLockActive = ref(false)
const capabilityNotices = ref<string[]>([])
const displayStage = ref<HTMLElement | null>(null)
const displayTrack = ref<HTMLElement | null>(null)

let animationHandle: number | null = null
let animationHandleType: 'raf' | 'timeout' | null = null
let fullscreenRequestedByTool = false
let wakeLock: WakeLockSentinelLike | null = null
let isUnmounted = false

const isRunning = computed(() => prompterState.value?.status === 'running')
const isPaused = computed(() => prompterState.value?.status === 'paused')
const isFinished = computed(() => prompterState.value?.status === 'finished')
const isSessionActive = computed(() => isRunning.value || isPaused.value || isFinished.value)
const isLocked = computed(() => isPreparing.value || isSessionActive.value)

const textLength = computed(() => Array.from(text.value).length)
const normalizedDraftText = computed(() => normalizePrompterText(text.value))
const previewConfig = computed<PrompterConfig>(() => ({
  text: normalizedDraftText.value,
  fontSize: Math.min(PROMPTER_MAX_FONT_SIZE, Math.max(PROMPTER_MIN_FONT_SIZE, fontSize.value || PROMPTER_DEFAULT_FONT_SIZE)),
  speed: speed.value,
  mirror: mirror.value,
}))
const displayConfig = computed<PrompterConfig>(() => currentConfig.value ?? previewConfig.value)
const displayText = computed(() => displayConfig.value.text || '在左侧输入稿件，开始后文字会沿阅读线缓慢上移。')
const displayOffset = computed(() => prompterState.value?.offsetPx ?? 0)
const trackStyle = computed<Record<string, string>>(() => ({
  '--prompter-font-size': `${displayConfig.value.fontSize}px`,
  transform: `translate3d(0, -${Math.max(0, displayOffset.value)}px, 0)${displayConfig.value.mirror ? ' scaleX(-1)' : ''}`,
}))
const stageClasses = computed(() => ({
  'prompter-tool__stage--active': isRunning.value,
  'prompter-tool__stage--paused': isPaused.value,
  'prompter-tool__stage--finished': isFinished.value,
  'prompter-tool__stage--mirror': displayConfig.value.mirror,
  'prompter-tool__stage--reduced': isReducedMotion.value,
}))

const stateLabel = computed(() => {
  if (isPreparing.value) return '正在准备舞台'

  switch (prompterState.value?.status) {
    case 'running':
      return '滚动中'
    case 'paused':
      return '已暂停'
    case 'finished':
      return '已到末尾'
    case 'stopped':
      return '已停止'
    default:
      return '等待开始'
  }
})

const resultStatus = computed<ToolUiStatus>(() => {
  if (error.value) return 'error'
  if (isPreparing.value || isRunning.value || isPaused.value) return 'processing'
  if (prompterState.value?.status === 'stopped' || isFinished.value) return 'success'
  return 'idle'
})

const primaryActionLabel = computed(() => (isFinished.value ? '重新开始' : '开始滚动'))
const stagePrimaryLabel = computed(() => {
  if (isFinished.value) return '重新开始'
  return isRunning.value ? '暂停' : '继续'
})
const progressLabel = computed(() => {
  if (isFinished.value) return '稿件已滚动至末尾'
  if (isRunning.value || isPaused.value) return `已滚动 ${Math.round(displayOffset.value)} px`
  return '从稿件顶部开始'
})
const hasResettableState = computed(() => (
  text.value.length > 0
  || fontSize.value !== PROMPTER_DEFAULT_FONT_SIZE
  || speed.value !== PROMPTER_DEFAULT_SPEED
  || mirror.value
  || Boolean(prompterState.value)
  || Boolean(error.value)
  || capabilityNotices.value.length > 0
))

/** 返回兼容浏览器环境的单调播放时间戳。 */
function getTimestampMs(): number {
  return window.performance?.now?.() ?? Date.now()
}

/** 将提词器能力降级信息加入可去重的提示队列。 */
function addCapabilityNotice(message: string): void {
  if (!capabilityNotices.value.includes(message)) {
    capabilityNotices.value.push(message)
  }
}

/** 清除会阻挡下一次播放的表单错误。 */
function clearError(): void {
  error.value = null
}

/** 返回当前表单草稿，供核心状态机校验。 */
function getDraftInput(): PrompterInput {
  return {
    text: text.value,
    fontSize: fontSize.value,
    speed: speed.value,
    mirror: mirror.value,
  }
}

/** 测量舞台内容可滚动的最大位移。 */
function measureMaxOffset(): number {
  if (!displayStage.value || !displayTrack.value) return 0
  return Math.max(0, displayTrack.value.scrollHeight - displayStage.value.clientHeight)
}

/** 停止请求动画帧，冻结当前提词位置。 */
function stopAnimation(): void {
  if (animationHandle !== null) {
    if (animationHandleType === 'raf' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(animationHandle)
    } else {
      window.clearTimeout(animationHandle)
    }
    animationHandle = null
    animationHandleType = null
  }
}

/** 处理一帧滚动并把时间差交给纯核心状态机。 */
function updateScroll(timestampMs: number): void {
  animationHandle = null

  if (isUnmounted || !isRunning.value || !prompterState.value) return

  const result = advancePrompter(prompterState.value, timestampMs, measureMaxOffset())

  if (!result.ok) {
    error.value = result.error
    stopAnimation()
    const stoppedResult = stopPrompter(prompterState.value)
    if (stoppedResult.ok) {
      prompterState.value = stoppedResult.value
    }
    currentConfig.value = null
    void releaseDisplayCapabilities()
    return
  }

  prompterState.value = result.value

  if (result.value.status === 'finished') {
    stopAnimation()
    void releaseWakeLock()
    return
  }

  scheduleAnimation()
}

/** 使用浏览器动画帧或定时器降级安排下一次滚动。 */
function scheduleAnimation(): void {
  if (typeof window.requestAnimationFrame === 'function') {
    animationHandleType = 'raf'
    animationHandle = window.requestAnimationFrame(updateScroll)
    return
  }

  animationHandleType = 'timeout'
  animationHandle = window.setTimeout(() => updateScroll(getTimestampMs()), 16)
}

/** 启动提词器的逐帧时间推进。 */
function startAnimation(): void {
  stopAnimation()
  scheduleAnimation()
}

/** 请求进入舞台全屏，并在支持时尝试横屏锁定。 */
async function requestFullscreenDisplay(): Promise<void> {
  const element = displayStage.value

  if (!element?.requestFullscreen) {
    addCapabilityNotice('当前浏览器不支持全屏，提词器将以内嵌舞台继续。')
    return
  }

  try {
    await element.requestFullscreen()
    fullscreenRequestedByTool = true
    isFullscreen.value = true
    await requestLandscapeLock()
  } catch {
    addCapabilityNotice('全屏未获授权，提词器将以内嵌舞台继续。')
  }
}

/** 在全屏成功后请求横屏方向，失败时保留竖屏可用性。 */
async function requestLandscapeLock(): Promise<void> {
  const orientation = (window.screen?.orientation ?? null) as OrientationLike | null

  if (!orientation?.lock) {
    addCapabilityNotice('当前浏览器不支持横屏锁定，请手动旋转设备。')
    return
  }

  try {
    await orientation.lock('landscape')
  } catch {
    addCapabilityNotice('横屏锁定未获授权，请手动旋转设备。')
  }
}

/** 释放提词器自己申请的屏幕方向锁。 */
function unlockLandscape(): void {
  const orientation = (window.screen?.orientation ?? null) as OrientationLike | null

  try {
    orientation?.unlock?.()
  } catch {
    // 方向锁释放失败不应阻挡离开工具。
  }
}

/** 处理屏幕常亮句柄被浏览器释放的情况。 */
function handleWakeLockRelease(): void {
  wakeLock = null
  isWakeLockActive.value = false

  if (isSessionActive.value && !isFinished.value) {
    addCapabilityNotice('屏幕常亮已被浏览器释放，滚动内容仍可继续。')
  }
}

/** 请求屏幕常亮，失败时只记录提示而不阻断播放。 */
async function requestWakeLock(): Promise<void> {
  const wakeLockApi = (navigator as unknown as NavigatorWithWakeLock).wakeLock

  if (!wakeLockApi?.request) {
    addCapabilityNotice('当前浏览器不支持屏幕常亮，播放期间请保持屏幕唤醒。')
    return
  }

  if (wakeLock) return

  try {
    wakeLock = await wakeLockApi.request('screen')
    isWakeLockActive.value = true
    wakeLock.addEventListener?.('release', handleWakeLockRelease)
  } catch {
    addCapabilityNotice('屏幕常亮未获授权，播放期间请保持屏幕唤醒。')
  }
}

/** 释放屏幕常亮句柄。 */
async function releaseWakeLock(): Promise<void> {
  const sentinel = wakeLock
  wakeLock = null
  isWakeLockActive.value = false

  if (!sentinel) return

  try {
    await sentinel.release()
  } catch {
    // 句柄已经失效时无需阻挡工具清理。
  }
}

/** 释放全屏、横屏和屏幕常亮等由工具申请的浏览器能力。 */
async function releaseDisplayCapabilities(): Promise<void> {
  fullscreenRequestedByTool = false
  await releaseWakeLock()
  unlockLandscape()

  if (document.fullscreenElement === displayStage.value) {
    try {
      await document.exitFullscreen()
    } catch {
      // 浏览器已退出全屏时无需重复处理。
    }
  }

  isFullscreen.value = false
}

/** 开始一次新的提词播放，并从稿件顶部计时。 */
async function startDisplay(): Promise<void> {
  if (isPreparing.value || isRunning.value || isPaused.value) return

  clearError()
  capabilityNotices.value = []

  const configResult = validatePrompterConfig(getDraftInput())

  if (!configResult.ok) {
    error.value = configResult.error
    return
  }

  const stateResult = createPrompterState(configResult.value)

  if (!stateResult.ok) {
    error.value = stateResult.error
    return
  }

  isPreparing.value = true
  currentConfig.value = configResult.value
  prompterState.value = stateResult.value

  try {
    await requestFullscreenDisplay()
    await nextTick()
    await requestWakeLock()

    if (isUnmounted || !prompterState.value) return

    const startedResult = startPrompter(prompterState.value, getTimestampMs())

    if (!startedResult.ok) {
      error.value = startedResult.error
      return
    }

    prompterState.value = startedResult.value
    await nextTick()
    isPreparing.value = false
    startAnimation()
  } finally {
    if (isPreparing.value) {
      isPreparing.value = false
    }
  }
}

/** 暂停提词器并保留当前阅读位置。 */
function pauseDisplay(): void {
  if (!prompterState.value || !isRunning.value) return

  const result = pausePrompter(prompterState.value, getTimestampMs())

  if (!result.ok) {
    error.value = result.error
    stopAnimation()
    return
  }

  prompterState.value = result.value
  stopAnimation()
}

/** 从当前阅读位置继续提词器滚动。 */
function resumeDisplay(): void {
  if (!prompterState.value || !isPaused.value) return

  const result = resumePrompter(prompterState.value, getTimestampMs())

  if (!result.ok) {
    error.value = result.error
    return
  }

  clearError()
  prompterState.value = result.value
  void requestWakeLock()
  startAnimation()
}

/** 在舞台内切换暂停与继续。 */
function togglePlayback(): void {
  if (isRunning.value) {
    pauseDisplay()
  } else if (isPaused.value) {
    resumeDisplay()
  }
}

/** 停止本次播放并释放工具申请的浏览器能力。 */
async function stopDisplay(): Promise<void> {
  stopAnimation()

  if (prompterState.value) {
    const result = stopPrompter(prompterState.value)
    if (result.ok) {
      prompterState.value = result.value
    }
  }

  currentConfig.value = null
  await releaseDisplayCapabilities()
}

/** 清除稿件、播放状态、错误和能力提示。 */
async function clearAll(): Promise<void> {
  if (isLocked.value) return

  await stopDisplay()
  text.value = ''
  fontSize.value = PROMPTER_DEFAULT_FONT_SIZE
  speed.value = PROMPTER_DEFAULT_SPEED
  mirror.value = false
  prompterState.value = null
  currentConfig.value = null
  error.value = null
  capabilityNotices.value = []
}

/** 页面隐藏时暂停滚动，避免返回页面后出现位移跳跃。 */
function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden' && isRunning.value) {
    pauseDisplay()
    addCapabilityNotice('页面已隐藏，滚动已暂停；返回后请手动继续。')
    return
  }

  if (document.visibilityState === 'visible' && isSessionActive.value && !isFinished.value) {
    void requestWakeLock()
  }
}

/** 响应用户退出工具全屏，保留内嵌舞台并给出非阻塞提示。 */
function handleFullscreenChange(): void {
  const active = document.fullscreenElement === displayStage.value

  if (!active && isFullscreen.value && fullscreenRequestedByTool && isSessionActive.value) {
    addCapabilityNotice('已退出全屏，提词器将以内嵌舞台继续。')
  }

  isFullscreen.value = active
  if (!active) fullscreenRequestedByTool = false
}

/** 尺寸变化后把已结束的阅读位置限制在新的舞台范围内。 */
function handleResize(): void {
  if (prompterState.value?.status !== 'finished') return

  const maxOffset = measureMaxOffset()
  prompterState.value = {
    ...prompterState.value,
    offsetPx: Math.min(prompterState.value.offsetPx, maxOffset),
  }
}

/** 提供提词器的空格和 Escape 键盘快捷键。 */
function handleKeydown(event: KeyboardEvent): void {
  const target = event.target
  const isTextEntry = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  const isButton = target instanceof HTMLButtonElement

  if (isTextEntry || isButton) return

  if (event.code === 'Space' && (isRunning.value || isPaused.value)) {
    event.preventDefault()
    togglePlayback()
    return
  }

  if (event.key === 'Escape' && isSessionActive.value) {
    event.preventDefault()
    void stopDisplay()
  }
}

/** 绑定浏览器能力和键盘事件。 */
onMounted(() => {
  isReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleResize)
})

/** 离开工具时停止动画并释放所有由工具申请的能力。 */
onBeforeUnmount(() => {
  isUnmounted = true
  stopAnimation()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleResize)
  void releaseDisplayCapabilities()
})
</script>

<template>
  <div class="prompter-tool tool-layout">
    <ToolInputPanel title="提词设置" eyebrow="LOCAL READING DECK">
      <div class="prompter-tool__intro">
        <p class="prompter-tool__kicker">READ AHEAD / 27</p>
        <h2>让文字保持在阅读线上。</h2>
        <p>把演讲稿、台词或拍摄提纲放进舞台，提词器会在本地平滑上移。</p>
      </div>

      <label class="tool-field prompter-tool__script-field">
        <span class="tool-field__label">稿件内容</span>
        <textarea
          v-model="text"
          class="tool-textarea prompter-tool__textarea"
          :disabled="isLocked"
          rows="10"
          placeholder="粘贴需要朗读的稿件……"
          :aria-invalid="error ? 'true' : 'false'"
          @input="clearError"
        />
        <span class="tool-field__hint">{{ textLength.toLocaleString() }} / {{ PROMPTER_MAX_TEXT_LENGTH.toLocaleString() }} Unicode 字符；保留段落换行。</span>
      </label>

      <div class="prompter-tool__settings-grid">
        <label class="tool-field">
          <span class="tool-field__label">字号 <strong>{{ fontSize }} px</strong></span>
          <input
            v-model.number="fontSize"
            class="tool-range"
            type="range"
            :min="PROMPTER_MIN_FONT_SIZE"
            :max="PROMPTER_MAX_FONT_SIZE"
            step="1"
            :disabled="isLocked"
            @input="clearError"
          />
          <span class="tool-field__hint">{{ PROMPTER_MIN_FONT_SIZE }}–{{ PROMPTER_MAX_FONT_SIZE }} px，默认 {{ PROMPTER_DEFAULT_FONT_SIZE }} px</span>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">滚动速度</span>
          <select v-model.number="speed" class="tool-select" :disabled="isLocked" @change="clearError">
            <option v-for="option in speedOptions" :key="option.value" :value="option.value">
              {{ option.label }} · {{ option.pixels }}
            </option>
          </select>
          <span class="tool-field__hint">五档固定速度，播放中不会改变。</span>
        </label>
      </div>

      <label class="prompter-tool__toggle">
        <input v-model="mirror" type="checkbox" :disabled="isLocked" @change="clearError" />
        <span>
          <strong>水平镜像</strong>
          <small>适用于镜面或反射式提词器，默认关闭。</small>
        </span>
      </label>

      <div class="tool-panel__actions prompter-tool__actions">
        <button
          v-if="!isRunning && !isPaused"
          type="button"
          class="button button--primary"
          :disabled="isPreparing"
          @click="startDisplay"
        >
          {{ isPreparing ? '准备中…' : primaryActionLabel }}
        </button>
        <button v-if="isRunning" type="button" class="button button--secondary" @click="pauseDisplay">暂停</button>
        <button v-if="isPaused" type="button" class="button button--primary" @click="resumeDisplay">继续</button>
        <button v-if="isSessionActive" type="button" class="button button--secondary" @click="stopDisplay">停止</button>
        <ClearButton :disabled="isLocked || !hasResettableState" @click="clearAll" />
      </div>

      <p class="tool-hint prompter-tool__hint">
        开始后会尝试全屏、横屏和屏幕常亮；按 Space 暂停/继续，按 Esc 停止。所有浏览器能力均可降级。
      </p>
    </ToolInputPanel>

    <ToolResultPanel
      title="提词舞台"
      :status="resultStatus"
      :error="error"
      empty-text="输入稿件后开始播放"
      processing-text="稿件正在沿阅读线滚动"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
    >
      <div class="prompter-tool__stage-shell">
        <div
          ref="displayStage"
          class="prompter-tool__stage"
          :class="stageClasses"
          tabindex="0"
          role="region"
          aria-label="提词器阅读舞台"
        >
          <div class="prompter-tool__stage-chrome prompter-tool__stage-chrome--top" aria-hidden="true">
            <span>TOOL DECK / PROMPTER</span>
            <span>{{ stateLabel }}</span>
          </div>

          <div ref="displayTrack" class="prompter-tool__track" :style="trackStyle">
            <p>{{ displayText }}</p>
          </div>

          <div class="prompter-tool__reading-guide" aria-hidden="true">
            <span>READ HERE</span>
            <i />
          </div>

          <div v-if="isSessionActive" class="prompter-tool__stage-actions">
            <button type="button" class="prompter-tool__stage-button" @click="isFinished ? startDisplay() : togglePlayback()">
              {{ stagePrimaryLabel }}
            </button>
            <button type="button" class="prompter-tool__stage-button prompter-tool__stage-button--quiet" @click="stopDisplay">停止</button>
          </div>

          <div class="prompter-tool__stage-chrome prompter-tool__stage-chrome--bottom">
            <span>{{ progressLabel }}</span>
            <span v-if="isFullscreen">FULLSCREEN</span>
            <span v-else>Space / Esc</span>
          </div>
        </div>

        <div v-if="capabilityNotices.length > 0" class="prompter-tool__notices" role="status" aria-live="polite">
          <p v-for="notice in capabilityNotices" :key="notice">{{ notice }}</p>
        </div>

        <p class="prompter-tool__privacy">本工具仅在当前浏览器本地处理稿件，不上传、不保存，也不读取摄像头或麦克风。</p>
      </div>
    </ToolResultPanel>
  </div>
</template>
