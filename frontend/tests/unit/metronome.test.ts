import { describe, expect, it } from 'vitest'

import {
  calculateMetronomeBeatIntervalMs,
  calculateMetronomeBeatIntervalSeconds,
  createMetronomeState,
  getMetronomeBeat,
  METRONOME_DEFAULT_BEATS_PER_BAR,
  METRONOME_DEFAULT_BPM,
  METRONOME_DEFAULT_VOLUME,
  recordMetronomeBeat,
  startMetronome,
  stopMetronome,
  validateMetronomeConfig,
} from '../../core/metronome'

/** 创建一份用于节拍器核心测试的有效配置。 */
function createValidConfig() {
  return {
    bpm: METRONOME_DEFAULT_BPM,
    beatsPerBar: METRONOME_DEFAULT_BEATS_PER_BAR,
    volume: METRONOME_DEFAULT_VOLUME,
  }
}

describe('metronome core', () => {
  it('validates the default configuration and beat interval', () => {
    expect(validateMetronomeConfig(createValidConfig())).toEqual({
      ok: true,
      value: createValidConfig(),
    })
    expect(calculateMetronomeBeatIntervalMs(120)).toEqual({ ok: true, value: 500 })
    expect(calculateMetronomeBeatIntervalSeconds(120)).toEqual({ ok: true, value: 0.5 })
  })

  it('accepts configured boundaries and rejects malformed values', () => {
    expect(validateMetronomeConfig({ bpm: 40, beatsPerBar: 1, volume: 0 })).toMatchObject({ ok: true })
    expect(validateMetronomeConfig({ bpm: 240, beatsPerBar: 12, volume: 100 })).toMatchObject({ ok: true })
    expect(validateMetronomeConfig({ ...createValidConfig(), bpm: 39 })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateMetronomeConfig({ ...createValidConfig(), bpm: 120.5 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(validateMetronomeConfig({ ...createValidConfig(), beatsPerBar: 13 })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(validateMetronomeConfig({ ...createValidConfig(), volume: 101 })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('generates a repeating beat sequence with an accented first beat', () => {
    const config = { ...createValidConfig(), beatsPerBar: 3 }

    expect([0, 1, 2, 3, 4].map((beatNumber) => getMetronomeBeat(config, beatNumber))).toEqual([
      { ok: true, value: { beatNumber: 0, beatInBar: 1, isAccent: true } },
      { ok: true, value: { beatNumber: 1, beatInBar: 2, isAccent: false } },
      { ok: true, value: { beatNumber: 2, beatInBar: 3, isAccent: false } },
      { ok: true, value: { beatNumber: 3, beatInBar: 1, isAccent: true } },
      { ok: true, value: { beatNumber: 4, beatInBar: 2, isAccent: false } },
    ])
  })

  it('rejects invalid beat numbers without creating a result', () => {
    expect(getMetronomeBeat(createValidConfig(), -1)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
    expect(getMetronomeBeat(createValidConfig(), 1.5)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })

  it('starts, records beats, and stops one stateful instance', () => {
    const created = createMetronomeState(createValidConfig())

    expect(created.ok).toBe(true)

    if (!created.ok) {
      return
    }

    const started = startMetronome(created.value)
    expect(started).toMatchObject({
      ok: true,
      value: { status: 'running', currentBeatNumber: null },
    })

    if (!started.ok) {
      return
    }

    const recorded = recordMetronomeBeat(started.value, 0)
    expect(recorded).toMatchObject({
      ok: true,
      value: { status: 'running', currentBeatNumber: 0 },
    })

    if (!recorded.ok) {
      return
    }

    const nextRecorded = recordMetronomeBeat(recorded.value, 1)
    expect(nextRecorded).toMatchObject({
      ok: true,
      value: { currentBeatNumber: 1 },
    })

    if (!nextRecorded.ok) {
      return
    }

    expect(recordMetronomeBeat(nextRecorded.value, 0)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
    expect(stopMetronome(nextRecorded.value)).toMatchObject({
      ok: true,
      value: { status: 'stopped', currentBeatNumber: 1 },
    })
  })

  it('does not start an already running state or stop an idle state', () => {
    const created = createMetronomeState(createValidConfig())

    expect(created.ok).toBe(true)

    if (!created.ok) {
      return
    }

    expect(stopMetronome(created.value)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })

    const started = startMetronome(created.value)
    expect(started.ok).toBe(true)

    if (!started.ok) {
      return
    }

    expect(startMetronome(started.value)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })
})
