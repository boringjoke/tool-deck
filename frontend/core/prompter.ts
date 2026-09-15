import { failure, success, type ToolResult } from './tool-result'

/** 提词器允许输入的最大 Unicode 字符数。 */
export const PROMPTER_MAX_TEXT_LENGTH = 20_000

/** 提词器允许使用的最小字号。 */
export const PROMPTER_MIN_FONT_SIZE = 32

/** 提词器允许使用的最大字号。 */
export const PROMPTER_MAX_FONT_SIZE = 96

/** 提词器的默认字号。 */
export const PROMPTER_DEFAULT_FONT_SIZE = 56

/** 提词器速度档位的最小值。 */
export const PROMPTER_MIN_SPEED = 1

/** 提词器速度档位的最大值。 */
export const PROMPTER_MAX_SPEED = 5

/** 提词器的默认速度档位。 */
export const PROMPTER_DEFAULT_SPEED: PrompterSpeed = 3

const PROMPTER_SPEED_PIXELS_PER_SECOND: Record<PrompterSpeed, number> = {
  1: 24,
  2: 40,
  3: 60,
  4: 90,
  5: 130,
}

const PROMPTER_STATUSES = ['idle', 'running', 'paused', 'stopped', 'finished'] as const

/** 提词器的五档滚动速度。 */
export type PrompterSpeed = 1 | 2 | 3 | 4 | 5

/** 提词器播放状态。 */
export type PrompterStatus = (typeof PROMPTER_STATUSES)[number]

/** 提词器表单输入。 */
export interface PrompterInput {
  text: string
  fontSize: number
  speed: number
  mirror: boolean
}

/** 已通过校验、可用于播放的提词器配置。 */
export interface PrompterConfig {
  text: string
  fontSize: number
  speed: PrompterSpeed
  mirror: boolean
}

/** 提词器的纯状态快照。 */
export interface PrompterState {
  config: PrompterConfig
  status: PrompterStatus
  offsetPx: number
  lastTimestampMs: number | null
}

/** 规范化稿件换行并去除稿件首尾空白。 */
export function normalizePrompterText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\n').trim()
}

/** 返回提词器速度档位对应的像素每秒。 */
export function getPrompterSpeedPixelsPerSecond(speed: PrompterSpeed): number {
  return PROMPTER_SPEED_PIXELS_PER_SECOND[speed]
}

/** 校验并规范化提词器表单配置。 */
export function validatePrompterConfig(input: PrompterInput): ToolResult<PrompterConfig> {
  if (!input || typeof input !== 'object') {
    return failure('invalid-input', '提词器配置无效。')
  }

  if (typeof input.text !== 'string') {
    return failure('invalid-input', '提词内容必须是文本。')
  }

  const text = normalizePrompterText(input.text)
  const textLength = Array.from(text).length

  if (textLength === 0) {
    return failure('empty-input', '请输入提词内容。')
  }

  if (textLength > PROMPTER_MAX_TEXT_LENGTH) {
    return failure('out-of-range', `提词内容不能超过 ${PROMPTER_MAX_TEXT_LENGTH} 个 Unicode 字符。`)
  }

  if (!Number.isSafeInteger(input.fontSize)
    || input.fontSize < PROMPTER_MIN_FONT_SIZE
    || input.fontSize > PROMPTER_MAX_FONT_SIZE) {
    return failure('out-of-range', `字号必须是 ${PROMPTER_MIN_FONT_SIZE}–${PROMPTER_MAX_FONT_SIZE} 之间的整数。`)
  }

  if (!Number.isSafeInteger(input.speed)
    || input.speed < PROMPTER_MIN_SPEED
    || input.speed > PROMPTER_MAX_SPEED) {
    return failure('out-of-range', `速度必须是 ${PROMPTER_MIN_SPEED}–${PROMPTER_MAX_SPEED} 之间的整数。`)
  }

  if (typeof input.mirror !== 'boolean') {
    return failure('invalid-input', '镜像选项必须是布尔值。')
  }

  return success({
    text,
    fontSize: input.fontSize,
    speed: input.speed as PrompterSpeed,
    mirror: input.mirror,
  })
}

/** 创建处于等待状态的提词器状态。 */
export function createPrompterState(input: PrompterInput): ToolResult<PrompterState> {
  const configResult = validatePrompterConfig(input)

  if (!configResult.ok) {
    return configResult
  }

  return success({
    config: configResult.value,
    status: 'idle',
    offsetPx: 0,
    lastTimestampMs: null,
  })
}

/** 开始或重新开始提词器，并从稿件顶部计时。 */
export function startPrompter(state: PrompterState, nowMs: number): ToolResult<PrompterState> {
  const stateResult = validatePrompterState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (!Number.isFinite(nowMs) || nowMs < 0) {
    return failure('invalid-input', '提词器时间戳无效。')
  }

  if (stateResult.value.status === 'running' || stateResult.value.status === 'paused') {
    return failure('invalid-state', '提词器当前正在播放，请先暂停或停止。')
  }

  return success({
    config: stateResult.value.config,
    status: 'running',
    offsetPx: 0,
    lastTimestampMs: nowMs,
  })
}

/** 按时间戳推进提词器位置，并在到达末尾时结束播放。 */
export function advancePrompter(
  state: PrompterState,
  nowMs: number,
  maxOffsetPx: number,
): ToolResult<PrompterState> {
  const stateResult = validatePrompterState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'running' || stateResult.value.lastTimestampMs === null) {
    return failure('invalid-state', '只有滚动中的提词器可以推进。')
  }

  if (!Number.isFinite(nowMs) || nowMs < stateResult.value.lastTimestampMs) {
    return failure('invalid-input', '提词器时间戳必须单调递增。')
  }

  if (!Number.isFinite(maxOffsetPx) || maxOffsetPx < 0) {
    return failure('invalid-input', '提词器滚动范围无效。')
  }

  const elapsedSeconds = (nowMs - stateResult.value.lastTimestampMs) / 1000
  const nextOffsetPx = Math.min(
    maxOffsetPx,
    stateResult.value.offsetPx + elapsedSeconds * getPrompterSpeedPixelsPerSecond(stateResult.value.config.speed),
  )

  if (nextOffsetPx >= maxOffsetPx) {
    return success({
      config: stateResult.value.config,
      status: 'finished',
      offsetPx: maxOffsetPx,
      lastTimestampMs: null,
    })
  }

  return success({
    config: stateResult.value.config,
    status: 'running',
    offsetPx: nextOffsetPx,
    lastTimestampMs: nowMs,
  })
}

/** 暂停提词器并冻结当前滚动位置。 */
export function pausePrompter(state: PrompterState, nowMs: number): ToolResult<PrompterState> {
  const stateResult = validatePrompterState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'running' || stateResult.value.lastTimestampMs === null) {
    return failure('invalid-state', '只有滚动中的提词器可以暂停。')
  }

  if (!Number.isFinite(nowMs) || nowMs < stateResult.value.lastTimestampMs) {
    return failure('invalid-input', '提词器时间戳必须单调递增。')
  }

  const elapsedSeconds = (nowMs - stateResult.value.lastTimestampMs) / 1000
  const offsetPx = stateResult.value.offsetPx
    + elapsedSeconds * getPrompterSpeedPixelsPerSecond(stateResult.value.config.speed)

  return success({
    config: stateResult.value.config,
    status: 'paused',
    offsetPx,
    lastTimestampMs: null,
  })
}

/** 从冻结位置恢复提词器滚动。 */
export function resumePrompter(state: PrompterState, nowMs: number): ToolResult<PrompterState> {
  const stateResult = validatePrompterState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'paused') {
    return failure('invalid-state', '只有已暂停的提词器可以继续。')
  }

  if (!Number.isFinite(nowMs) || nowMs < 0) {
    return failure('invalid-input', '提词器时间戳无效。')
  }

  return success({
    config: stateResult.value.config,
    status: 'running',
    offsetPx: stateResult.value.offsetPx,
    lastTimestampMs: nowMs,
  })
}

/** 停止提词器并将下一次播放位置重置到稿件顶部。 */
export function stopPrompter(state: PrompterState): ToolResult<PrompterState> {
  const stateResult = validatePrompterState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  return success({
    config: stateResult.value.config,
    status: 'stopped',
    offsetPx: 0,
    lastTimestampMs: null,
  })
}

/** 清除提词器播放状态，回到等待播放的稿件顶部。 */
export function resetPrompter(state: PrompterState): ToolResult<PrompterState> {
  const stateResult = validatePrompterState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  return success({
    config: stateResult.value.config,
    status: 'idle',
    offsetPx: 0,
    lastTimestampMs: null,
  })
}

/** 校验提词器状态，阻止时间和位置数据污染播放链路。 */
export function validatePrompterState(state: PrompterState): ToolResult<PrompterState> {
  if (!state || typeof state !== 'object') {
    return failure('invalid-input', '提词器状态无效。')
  }

  const configResult = validatePrompterConfig(state.config)

  if (!configResult.ok) {
    return failure('invalid-state', '提词器配置已失效。')
  }

  if (!PROMPTER_STATUSES.includes(state.status)) {
    return failure('invalid-state', '提词器播放状态无效。')
  }

  if (!Number.isFinite(state.offsetPx) || state.offsetPx < 0) {
    return failure('invalid-state', '提词器滚动位置无效。')
  }

  if (state.status === 'running') {
    const lastTimestampMs = state.lastTimestampMs

    if (typeof lastTimestampMs !== 'number' || !Number.isFinite(lastTimestampMs) || lastTimestampMs < 0) {
      return failure('invalid-state', '滚动中的提词器缺少有效时间戳。')
    }
  } else if (state.lastTimestampMs !== null) {
    return failure('invalid-state', '非滚动状态不应保留播放时间戳。')
  }

  return success({
    config: configResult.value,
    status: state.status,
    offsetPx: state.offsetPx,
    lastTimestampMs: state.lastTimestampMs,
  })
}
