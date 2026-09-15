import { failure, success, type ToolResult } from '../core/tool-result'

const METRONOME_CLICK_DURATION_SECONDS = 0.06
const METRONOME_CLICK_ATTACK_SECONDS = 0.003
const METRONOME_CLICK_BASE_GAIN = 0.24
const METRONOME_REGULAR_FREQUENCY_HZ = 820
const METRONOME_ACCENT_FREQUENCY_HZ = 1_240

interface MetronomeAudioParamLike {
  setValueAtTime: (value: number, startTime: number) => void
  linearRampToValueAtTime: (value: number, endTime: number) => void
  exponentialRampToValueAtTime: (value: number, endTime: number) => void
}

interface MetronomeAudioNodeLike {
  connect: (destination: unknown) => unknown
  disconnect?: () => void
}

interface MetronomeOscillatorNodeLike extends MetronomeAudioNodeLike {
  frequency: MetronomeAudioParamLike
  start: (when?: number) => void
  stop: (when?: number) => void
  addEventListener?: (type: 'ended', listener: () => void) => void
}

interface MetronomeGainNodeLike extends MetronomeAudioNodeLike {
  gain: MetronomeAudioParamLike
}

export interface MetronomeAudioContextLike {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  resume: () => Promise<void>
  close: () => Promise<void>
  createOscillator: () => MetronomeOscillatorNodeLike
  createGain: () => MetronomeGainNodeLike
}

export type MetronomeAudioContextConstructor = new () => MetronomeAudioContextLike

interface ScheduledClick {
  stop: () => void
}

export interface MetronomeAudioEngine {
  readonly context: MetronomeAudioContextLike
  resume: () => Promise<ToolResult<void>>
  scheduleClick: (timeSeconds: number, volume: number, isAccent: boolean) => ToolResult<void>
  stopScheduledClicks: () => void
  dispose: () => Promise<void>
}

interface WindowWithAudioContext extends Window {
  webkitAudioContext?: MetronomeAudioContextConstructor
}

/** 读取当前浏览器提供的 Web Audio 构造器。 */
function getAudioContextConstructor(): MetronomeAudioContextConstructor | null {
  if (typeof window === 'undefined') {
    return null
  }

  const browserWindow = window as WindowWithAudioContext
  const standardConstructor = (browserWindow as unknown as {
    AudioContext?: MetronomeAudioContextConstructor
  }).AudioContext

  return standardConstructor ?? browserWindow.webkitAudioContext ?? null
}

/** 计算节拍 click 的增益，避免合成音过度放大。 */
function calculateClickGain(volume: number, isAccent: boolean): number {
  if (volume === 0) {
    return 0
  }

  const normalizedVolume = volume / 100
  const accentMultiplier = isAccent ? 1 : 0.72

  return Math.max(0.0001, normalizedVolume * METRONOME_CLICK_BASE_GAIN * accentMultiplier)
}

/** 断开一个已经结束或主动停止的 click 节点。 */
function disconnectClickNodes(
  oscillator: MetronomeOscillatorNodeLike,
  gain: MetronomeGainNodeLike,
): void {
  try {
    oscillator.disconnect?.()
  } catch {
    // 节点已经由浏览器释放时，断开失败不影响后续清理。
  }

  try {
    gain.disconnect?.()
  } catch {
    // 节点已经由浏览器释放时，断开失败不影响后续清理。
  }
}

/** 创建一个使用指定音频上下文的节拍器音频引擎。 */
function createEngineFromContext(context: MetronomeAudioContextLike): MetronomeAudioEngine {
  const scheduledClicks = new Set<ScheduledClick>()
  let disposed = false

  const scheduleClick = (timeSeconds: number, volume: number, isAccent: boolean): ToolResult<void> => {
    if (disposed || context.state === 'closed') {
      return failure('operation-failed', '音频引擎已关闭，请重新开始节拍器。')
    }

    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      return failure('operation-failed', '节拍播放时间无效，请重新开始节拍器。')
    }

    if (!Number.isSafeInteger(volume) || volume < 0 || volume > 100) {
      return failure('out-of-range', '音量范围为 0–100。')
    }

    const peakGain = calculateClickGain(volume, isAccent)

    if (peakGain === 0) {
      return success(undefined)
    }

    let oscillator: MetronomeOscillatorNodeLike | null = null
    let gain: MetronomeGainNodeLike | null = null
    let scheduledClick: ScheduledClick | null = null
    let finished = false

    const cleanup = (): void => {
      if (finished) {
        return
      }

      finished = true

      if (oscillator && gain) {
        disconnectClickNodes(oscillator, gain)
      }
    }

    try {
      oscillator = context.createOscillator()
      gain = context.createGain()

      const click: ScheduledClick = {
        stop: (): void => {
          if (finished || !oscillator || !gain) {
            return
          }

          try {
            oscillator.stop()
          } catch {
            // click 已经自然结束时，重复 stop 不影响清理。
          }

          scheduledClicks.delete(click)
          cleanup()
        },
      }

      scheduledClick = click
      scheduledClicks.add(click)
      oscillator.addEventListener?.('ended', () => {
        scheduledClicks.delete(click)
        cleanup()
      })

      const releaseTime = timeSeconds + METRONOME_CLICK_DURATION_SECONDS

      oscillator.frequency.setValueAtTime(
        isAccent ? METRONOME_ACCENT_FREQUENCY_HZ : METRONOME_REGULAR_FREQUENCY_HZ,
        timeSeconds,
      )
      gain.gain.setValueAtTime(0.0001, timeSeconds)
      gain.gain.linearRampToValueAtTime(
        peakGain,
        timeSeconds + METRONOME_CLICK_ATTACK_SECONDS,
      )
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseTime)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(timeSeconds)
      oscillator.stop(releaseTime)

      return success(undefined)
    } catch {
      if (scheduledClick) {
        scheduledClicks.delete(scheduledClick)
      }

      if (oscillator && gain) {
        disconnectClickNodes(oscillator, gain)
      }

      return failure('operation-failed', '无法安排节拍声音，请重试。')
    }
  }

  const resume = async (): Promise<ToolResult<void>> => {
    if (disposed || context.state === 'closed') {
      return failure('operation-failed', '音频引擎已关闭，请重新开始节拍器。')
    }

    try {
      if (context.state !== 'running') {
        await context.resume()
      }
    } catch {
      return failure('operation-failed', '浏览器未允许播放节拍声音，请重试。')
    }

    if (context.state === 'closed' || context.state === 'suspended') {
      return failure('operation-failed', '浏览器未允许播放节拍声音，请重试。')
    }

    return success(undefined)
  }

  const stopScheduledClicks = (): void => {
    for (const click of Array.from(scheduledClicks)) {
      click.stop()
    }

    scheduledClicks.clear()
  }

  const dispose = async (): Promise<void> => {
    if (disposed) {
      return
    }

    disposed = true
    stopScheduledClicks()

    if (context.state === 'closed') {
      return
    }

    try {
      await context.close()
    } catch {
      // 音频上下文关闭失败不影响页面状态和下一次创建。
    }
  }

  return {
    context,
    resume,
    scheduleClick,
    stopScheduledClicks,
    dispose,
  }
}

/** 创建浏览器原生 Web Audio 节拍器引擎。 */
export function createMetronomeAudioEngine(
  contextConstructor: MetronomeAudioContextConstructor | null = getAudioContextConstructor(),
): ToolResult<MetronomeAudioEngine> {
  if (!contextConstructor) {
    return failure('operation-failed', '当前浏览器不支持 Web Audio，无法播放节拍。')
  }

  try {
    return success(createEngineFromContext(new contextConstructor()))
  } catch {
    return failure('operation-failed', '无法创建音频引擎，请重试。')
  }
}
