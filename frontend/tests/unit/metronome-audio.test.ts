import { describe, expect, it } from 'vitest'

import {
  createMetronomeAudioEngine,
  type MetronomeAudioContextConstructor,
  type MetronomeAudioContextLike,
} from '../../adapters/metronome-audio'

interface MockAudioState {
  currentTime: number
  state: string
  resumeCalls: number
  closeCalls: number
  startCalls: number[]
  stopCalls: number[]
  disconnectCalls: number
  frequencyValues: number[]
  gainValues: number[]
  resumeFailure: boolean
}

/** 创建一个可观察 Web Audio 行为的测试上下文。 */
function createMockAudioContext(): {
  context: MetronomeAudioContextLike
  state: MockAudioState
} {
  const state: MockAudioState = {
    currentTime: 10,
    state: 'suspended',
    resumeCalls: 0,
    closeCalls: 0,
    startCalls: [],
    stopCalls: [],
    disconnectCalls: 0,
    frequencyValues: [],
    gainValues: [],
    resumeFailure: false,
  }

  const createParam = (values: number[]) => ({
    setValueAtTime(value: number) {
      values.push(value)
    },
    linearRampToValueAtTime(value: number) {
      values.push(value)
    },
    exponentialRampToValueAtTime(value: number) {
      values.push(value)
    },
  })

  const context = {
    get currentTime() {
      return state.currentTime
    },
    get state() {
      return state.state
    },
    destination: {},
    async resume() {
      state.resumeCalls += 1

      if (state.resumeFailure) {
        throw new Error('resume failed')
      }

      state.state = 'running'
    },
    async close() {
      state.closeCalls += 1
      state.state = 'closed'
    },
    createOscillator() {
      let endedListener: (() => void) | undefined

      return {
        frequency: createParam(state.frequencyValues),
        connect() {
          return undefined
        },
        disconnect() {
          state.disconnectCalls += 1
        },
        start(when = 0) {
          state.startCalls.push(when)
        },
        stop(when = 0) {
          state.stopCalls.push(when)
          endedListener?.()
        },
        addEventListener(_type: 'ended', listener: () => void) {
          endedListener = listener
        },
      }
    },
    createGain() {
      return {
        gain: createParam(state.gainValues),
        connect() {
          return undefined
        },
        disconnect() {
          state.disconnectCalls += 1
        },
      }
    },
  } as unknown as MetronomeAudioContextLike

  return { context, state }
}

/** 将一个测试上下文包装成原生构造器形状。 */
function createContextConstructor(context: MetronomeAudioContextLike): MetronomeAudioContextConstructor {
  return function MockAudioContext(this: unknown) {
    return context
  } as unknown as MetronomeAudioContextConstructor
}

describe('metronome audio adapter', () => {
  it('resumes a user-created context and schedules a synthesized click', async () => {
    const mock = createMockAudioContext()
    const engineResult = createMetronomeAudioEngine(createContextConstructor(mock.context))

    expect(engineResult.ok).toBe(true)

    if (!engineResult.ok) {
      return
    }

    expect(await engineResult.value.resume()).toEqual({ ok: true, value: undefined })
    expect(mock.state.resumeCalls).toBe(1)
    expect(engineResult.value.scheduleClick(10.05, 70, true)).toEqual({ ok: true, value: undefined })
    expect(mock.state.startCalls).toEqual([10.05])
    expect(mock.state.stopCalls[0]).toBeCloseTo(10.11)
    expect(mock.state.frequencyValues).toContain(1_240)
    expect(mock.state.gainValues.some((value) => value > 0)).toBe(true)
    expect(engineResult.value.scheduleClick(10.15, 0, false)).toEqual({ ok: true, value: undefined })
    expect(mock.state.startCalls).toEqual([10.05])

    engineResult.value.stopScheduledClicks()
    await engineResult.value.dispose()
    expect(mock.state.closeCalls).toBe(1)
    expect(mock.state.disconnectCalls).toBeGreaterThan(0)
  })

  it('returns a visible failure when the browser rejects audio unlock', async () => {
    const mock = createMockAudioContext()
    mock.state.resumeFailure = true
    const engineResult = createMetronomeAudioEngine(createContextConstructor(mock.context))

    expect(engineResult.ok).toBe(true)

    if (!engineResult.ok) {
      return
    }

    expect(await engineResult.value.resume()).toMatchObject({
      ok: false,
      error: {
        code: 'operation-failed',
      },
    })
    await engineResult.value.dispose()
  })

  it('does not create an engine during server-side execution without a constructor', () => {
    expect(createMetronomeAudioEngine(null)).toMatchObject({
      ok: false,
      error: {
        code: 'operation-failed',
      },
    })
  })
})
