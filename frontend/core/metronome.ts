import { failure, success, type ToolResult } from './tool-result'

export const METRONOME_MIN_BPM = 40
export const METRONOME_MAX_BPM = 240
export const METRONOME_DEFAULT_BPM = 120
export const METRONOME_MIN_BEATS_PER_BAR = 1
export const METRONOME_MAX_BEATS_PER_BAR = 12
export const METRONOME_DEFAULT_BEATS_PER_BAR = 4
export const METRONOME_MIN_VOLUME = 0
export const METRONOME_MAX_VOLUME = 100
export const METRONOME_DEFAULT_VOLUME = 70

export type MetronomeStatus = 'idle' | 'running' | 'stopped'

export interface MetronomeInput {
  bpm: number
  beatsPerBar: number
  volume: number
}

export interface MetronomeConfig {
  readonly bpm: number
  readonly beatsPerBar: number
  readonly volume: number
}

export interface MetronomeState {
  readonly config: MetronomeConfig
  readonly status: MetronomeStatus
  readonly currentBeatNumber: number | null
}

export interface MetronomeBeat {
  readonly beatNumber: number
  readonly beatInBar: number
  readonly isAccent: boolean
}

/** 判断一个数值是否为指定范围内的安全整数。 */
function isSafeIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

/** 校验并规范化节拍器的 BPM、拍号和页面音量配置。 */
export function validateMetronomeConfig(input: MetronomeInput): ToolResult<MetronomeConfig> {
  if (!input || typeof input !== 'object') {
    return failure('invalid-input', '节拍器配置无效，请重置后重试。')
  }

  if (!Number.isSafeInteger(input.bpm)) {
    return failure('invalid-input', 'BPM 必须是整数。')
  }

  if (!isSafeIntegerInRange(input.bpm, METRONOME_MIN_BPM, METRONOME_MAX_BPM)) {
    return failure('out-of-range', `BPM 范围为 ${METRONOME_MIN_BPM}–${METRONOME_MAX_BPM}。`)
  }

  if (!Number.isSafeInteger(input.beatsPerBar)) {
    return failure('invalid-input', '每小节拍数必须是整数。')
  }

  if (!isSafeIntegerInRange(input.beatsPerBar, METRONOME_MIN_BEATS_PER_BAR, METRONOME_MAX_BEATS_PER_BAR)) {
    return failure(
      'out-of-range',
      `每小节拍数范围为 ${METRONOME_MIN_BEATS_PER_BAR}–${METRONOME_MAX_BEATS_PER_BAR}。`,
    )
  }

  if (!Number.isSafeInteger(input.volume)) {
    return failure('invalid-input', '音量必须是整数。')
  }

  if (!isSafeIntegerInRange(input.volume, METRONOME_MIN_VOLUME, METRONOME_MAX_VOLUME)) {
    return failure('out-of-range', `音量范围为 ${METRONOME_MIN_VOLUME}–${METRONOME_MAX_VOLUME}。`)
  }

  return success({
    bpm: input.bpm,
    beatsPerBar: input.beatsPerBar,
    volume: input.volume,
  })
}

/** 根据 BPM 计算每拍的毫秒间隔。 */
export function calculateMetronomeBeatIntervalMs(bpm: number): ToolResult<number> {
  if (!Number.isSafeInteger(bpm)) {
    return failure('invalid-input', 'BPM 必须是整数。')
  }

  if (!isSafeIntegerInRange(bpm, METRONOME_MIN_BPM, METRONOME_MAX_BPM)) {
    return failure('out-of-range', `BPM 范围为 ${METRONOME_MIN_BPM}–${METRONOME_MAX_BPM}。`)
  }

  return success(60_000 / bpm)
}

/** 根据 BPM 计算 Web Audio 使用的每拍秒数。 */
export function calculateMetronomeBeatIntervalSeconds(bpm: number): ToolResult<number> {
  const intervalResult = calculateMetronomeBeatIntervalMs(bpm)

  if (!intervalResult.ok) {
    return intervalResult
  }

  return success(intervalResult.value / 1_000)
}

/** 校验节拍序号并根据拍号生成当前拍的展示信息。 */
export function getMetronomeBeat(
  config: MetronomeConfig,
  beatNumber: number,
): ToolResult<MetronomeBeat> {
  const configResult = validateMetronomeConfig(config)

  if (!configResult.ok) {
    return configResult
  }

  if (!Number.isSafeInteger(beatNumber) || beatNumber < 0) {
    return failure('operation-failed', '节拍序号无效，请重置后重试。')
  }

  const beatInBar = (beatNumber % configResult.value.beatsPerBar) + 1

  return success({
    beatNumber,
    beatInBar,
    isAccent: beatInBar === 1,
  })
}

/** 校验节拍器状态，避免页面层使用不一致的运行快照。 */
function validateMetronomeState(state: MetronomeState): ToolResult<MetronomeState> {
  if (!state || typeof state !== 'object') {
    return failure('operation-failed', '节拍器状态无效，请重置后重试。')
  }

  const configResult = validateMetronomeConfig(state.config)

  if (!configResult.ok) {
    return failure('operation-failed', '节拍器配置状态无效，请重置后重试。')
  }

  if (state.status !== 'idle' && state.status !== 'running' && state.status !== 'stopped') {
    return failure('operation-failed', '节拍器状态无效，请重置后重试。')
  }

  if (state.currentBeatNumber !== null && (!Number.isSafeInteger(state.currentBeatNumber) || state.currentBeatNumber < 0)) {
    return failure('operation-failed', '节拍器当前拍无效，请重置后重试。')
  }

  if (state.status === 'idle' && state.currentBeatNumber !== null) {
    return failure('operation-failed', '节拍器初始状态无效，请重置后重试。')
  }

  return success({
    config: configResult.value,
    status: state.status,
    currentBeatNumber: state.currentBeatNumber,
  })
}

/** 创建指定配置的初始节拍器状态。 */
export function createMetronomeState(config: MetronomeConfig): ToolResult<MetronomeState> {
  const configResult = validateMetronomeConfig(config)

  if (!configResult.ok) {
    return configResult
  }

  return success({
    config: configResult.value,
    status: 'idle',
    currentBeatNumber: null,
  })
}

/** 启动一个节拍器状态并清除上一轮的当前拍。 */
export function startMetronome(state: MetronomeState): ToolResult<MetronomeState> {
  const stateResult = validateMetronomeState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status === 'running') {
    return failure('operation-failed', '节拍器已经在运行，请先停止。')
  }

  return success({
    ...stateResult.value,
    status: 'running',
    currentBeatNumber: null,
  })
}

/** 将一个已经播放的节拍写入运行中的节拍器状态。 */
export function recordMetronomeBeat(
  state: MetronomeState,
  beatNumber: number,
): ToolResult<MetronomeState> {
  const stateResult = validateMetronomeState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'running') {
    return failure('operation-failed', '节拍器当前未运行，不能更新当前拍。')
  }

  if (!Number.isSafeInteger(beatNumber) || beatNumber < 0) {
    return failure('operation-failed', '节拍序号无效，请重置后重试。')
  }

  if (stateResult.value.currentBeatNumber !== null && beatNumber < stateResult.value.currentBeatNumber) {
    return failure('operation-failed', '节拍序号不能倒退，请重置后重试。')
  }

  return success({
    ...stateResult.value,
    currentBeatNumber: beatNumber,
  })
}

/** 停止运行中的节拍器并保留本轮最后状态。 */
export function stopMetronome(state: MetronomeState): ToolResult<MetronomeState> {
  const stateResult = validateMetronomeState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  if (stateResult.value.status !== 'running') {
    return failure('operation-failed', '节拍器当前未运行。')
  }

  return success({
    ...stateResult.value,
    status: 'stopped',
  })
}

/** 重置节拍器状态并保留已确认的配置。 */
export function resetMetronome(state: MetronomeState): ToolResult<MetronomeState> {
  const stateResult = validateMetronomeState(state)

  if (!stateResult.ok) {
    return stateResult
  }

  return success({
    ...stateResult.value,
    status: 'idle',
    currentBeatNumber: null,
  })
}
