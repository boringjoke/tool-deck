import { describe, expect, it } from 'vitest'

import {
  PROMPTER_MAX_TEXT_LENGTH,
  PROMPTER_MAX_FONT_SIZE,
  PROMPTER_MIN_FONT_SIZE,
  advancePrompter,
  createPrompterState,
  getPrompterSpeedPixelsPerSecond,
  normalizePrompterText,
  pausePrompter,
  resumePrompter,
  startPrompter,
  stopPrompter,
  validatePrompterConfig,
} from '../../core/prompter'

const validInput = {
  text: '第一行\r\n\r\n第二行',
  fontSize: 56,
  speed: 3,
  mirror: false,
}

describe('prompter core', () => {
  it('normalizes line endings while preserving internal blank lines', () => {
    expect(normalizePrompterText('  第一行\r\n\r\n第二行  ')).toBe('第一行\n\n第二行')
  })

  it('validates Unicode text and display settings', () => {
    expect(validatePrompterConfig(validInput)).toEqual({
      ok: true,
      value: {
        text: '第一行\n\n第二行',
        fontSize: 56,
        speed: 3,
        mirror: false,
      },
    })
    expect(validatePrompterConfig({ ...validInput, text: '🙂'.repeat(PROMPTER_MAX_TEXT_LENGTH) }).ok).toBe(true)
    expect(validatePrompterConfig({ ...validInput, text: '🙂'.repeat(PROMPTER_MAX_TEXT_LENGTH + 1) }).ok).toBe(false)
    expect(validatePrompterConfig({ ...validInput, fontSize: PROMPTER_MIN_FONT_SIZE }).ok).toBe(true)
    expect(validatePrompterConfig({ ...validInput, fontSize: PROMPTER_MAX_FONT_SIZE }).ok).toBe(true)
    expect(validatePrompterConfig({ ...validInput, speed: 0 }).ok).toBe(false)
    expect(validatePrompterConfig({ ...validInput, mirror: 'yes' as never }).ok).toBe(false)
  })

  it('maps the five speed presets to fixed pixel rates', () => {
    expect([1, 2, 3, 4, 5].map((speed) => getPrompterSpeedPixelsPerSecond(speed as 1 | 2 | 3 | 4 | 5)))
      .toEqual([24, 40, 60, 90, 130])
  })

  it('advances from the top and finishes at the measured track end', () => {
    const created = createPrompterState({ ...validInput, text: '稿件' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const started = startPrompter(created.value, 1_000)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const advanced = advancePrompter(started.value, 3_000, 120)
    expect(advanced).toEqual({
      ok: true,
      value: {
        config: { text: '稿件', fontSize: 56, speed: 3, mirror: false },
        status: 'finished',
        offsetPx: 120,
        lastTimestampMs: null,
      },
    })
  })

  it('pauses at the current position and resumes without a jump', () => {
    const created = createPrompterState({ ...validInput, text: '稿件' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const started = startPrompter(created.value, 100)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const paused = pausePrompter(started.value, 600)
    expect(paused).toEqual({
      ok: true,
      value: {
        config: { text: '稿件', fontSize: 56, speed: 3, mirror: false },
        status: 'paused',
        offsetPx: 30,
        lastTimestampMs: null,
      },
    })
    if (!paused.ok) return

    const resumed = resumePrompter(paused.value, 2_000)
    expect(resumed.ok).toBe(true)
    if (!resumed.ok) return

    const continued = advancePrompter(resumed.value, 2_500, 120)
    expect(continued.ok).toBe(true)
    if (!continued.ok) return
    expect(continued.value.status).toBe('running')
    expect(continued.value.offsetPx).toBe(60)
  })

  it('stops at the top and rejects backwards timestamps', () => {
    const created = createPrompterState({ ...validInput, text: '稿件' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const started = startPrompter(created.value, 1_000)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    expect(advancePrompter(started.value, 999, 120).ok).toBe(false)
    expect(stopPrompter(started.value)).toEqual({
      ok: true,
      value: {
        config: { text: '稿件', fontSize: 56, speed: 3, mirror: false },
        status: 'stopped',
        offsetPx: 0,
        lastTimestampMs: null,
      },
    })
  })
})
