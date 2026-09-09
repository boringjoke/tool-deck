<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  createTimerState,
  formatTimerValue,
  parseCountdownDuration,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
  synchronizeTimer,
  type CountdownInput,
  type TimerMode,
  type TimerState,
} from '~/core/timer'
import type { ToolError, ToolResult } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const modeOptions: readonly { value: TimerMode; label: string }[] = [
  { value: 'stopwatch', label: '正计时' },
  { value: 'countdown', label: '倒计时' },
]

const mode = ref<TimerMode>('stopwatch')
const hours = ref('')
const minutes = ref('')
const seconds = ref('')
const error = ref<ToolError | null>(null)
const clockBlocked = ref(false)
const timerState = ref(createDefaultTimerState('stopwatch'))
let refreshHandle: number | null = null

const resultStatus = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (timerState.value.status === 'running') {
    return 'processing'
  }

  if (timerState.value.status === 'paused' || timerState.value.status === 'completed') {
    return 'success'
  }

  return 'idle'
})

const stateLabel = computed(() => {
  const labels = {
    idle: '未开始',
    running: '计时中',
    paused: '已暂停',
    completed: '已结束',
  } as const

  return labels[timerState.value.status]
})

const displayValueMs = computed(() => {
  if (mode.value === 'countdown' && timerState.value.status === 'idle') {
    const parsed = parseCountdownDuration(getCountdownInput())

    if (parsed.ok) {
      return parsed.value
    }
  }

  return timerState.value.valueMs
})

const displayText = computed(() => {
  const formatted = formatTimerValue(displayValueMs.value)
  return formatted.ok ? formatted.value : '--:--:--'
})

const displayLabel = computed(() => mode.value === 'countdown' ? '剩余时间' : '已经过时间')

const emptyText = computed(() => mode.value === 'countdown'
  ? '输入倒计时时长并点击“开始”，剩余时间会显示在这里。'
  : '点击“开始”开始正计时。')

const hasResettableState = computed(() => Boolean(
  mode.value !== 'stopwatch'
  || hours.value
  || minutes.value
  || seconds.value
  || timerState.value.status !== 'idle'
  || error.value,
))

/** 创建指定模式的默认计时器状态。 */
function createDefaultTimerState(nextMode: TimerMode, durationMs = 0): TimerState {
  const result = createTimerState(nextMode, durationMs)

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.value
}

/** 读取当前倒计时输入字段。 */
function getCountdownInput(): CountdownInput {
  return {
    hours: hours.value,
    minutes: minutes.value,
    seconds: seconds.value,
  }
}

/** 停止页面层的显示刷新帧循环。 */
function stopRefreshLoop() {
  if (refreshHandle !== null) {
    cancelAnimationFrame(refreshHandle)
    refreshHandle = null
  }
}

/** 推进一帧页面显示，并在计时运行时继续请求下一帧。 */
function refreshTimerFrame() {
  refreshHandle = null
  synchronizeCurrentTimer()

  if (!clockBlocked.value && timerState.value.status === 'running') {
    refreshHandle = requestAnimationFrame(refreshTimerFrame)
  }
}

/** 启动页面层的显示刷新帧循环，实际时间始终由核心时间戳计算。 */
function startRefreshLoop() {
  stopRefreshLoop()
  refreshHandle = requestAnimationFrame(refreshTimerFrame)
}

/** 处理计时器操作返回的状态或错误。 */
function applyTimerResult(result: ToolResult<TimerState>) {
  if (!result.ok) {
    error.value = result.error
    return
  }

  timerState.value = result.value
  error.value = null
  clockBlocked.value = false

  if (result.value.status === 'running') {
    startRefreshLoop()
  } else {
    stopRefreshLoop()
  }
}

/** 清除当前输入变化对应的错误状态。 */
function clearInputError() {
  error.value = null
}

/** 切换正计时或倒计时模式并停止当前计时。 */
function setMode(nextMode: TimerMode) {
  if (mode.value === nextMode) {
    return
  }

  stopRefreshLoop()
  mode.value = nextMode
  timerState.value = createDefaultTimerState(nextMode)
  error.value = null
  clockBlocked.value = false
}

/** 使用当前倒计时输入创建可运行的计时器状态。 */
function createConfiguredCountdownState(): ToolResult<TimerState> {
  const durationResult = parseCountdownDuration(getCountdownInput())

  if (!durationResult.ok) {
    return durationResult
  }

  return createTimerState('countdown', durationResult.value)
}

/** 同步运行中的计时器并处理后台恢复或时钟回拨。 */
function synchronizeCurrentTimer() {
  if (clockBlocked.value || timerState.value.status !== 'running') {
    return
  }

  const result = synchronizeTimer(timerState.value, Date.now())

  if (!result.ok) {
    error.value = result.error
    clockBlocked.value = true
    stopRefreshLoop()
    return
  }

  timerState.value = result.value

  if (result.value.status !== 'running') {
    stopRefreshLoop()
  }
}

/** 开始当前模式的计时任务。 */
function startCurrentTimer() {
  let state = timerState.value

  if (mode.value === 'countdown') {
    const configured = createConfiguredCountdownState()

    if (!configured.ok) {
      error.value = configured.error
      return
    }

    state = configured.value
  }

  applyTimerResult(startTimer(state, Date.now()))
}

/** 暂停当前正在运行的计时任务。 */
function pauseCurrentTimer() {
  applyTimerResult(pauseTimer(timerState.value, Date.now()))
}

/** 继续当前已暂停的计时任务。 */
function resumeCurrentTimer() {
  applyTimerResult(resumeTimer(timerState.value, Date.now()))
}

/** 重置当前模式的计时值并保留当前倒计时配置。 */
function resetCurrentTimer() {
  stopRefreshLoop()
  let state = timerState.value

  if (mode.value === 'countdown') {
    const configured = createConfiguredCountdownState()

    if (configured.ok) {
      state = configured.value
    }
  }

  const result = resetTimer(state)

  if (!result.ok) {
    error.value = result.error
    return
  }

  timerState.value = result.value
  error.value = null
  clockBlocked.value = false
}

/** 清空计时器输入、结果和错误并恢复默认正计时模式。 */
function clearAll() {
  stopRefreshLoop()
  mode.value = 'stopwatch'
  hours.value = ''
  minutes.value = ''
  seconds.value = ''
  timerState.value = createDefaultTimerState('stopwatch')
  error.value = null
  clockBlocked.value = false
}

/** 在页面重新可见时立即同步运行中的计时器。 */
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    synchronizeCurrentTimer()
  }
}

/** 在窗口重新获得焦点时立即同步运行中的计时器。 */
function handleWindowFocus() {
  synchronizeCurrentTimer()
}

/** 在页面生命周期恢复时立即同步运行中的计时器。 */
function handlePageShow() {
  synchronizeCurrentTimer()
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('pageshow', handlePageShow)
})

onBeforeUnmount(() => {
  stopRefreshLoop()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('pageshow', handlePageShow)
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split timer-tool">
    <div class="timer-tool__mode-tabs" role="group" aria-label="计时模式">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        class="timer-tool__mode-tab"
        :class="{ 'timer-tool__mode-tab--active': mode === option.value }"
        :aria-pressed="mode === option.value"
        @click="setMode(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <ToolInputPanel title="计时配置" description="计时在当前浏览器本地完成，页面恢复后会按时间戳重新同步。">
      <div v-if="mode === 'stopwatch'" class="timer-tool__mode-summary">
        <span class="timer-tool__mode-summary-label">正计时</span>
        <p>从零开始累计经过时间，暂停后不会计算暂停期间的时间。</p>
      </div>

      <template v-else>
        <div class="tool-field-grid tool-field-grid--three timer-tool__countdown-fields">
          <label class="tool-field">
            <span class="tool-field__label">小时（0–99）</span>
            <input
              v-model="hours"
              class="tool-input timer-tool__duration-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              placeholder="0"
              aria-label="倒计时小时"
              :disabled="timerState.status !== 'idle'"
              @input="clearInputError"
            >
          </label>
          <label class="tool-field">
            <span class="tool-field__label">分钟（0–60）</span>
            <input
              v-model="minutes"
              class="tool-input timer-tool__duration-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              placeholder="0"
              aria-label="倒计时分钟"
              :disabled="timerState.status !== 'idle'"
              @input="clearInputError"
            >
          </label>
          <label class="tool-field">
            <span class="tool-field__label">秒（0–60）</span>
            <input
              v-model="seconds"
              class="tool-input timer-tool__duration-input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              placeholder="0"
              aria-label="倒计时秒"
              :disabled="timerState.status !== 'idle'"
              @input="clearInputError"
            >
          </label>
        </div>
        <p class="tool-note">空白字段按 0 处理，倒计时总时长必须大于零；允许输入 99:60:60，显示为 100:01:00.000。</p>
      </template>

      <div class="tool-panel__actions">
        <button
          type="button"
          class="button button--primary"
          :disabled="timerState.status !== 'idle' || clockBlocked"
          @click="startCurrentTimer"
        >
          开始
        </button>
        <button
          v-if="timerState.status === 'running'"
          type="button"
          class="button button--secondary"
          :disabled="clockBlocked"
          @click="pauseCurrentTimer"
        >
          暂停
        </button>
        <button
          v-else-if="timerState.status === 'paused'"
          type="button"
          class="button button--secondary"
          @click="resumeCurrentTimer"
        >
          继续
        </button>
        <button
          v-if="timerState.status !== 'idle' || error"
          type="button"
          class="button button--secondary"
          @click="resetCurrentTimer"
        >
          重置
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="当前计时"
      :status="resultStatus"
      :error="error"
      :aria-live="'off'"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      :empty-text="emptyText"
    >
      <div class="timer-tool__display" :class="{ 'timer-tool__display--completed': timerState.status === 'completed' }">
        <span class="timer-tool__display-label">{{ displayLabel }}</span>
        <output class="timer-tool__display-value" :aria-label="`${displayLabel} ${displayText}`">{{ displayText }}</output>
      </div>
      <div class="timer-tool__state-row">
        <span>状态</span>
        <strong>{{ stateLabel }}</strong>
      </div>
    </ToolResultPanel>
    <p v-if="timerState.status === 'completed'" class="timer-tool__completion" aria-live="assertive">倒计时已结束</p>
  </div>
</template>
