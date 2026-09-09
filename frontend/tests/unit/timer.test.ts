import { describe, expect, it } from 'vitest'

import {
  TIMER_MAX_DURATION_MS,
  createTimerState,
  formatTimerValue,
  parseCountdownDuration,
  pauseTimer,
  resetTimer,
  resumeTimer,
  startTimer,
  synchronizeTimer,
} from '../../core/timer'

describe('timer core', () => {
  it('parses countdown fields and applies the confirmed boundaries', () => {
    const result = parseCountdownDuration({ hours: '1', minutes: '2', seconds: '3' })

    expect(result).toEqual({ ok: true, value: 3_723_000 })
    expect(parseCountdownDuration({ hours: '99', minutes: '59', seconds: '59' })).toEqual({
      ok: true,
      value: TIMER_MAX_DURATION_MS - 61_000,
    })
    expect(parseCountdownDuration({ hours: '99', minutes: '60', seconds: '60' })).toEqual({
      ok: true,
      value: TIMER_MAX_DURATION_MS,
    })
  })

  it('rejects empty, malformed, negative, zero, and out-of-range input', () => {
    expect(parseCountdownDuration({ hours: '', minutes: '', seconds: '' })).toMatchObject({
      ok: false,
      error: { code: 'empty-input' },
    })
    expect(parseCountdownDuration({ hours: '1.5', minutes: '', seconds: '' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseCountdownDuration({ hours: '-1', minutes: '', seconds: '' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(parseCountdownDuration({ hours: '', minutes: '', seconds: '0' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(parseCountdownDuration({ hours: '100', minutes: '', seconds: '' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(parseCountdownDuration({ hours: '', minutes: '61', seconds: '' })).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('runs a stopwatch with timestamp differences and freezes while paused', () => {
    const initial = createTimerState('stopwatch')
    expect(initial.ok).toBe(true)
    if (!initial.ok) return

    const started = startTimer(initial.value, 1_000)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const synchronized = synchronizeTimer(started.value, 2_500)
    expect(synchronized).toMatchObject({ ok: true, value: { status: 'running', valueMs: 1_500 } })
    if (!synchronized.ok) return

    const paused = pauseTimer(synchronized.value, 3_000)
    expect(paused).toMatchObject({ ok: true, value: { status: 'paused', valueMs: 2_000 } })
    if (!paused.ok) return

    expect(synchronizeTimer(paused.value, 99_000)).toEqual({ ok: true, value: paused.value })

    const resumed = resumeTimer(paused.value, 10_000)
    expect(resumed).toMatchObject({ ok: true, value: { status: 'running', valueMs: 2_000 } })
    if (!resumed.ok) return

    expect(synchronizeTimer(resumed.value, 10_500)).toMatchObject({
      ok: true,
      value: { status: 'running', valueMs: 2_500 },
    })
  })

  it('completes countdowns at zero without producing negative values', () => {
    const initial = createTimerState('countdown', 5_000)
    expect(initial.ok).toBe(true)
    if (!initial.ok) return

    const started = startTimer(initial.value, 1_000)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const beforeEnd = synchronizeTimer(started.value, 5_999)
    expect(beforeEnd).toMatchObject({ ok: true, value: { status: 'running', valueMs: 1 } })
    if (!beforeEnd.ok) return

    const completed = synchronizeTimer(beforeEnd.value, 6_000)
    expect(completed).toMatchObject({ ok: true, value: { status: 'completed', valueMs: 0, lastNowMs: null } })
  })

  it('does not allow duplicate starts and resets to the configured value', () => {
    const initial = createTimerState('countdown', 10_000)
    expect(initial.ok).toBe(true)
    if (!initial.ok) return

    const started = startTimer(initial.value, 0)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    expect(startTimer(started.value, 1_000)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })

    const reset = resetTimer(started.value)
    expect(reset).toEqual({
      ok: true,
      value: {
        mode: 'countdown',
        status: 'idle',
        durationMs: 10_000,
        valueMs: 10_000,
        lastNowMs: null,
      },
    })
  })

  it('rejects clock rollback and invalid snapshots without fabricating results', () => {
    const initial = createTimerState('stopwatch')
    expect(initial.ok).toBe(true)
    if (!initial.ok) return

    const started = startTimer(initial.value, 2_000)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    expect(synchronizeTimer(started.value, 1_999)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
    expect(synchronizeTimer({ ...started.value, valueMs: -1 }, 3_000)).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })

  it('formats complete hours and rejects invalid display values', () => {
    expect(formatTimerValue(3_723_004)).toEqual({ ok: true, value: '01:02:03.004' })
    expect(formatTimerValue(100 * 60 * 60 * 1000)).toEqual({ ok: true, value: '100:00:00.000' })
    expect(formatTimerValue(-1)).toMatchObject({ ok: false, error: { code: 'operation-failed' } })
  })
})
