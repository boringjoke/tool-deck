<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import {
  calculateMetronomeBeatIntervalSeconds,
  createMetronomeState,
  getMetronomeBeat,
  METRONOME_DEFAULT_BEATS_PER_BAR,
  METRONOME_DEFAULT_BPM,
  METRONOME_DEFAULT_VOLUME,
  METRONOME_MAX_BEATS_PER_BAR,
  METRONOME_MAX_BPM,
  METRONOME_MAX_VOLUME,
  METRONOME_MIN_BEATS_PER_BAR,
  METRONOME_MIN_BPM,
  METRONOME_MIN_VOLUME,
  recordMetronomeBeat,
  startMetronome,
  stopMetronome,
  validateMetronomeConfig,
  type MetronomeBeat,
  type MetronomeConfig,
  type MetronomeState,
} from '~/core/metronome'
import {
  createMetronomeAudioEngine,
  type MetronomeAudioEngine,
} from '~/adapters/metronome-audio'
import type { ToolError, ToolResult } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const SCHEDULER_INTERVAL_MS = 25
const SCHEDULE_AHEAD_SECONDS = 0.12
const INITIAL_BEAT_DELAY_SECONDS = 0.05

const beatOptions = Array.from(
  { length: METRONOME_MAX_BEATS_PER_BAR - METRONOME_MIN_BEATS_PER_BAR + 1 },
  (_, index) => index + METRONOME_MIN_BEATS_PER_BAR,
)

interface ScheduledBeat {
  beatNumber: number
  timeSeconds: number
}

const bpm = ref(METRONOME_DEFAULT_BPM)
const beatsPerBar = ref(METRONOME_DEFAULT_BEATS_PER_BAR)
const volume = ref(METRONOME_DEFAULT_VOLUME)
const metronomeState = ref<MetronomeState | null>(null)
const error = ref<ToolError | null>(null)
const isStarting = ref(false)
const isAudioSuspended = ref(false)
const capabilityNotices = ref<string[]>([])
const audioEngine = shallowRef<MetronomeAudioEngine | null>(null)

let schedulerHandle: number | null = null
let visualHandle: number | null = null
let nextBeatNumber = 0
let nextBeatTimeSeconds = 0
let scheduledBeats: ScheduledBeat[] = []
let isUnmounted = false

const isRunning = computed(() => metronomeState.value?.status === 'running')

const resultStatus = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (isStarting.value || isRunning.value) {
    return 'processing'
  }

  if (metronomeState.value?.status === 'stopped') {
    return 'success'
  }

  return 'idle'
})

const previewConfig = computed<MetronomeConfig>(() => ({
  bpm: clampPreviewNumber(bpm.value, METRONOME_MIN_BPM, METRONOME_MAX_BPM, METRONOME_DEFAULT_BPM),
  beatsPerBar: clampPreviewNumber(
    beatsPerBar.value,
    METRONOME_MIN_BEATS_PER_BAR,
    METRONOME_MAX_BEATS_PER_BAR,
    METRONOME_DEFAULT_BEATS_PER_BAR,
  ),
  volume: clampPreviewNumber(volume.value, METRONOME_MIN_VOLUME, METRONOME_MAX_VOLUME, METRONOME_DEFAULT_VOLUME),
}))

const displayConfig = computed(() => isRunning.value && metronomeState.value
  ? metronomeState.value.config
  : previewConfig.value)

const beatSlots = computed(() => Array.from(
  { length: displayConfig.value.beatsPerBar },
  (_, index) => index + 1,
))

const currentBeat = computed<MetronomeBeat | null>(() => {
  const state = metronomeState.value

  if (!state || state.status !== 'running' || state.currentBeatNumber === null) {
    return null
  }

  const beatResult = getMetronomeBeat(state.config, state.currentBeatNumber)
  return beatResult.ok ? beatResult.value : null
})

const currentBeatLabel = computed(() => {
  if (!currentBeat.value) {
    return '—'
  }

  return `第 ${currentBeat.value.beatInBar} / ${displayConfig.value.beatsPerBar} 拍`
})

const stateLabel = computed(() => {
  if (isStarting.value) {
    return '准备音频'
  }

  if (isAudioSuspended.value) {
    return '等待恢复音频'
  }

  if (isRunning.value) {
    return '运行中'
  }

  if (metronomeState.value?.status === 'stopped') {
    return '已停止'
  }

  return '未开始'
})

const accessibleStatus = computed(() => {
  if (error.value) {
    return error.value.message
  }

  if (isStarting.value) {
    return '正在准备本地节拍声音。'
  }

  if (isAudioSuspended.value) {
    return '浏览器暂时暂停了节拍声音，请点击“恢复音频”。'
  }

  if (isRunning.value) {
    return `节拍器运行中，${displayConfig.value.bpm} BPM，每小节 ${displayConfig.value.beatsPerBar} 拍。`
  }

  if (metronomeState.value?.status === 'stopped') {
    return '节拍器已停止，可以修改配置后重新开始。'
  }

  return '设置 BPM 和每小节拍数后，点击“开始”播放节拍。'
})

const hasResettableState = computed(() => Boolean(
  bpm.value !== METRONOME_DEFAULT_BPM
  || beatsPerBar.value !== METRONOME_DEFAULT_BEATS_PER_BAR
  || volume.value !== METRONOME_DEFAULT_VOLUME
  || metronomeState.value
  || error.value
  || capabilityNotices.value.length
  || isAudioSuspended.value,
))

/** 将输入控件中的异常数字限制到预览可展示范围。 */
function clampPreviewNumber(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

/** 清除配置输入变化对应的错误状态。 */
function clearInputError(): void {
  error.value = null
}

/** 添加不重复的浏览器能力提示。 */
function addCapabilityNotice(message: string): void {
  if (!capabilityNotices.value.includes(message)) {
    capabilityNotices.value.push(message)
  }
}

/** 停止页面层的音频调度和视觉刷新循环。 */
function stopLoops(): void {
  if (schedulerHandle !== null) {
    window.clearTimeout(schedulerHandle)
    schedulerHandle = null
  }

  if (visualHandle !== null) {
    window.cancelAnimationFrame(visualHandle)
    visualHandle = null
  }
}

/** 释放当前节拍器的音频引擎和已经计划的 click。 */
async function disposeAudioEngine(): Promise<void> {
  const engine = audioEngine.value
  audioEngine.value = null

  if (!engine) {
    return
  }

  engine.stopScheduledClicks()
  await engine.dispose()
}

/** 将音频调度器从落后的时间点跳到未来，避免恢复时补播积压节拍。 */
function skipMissedBeats(currentTimeSeconds: number, intervalSeconds: number): ToolResult<void> {
  if (nextBeatTimeSeconds >= currentTimeSeconds) {
    return { ok: true, value: undefined }
  }

  const skippedBeats = Math.ceil((currentTimeSeconds - nextBeatTimeSeconds) / intervalSeconds)

  if (!Number.isSafeInteger(skippedBeats) || skippedBeats < 1) {
    return {
      ok: false,
      error: {
        code: 'operation-failed',
        message: '节拍时间无法恢复，请重新开始节拍器。',
      },
    }
  }

  const nextNumber = nextBeatNumber + skippedBeats
  const nextTime = nextBeatTimeSeconds + (skippedBeats * intervalSeconds)

  if (!Number.isSafeInteger(nextNumber) || !Number.isFinite(nextTime)) {
    return {
      ok: false,
      error: {
        code: 'operation-failed',
        message: '节拍时间超出可计算范围，请重新开始节拍器。',
      },
    }
  }

  nextBeatNumber = nextNumber
  nextBeatTimeSeconds = Math.max(nextTime, currentTimeSeconds + INITIAL_BEAT_DELAY_SECONDS)
  return { ok: true, value: undefined }
}

/** 在 Web Audio 时间轴上提前计划未来一小段 click。 */
function scheduleUpcomingBeats(): void {
  schedulerHandle = null

  if (!isRunning.value || isAudioSuspended.value || !audioEngine.value || !metronomeState.value) {
    return
  }

  const engine = audioEngine.value
  const state = metronomeState.value

  if (engine.context.state === 'suspended') {
    markAudioSuspended()
    return
  }

  if (engine.context.state === 'closed') {
    void failRunningSession({
      code: 'operation-failed',
      message: '音频上下文已关闭，请重新开始节拍器。',
    })
    return
  }

  const intervalResult = calculateMetronomeBeatIntervalSeconds(state.config.bpm)

  if (!intervalResult.ok) {
    void failRunningSession(intervalResult.error)
    return
  }

  const currentTimeSeconds = engine.context.currentTime
  const skipResult = skipMissedBeats(currentTimeSeconds, intervalResult.value)

  if (!skipResult.ok) {
    void failRunningSession(skipResult.error)
    return
  }

  const scheduleUntilSeconds = currentTimeSeconds + SCHEDULE_AHEAD_SECONDS
  let scheduledCount = 0

  while (nextBeatTimeSeconds <= scheduleUntilSeconds && scheduledCount < 32) {
    const beatResult = getMetronomeBeat(state.config, nextBeatNumber)

    if (!beatResult.ok) {
      void failRunningSession(beatResult.error)
      return
    }

    const clickResult = engine.scheduleClick(
      nextBeatTimeSeconds,
      state.config.volume,
      beatResult.value.isAccent,
    )

    if (!clickResult.ok) {
      void failRunningSession(clickResult.error)
      return
    }

    scheduledBeats.push({
      beatNumber: nextBeatNumber,
      timeSeconds: nextBeatTimeSeconds,
    })
    nextBeatNumber += 1
    nextBeatTimeSeconds += intervalResult.value
    scheduledCount += 1
  }

  schedulerHandle = window.setTimeout(scheduleUpcomingBeats, SCHEDULER_INTERVAL_MS)
}

/** 更新与音频时间轴对应的可视化当前拍。 */
function updateVisualBeat(): void {
  visualHandle = null

  if (!isRunning.value || isAudioSuspended.value || !audioEngine.value || !metronomeState.value) {
    return
  }

  const currentTimeSeconds = audioEngine.value.context.currentTime
  let latestBeat: ScheduledBeat | null = null

  for (const scheduledBeat of scheduledBeats) {
    if (scheduledBeat.timeSeconds <= currentTimeSeconds) {
      latestBeat = scheduledBeat
    } else {
      break
    }
  }

  if (latestBeat) {
    const beatResult = recordMetronomeBeat(metronomeState.value, latestBeat.beatNumber)

    if (!beatResult.ok) {
      void failRunningSession(beatResult.error)
      return
    }

    metronomeState.value = beatResult.value
    scheduledBeats = scheduledBeats.filter((scheduledBeat) => scheduledBeat.timeSeconds > currentTimeSeconds)
  }

  visualHandle = window.requestAnimationFrame(updateVisualBeat)
}

/** 启动音频调度器和视觉刷新循环。 */
function startLoops(): void {
  stopLoops()
  scheduleUpcomingBeats()
  visualHandle = window.requestAnimationFrame(updateVisualBeat)
}

/** 标记浏览器暂停音频，并停止未来 click 以避免恢复时补播。 */
function markAudioSuspended(): void {
  if (!isRunning.value || isAudioSuspended.value || !audioEngine.value) {
    return
  }

  stopLoops()
  audioEngine.value.stopScheduledClicks()
  scheduledBeats = []
  isAudioSuspended.value = true
  addCapabilityNotice('浏览器暂时暂停了节拍声音，请点击“恢复音频”继续。')
}

/** 处理运行期间的音频调度异常并保留用户配置。 */
async function failRunningSession(runError: ToolError): Promise<void> {
  if (!isRunning.value) {
    return
  }

  stopLoops()
  audioEngine.value?.stopScheduledClicks()
  isAudioSuspended.value = false

  if (metronomeState.value) {
    const stoppedResult = stopMetronome(metronomeState.value)

    if (stoppedResult.ok) {
      metronomeState.value = stoppedResult.value
    }
  }

  error.value = runError
  await disposeAudioEngine()
}

/** 从页面输入读取一份待校验的节拍器配置。 */
function getDraftConfig() {
  return {
    bpm: bpm.value,
    beatsPerBar: beatsPerBar.value,
    volume: volume.value,
  }
}

/** 创建音频引擎、解锁声音并启动一轮节拍器。 */
async function startCurrentMetronome(): Promise<void> {
  if (isStarting.value || isRunning.value) {
    return
  }

  const configResult = validateMetronomeConfig(getDraftConfig())

  if (!configResult.ok) {
    error.value = configResult.error
    return
  }

  error.value = null
  capabilityNotices.value = []
  isAudioSuspended.value = false
  isStarting.value = true
  scheduledBeats = []
  stopLoops()
  await disposeAudioEngine()

  const engineResult = createMetronomeAudioEngine()

  if (!engineResult.ok) {
    error.value = engineResult.error
    isStarting.value = false
    return
  }

  const engine = engineResult.value
  const resumeResult = await engine.resume()

  if (isUnmounted) {
    await engine.dispose()
    return
  }

  if (!resumeResult.ok) {
    await engine.dispose()
    error.value = resumeResult.error
    isStarting.value = false
    return
  }

  const stateResult = createMetronomeState(configResult.value)

  if (!stateResult.ok) {
    await engine.dispose()
    error.value = stateResult.error
    isStarting.value = false
    return
  }

  const startedResult = startMetronome(stateResult.value)

  if (!startedResult.ok) {
    await engine.dispose()
    error.value = startedResult.error
    isStarting.value = false
    return
  }

  audioEngine.value = engine
  metronomeState.value = startedResult.value
  nextBeatNumber = 0
  nextBeatTimeSeconds = engine.context.currentTime + INITIAL_BEAT_DELAY_SECONDS
  isStarting.value = false
  startLoops()
}

/** 在用户手势中恢复被浏览器暂停的音频，并从未来节拍继续。 */
async function resumeCurrentAudio(): Promise<void> {
  if (!isAudioSuspended.value || !audioEngine.value || !isRunning.value) {
    return
  }

  const resumeResult = await audioEngine.value.resume()

  if (!resumeResult.ok) {
    error.value = resumeResult.error
    return
  }

  error.value = null
  isAudioSuspended.value = false
  scheduledBeats = []
  nextBeatTimeSeconds = audioEngine.value.context.currentTime + INITIAL_BEAT_DELAY_SECONDS
  startLoops()
}

/** 停止当前节拍器并释放音频资源。 */
async function stopCurrentMetronome(): Promise<void> {
  if (!isRunning.value) {
    return
  }

  stopLoops()
  audioEngine.value?.stopScheduledClicks()
  scheduledBeats = []
  isAudioSuspended.value = false

  if (metronomeState.value) {
    const stoppedResult = stopMetronome(metronomeState.value)

    if (!stoppedResult.ok) {
      error.value = stoppedResult.error
    } else {
      metronomeState.value = stoppedResult.value
      error.value = null
    }
  }

  capabilityNotices.value = []
  await disposeAudioEngine()
}

/** 清空配置、节拍状态、错误和能力提示。 */
async function clearAll(): Promise<void> {
  await stopCurrentMetronome()
  stopLoops()
  await disposeAudioEngine()

  bpm.value = METRONOME_DEFAULT_BPM
  beatsPerBar.value = METRONOME_DEFAULT_BEATS_PER_BAR
  volume.value = METRONOME_DEFAULT_VOLUME
  metronomeState.value = null
  error.value = null
  isStarting.value = false
  isAudioSuspended.value = false
  capabilityNotices.value = []
  scheduledBeats = []
}

onBeforeUnmount(() => {
  isUnmounted = true
  stopLoops()
  audioEngine.value?.stopScheduledClicks()
  void disposeAudioEngine()
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split metronome-tool">
    <ToolInputPanel title="节拍器配置" description="在浏览器本地播放合成节拍，不上传输入，也不申请麦克风。">
      <div class="metronome-tool__intro">
        <span class="metronome-tool__eyebrow">KEEP THE PULSE</span>
        <p>把速度设定在手边，让每一拍都落在同一条时间线上。</p>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">BPM <strong>{{ bpm }} 拍/分钟</strong></span>
        <div class="metronome-tool__bpm-row">
          <input
            v-model.number="bpm"
            class="tool-input metronome-tool__number-input"
            type="number"
            :min="METRONOME_MIN_BPM"
            :max="METRONOME_MAX_BPM"
            step="1"
            inputmode="numeric"
            aria-label="BPM"
            :disabled="isStarting || isRunning"
            @input="clearInputError"
          >
          <span class="metronome-tool__bpm-unit">BPM</span>
        </div>
        <input
          v-model.number="bpm"
          class="metronome-tool__range"
          type="range"
          :min="METRONOME_MIN_BPM"
          :max="METRONOME_MAX_BPM"
          step="1"
          aria-label="BPM 滑块"
          :disabled="isStarting || isRunning"
          @input="clearInputError"
        >
        <span class="metronome-tool__field-help">范围 {{ METRONOME_MIN_BPM }}–{{ METRONOME_MAX_BPM }}；每拍间隔由 BPM 计算。</span>
      </label>

      <div class="tool-field-grid tool-field-grid--two metronome-tool__config-grid">
        <label class="tool-field">
          <span class="tool-field__label">每小节拍数</span>
          <select
            v-model.number="beatsPerBar"
            class="tool-select"
            aria-label="每小节拍数"
            :disabled="isStarting || isRunning"
            @change="clearInputError"
          >
            <option v-for="option in beatOptions" :key="option" :value="option">
              {{ option }} 拍
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">页面音量 <strong>{{ volume }}%</strong></span>
          <input
            v-model.number="volume"
            class="metronome-tool__range"
            type="range"
            :min="METRONOME_MIN_VOLUME"
            :max="METRONOME_MAX_VOLUME"
            step="1"
            aria-label="页面音量"
            :disabled="isStarting || isRunning"
            @input="clearInputError"
          >
        </label>
      </div>

      <p class="tool-note">每小节第一拍使用更高的提示音；首版不支持节奏细分、tap tempo 和复杂节奏编排。</p>

      <div class="tool-panel__actions">
        <button
          type="button"
          class="button button--primary"
          :disabled="isStarting || isRunning"
          @click="startCurrentMetronome"
        >
          {{ isStarting ? '准备音频…' : '开始' }}
        </button>
        <button
          v-if="isAudioSuspended"
          type="button"
          class="button button--secondary"
          @click="resumeCurrentAudio"
        >
          恢复音频
        </button>
        <button
          v-else-if="isRunning"
          type="button"
          class="button button--secondary"
          @click="stopCurrentMetronome"
        >
          停止
        </button>
        <ClearButton :disabled="!hasResettableState || isStarting || isRunning" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="节拍脉冲"
      :status="resultStatus"
      :error="error"
      aria-live="off"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      :empty-text="''"
    >
      <div
        class="metronome-tool__display"
        :style="{ '--metronome-beats': displayConfig.beatsPerBar }"
        :data-running="isRunning"
      >
        <div class="metronome-tool__display-head">
          <span class="metronome-tool__display-label">AUDIO CLOCK</span>
          <span class="metronome-tool__display-state">{{ stateLabel }}</span>
        </div>

        <div class="metronome-tool__tempo" aria-label="当前节奏">
          <output class="metronome-tool__tempo-value">{{ displayConfig.bpm }}</output>
          <span class="metronome-tool__tempo-unit">BPM</span>
        </div>

        <div class="metronome-tool__beat-rail" role="group" aria-label="每小节节拍">
          <span
            v-for="beat in beatSlots"
            :key="beat"
            class="metronome-tool__beat"
            :class="{
              'metronome-tool__beat--accent': beat === 1,
              'metronome-tool__beat--active': currentBeat?.beatInBar === beat,
            }"
            :aria-current="currentBeat?.beatInBar === beat ? 'step' : undefined"
            :aria-label="`${beat === 1 ? '重拍，' : ''}第 ${beat} 拍`"
          >
            <span>{{ beat }}</span>
          </span>
        </div>

        <div class="metronome-tool__state-grid">
          <div>
            <span>当前节拍</span>
            <strong>{{ currentBeatLabel }}</strong>
          </div>
          <div>
            <span>每小节</span>
            <strong>{{ displayConfig.beatsPerBar }} 拍</strong>
          </div>
        </div>
      </div>

      <div v-if="capabilityNotices.length" class="metronome-tool__notices" role="status" aria-live="polite">
        <p v-for="notice in capabilityNotices" :key="notice">{{ notice }}</p>
      </div>

      <p class="metronome-tool__accessible-status" aria-live="polite">{{ accessibleStatus }}</p>
    </ToolResultPanel>
  </div>
</template>
