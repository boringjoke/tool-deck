import { failure, success, type ToolResult } from './tool-result'

export type TimerMode = 'stopwatch' | 'countdown'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface CountdownInput {
  hours: string
  minutes: string
  seconds: string
}

export interface TimerState {
  mode: TimerMode
  status: TimerStatus
  durationMs: number
  valueMs: number
  lastNowMs: number | null
}

export const TIMER_MAX_HOURS = 99
export const TIMER_MAX_DURATION_MS = ((TIMER_MAX_HOURS * 60 * 60) + (60 * 60) + 60) * 1000

const TIMER_MAX_MINUTES_OR_SECONDS = 60

/** 校验由页面或测试注入的当前时间戳。 */
function validateNow(nowMs: number): ToolResult<number> {
  if (!Number.isSafeInteger(nowMs)) {
    return failure('operation-failed', '当前浏览器时间无效，无法继续计时，请重置后重试。')
  }

  return success(nowMs)
}

/** 校验倒计时持续时长的内部数值范围。 */
function validateDuration(durationMs: number, allowEmpty: boolean): ToolResult<number> {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > TIMER_MAX_DURATION_MS) {
    return failure('out-of-range', '倒计时时长超出可支持范围。')
  }

  if (!allowEmpty && durationMs === 0) {
    return failure('out-of-range', '倒计时时长必须大于零。')
  }

  return success(durationMs)
}

/** 校验计时器快照，避免非法状态产生伪造的计时结果。 */
function validateTimerState(state: TimerState): ToolResult<TimerState> {
  if (!state || typeof state !== 'object') {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  const candidate = state as Partial<TimerState>
  const validMode = candidate.mode === 'stopwatch' || candidate.mode === 'countdown'
  const validStatus = candidate.status === 'idle'
    || candidate.status === 'running'
    || candidate.status === 'paused'
    || candidate.status === 'completed'

  if (!validMode || !validStatus) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  const durationMs = candidate.durationMs
  const valueMs = candidate.valueMs
  const lastNowMs = candidate.lastNowMs

  if (
    typeof durationMs !== 'number'
    || typeof valueMs !== 'number'
    || !Number.isSafeInteger(durationMs)
    || !Number.isSafeInteger(valueMs)
    || durationMs < 0
    || valueMs < 0
    || durationMs > TIMER_MAX_DURATION_MS
  ) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.mode === 'stopwatch' && durationMs !== 0) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.mode === 'countdown' && valueMs > durationMs) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.status === 'running' && (typeof lastNowMs !== 'number' || !Number.isSafeInteger(lastNowMs))) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.status !== 'running' && lastNowMs !== null) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.status === 'completed' && (candidate.mode !== 'countdown' || valueMs !== 0)) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.mode === 'countdown' && candidate.status === 'idle' && valueMs !== durationMs) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.mode === 'countdown' && candidate.status === 'running' && valueMs <= 0) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  if (candidate.mode === 'countdown' && candidate.status === 'paused' && valueMs <= 0) {
    return failure('operation-failed', '计时器状态无效，请重置后重试。')
  }

  return success(candidate as TimerState)
}

/** 解析小时、分钟和秒输入并生成倒计时持续时长。 */
export function parseCountdownDuration(input: CountdownInput): ToolResult<number> {
  const fields: readonly [
    { key: string; value: string; max: number },
    { key: string; value: string; max: number },
    { key: string; value: string; max: number },
  ] = [
    { key: '小时', value: input.hours.trim(), max: TIMER_MAX_HOURS },
    { key: '分钟', value: input.minutes.trim(), max: TIMER_MAX_MINUTES_OR_SECONDS },
    { key: '秒', value: input.seconds.trim(), max: TIMER_MAX_MINUTES_OR_SECONDS },
  ]

  if (fields.every((field) => !field.value)) {
    return failure('empty-input', '请输入倒计时时长。')
  }

  const values = fields.map((field) => {
    if (!field.value) {
      return 0
    }

    if (!/^\d+$/u.test(field.value)) {
      return null
    }

    const numericValue = Number(field.value)

    return Number.isSafeInteger(numericValue) ? numericValue : null
  })

  const invalidIndex = values.findIndex((value) => value === null)

  if (invalidIndex >= 0) {
    return failure('invalid-input', `${fields[invalidIndex]!.key}必须是非负整数。`)
  }

  const numericValues = values as [number, number, number]

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!

    if (numericValues[index]! > field.max) {
      return failure('out-of-range', `${field.key}范围为 0–${field.max}。`)
    }
  }

  const durationMs = (
    (numericValues[0]! * 60 * 60)
    + (numericValues[1]! * 60)
    + numericValues[2]!
  ) * 1000

  return validateDuration(durationMs, false)
}

/** 创建一个处于初始状态的单实例计时器。 */
export function createTimerState(
  mode: TimerMode,
  durationMs = 0,
): ToolResult<TimerState> {
  if (mode !== 'stopwatch' && mode !== 'countdown') {
    return failure('invalid-input', '计时模式无效。')
  }

  if (mode === 'stopwatch' && durationMs !== 0) {
    return failure('invalid-input', '正计时不需要倒计时持续时长。')
  }

  const durationResult = validateDuration(durationMs, true)

  if (!durationResult.ok) {
    return durationResult
  }

  return success({
    mode,
    status: 'idle',
    durationMs: durationResult.value,
    valueMs: durationResult.value,
    lastNowMs: null,
  })
}

/** 根据运行中的时间戳差值推进计时器状态。 */
function advanceRunningTimer(state: TimerState, nowMs: number): ToolResult<TimerState> {
  const nowResult = validateNow(nowMs)

  if (!nowResult.ok) {
    return nowResult
  }

  if (state.lastNowMs === null) {
    return failure('operation-failed', '计时器缺少运行时间戳，请重置后重试。')
  }

  if (nowMs < state.lastNowMs) {
    return failure('operation-failed', '检测到浏览器时间回拨，计时已暂停推进，请重置后重试。')
  }

  const elapsedMs = nowMs - state.lastNowMs

  if (state.mode === 'stopwatch') {
    const nextValueMs = state.valueMs + elapsedMs

    if (!Number.isSafeInteger(nextValueMs)) {
      return failure('operation-failed', '经过时间超出浏览器可安全计算的范围，请重置后重试。')
    }

    return success({
      ...state,
      valueMs: nextValueMs,
      lastNowMs: nowMs,
    })
  }

  const nextValueMs = state.valueMs - elapsedMs

  if (nextValueMs <= 0) {
    return success({
      ...state,
      status: 'completed',
      valueMs: 0,
      lastNowMs: null,
    })
  }

  return success({
    ...state,
    valueMs: nextValueMs,
    lastNowMs: nowMs,
  })
}

/** 按注入的当前时间同步运行中的计时器。 */
export function synchronizeTimer(
  state: TimerState,
  nowMs: number,
): ToolResult<TimerState> {
  const stateResult = validateTimerState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'running') {
    return success({ ...stateResult.value })
  }

  return advanceRunningTimer(stateResult.value, nowMs)
}

/** 开始处于初始状态的计时器。 */
export function startTimer(
  state: TimerState,
  nowMs: number,
): ToolResult<TimerState> {
  const stateResult = validateTimerState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'idle') {
    return failure('operation-failed', '当前计时器不能重复开始，请先重置。')
  }

  if (stateResult.value.mode === 'countdown' && stateResult.value.durationMs === 0) {
    return failure('out-of-range', '请输入大于零的倒计时时长。')
  }

  const nowResult = validateNow(nowMs)

  if (!nowResult.ok) {
    return nowResult
  }

  return success({
    ...stateResult.value,
    status: 'running',
    lastNowMs: nowMs,
  })
}

/** 暂停正在运行的计时器并保留当前计时值。 */
export function pauseTimer(
  state: TimerState,
  nowMs: number,
): ToolResult<TimerState> {
  const stateResult = validateTimerState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'running') {
    return failure('operation-failed', '当前计时器不能暂停。')
  }

  const advanced = advanceRunningTimer(stateResult.value, nowMs)

  if (!advanced.ok || advanced.value.status === 'completed') {
    return advanced
  }

  return success({
    ...advanced.value,
    status: 'paused',
    lastNowMs: null,
  })
}

/** 从暂停状态继续运行计时器。 */
export function resumeTimer(
  state: TimerState,
  nowMs: number,
): ToolResult<TimerState> {
  const stateResult = validateTimerState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'paused') {
    return failure('operation-failed', '当前计时器不能继续。')
  }

  const nowResult = validateNow(nowMs)

  if (!nowResult.ok) {
    return nowResult
  }

  return success({
    ...stateResult.value,
    status: 'running',
    lastNowMs: nowMs,
  })
}

/** 重置计时器并恢复当前模式的初始计时值。 */
export function resetTimer(state: TimerState): ToolResult<TimerState> {
  const stateResult = validateTimerState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  return success({
    ...stateResult.value,
    status: 'idle',
    valueMs: stateResult.value.mode === 'stopwatch' ? 0 : stateResult.value.durationMs,
    lastNowMs: null,
  })
}

/** 将非负整数毫秒格式化为包含毫秒的完整小时、分、秒文本。 */
export function formatTimerValue(valueMs: number): ToolResult<string> {
  if (!Number.isSafeInteger(valueMs) || valueMs < 0) {
    return failure('operation-failed', '计时显示值无效，请重置后重试。')
  }

  const totalSeconds = Math.floor(valueMs / 1000)
  const milliseconds = valueMs % 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return success([
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    `${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`,
  ].join(':'))
}
