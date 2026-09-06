import { describe, expect, it } from 'vitest'

import {
  convertIsoToTimestamp,
  convertTimestamp,
  getCurrentTimeInput,
} from '../../core/timestamp'

describe('timestamp core', () => {
  it('converts seconds and milliseconds to the same instant', () => {
    const seconds = convertTimestamp('0', 'seconds')
    const milliseconds = convertTimestamp('0', 'milliseconds')

    expect(seconds.ok).toBe(true)
    expect(milliseconds.ok).toBe(true)
    if (!seconds.ok || !milliseconds.ok) return

    expect(seconds.value.timestampMilliseconds).toBe('0')
    expect(milliseconds.value.timestampSeconds).toBe('0')
    expect(seconds.value.iso).toBe('1970-01-01T00:00:00.000Z')
  })

  it('accepts ISO 8601 with an explicit UTC zone', () => {
    const result = convertIsoToTimestamp('1970-01-01T00:00:00Z', 'local')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.timestampSeconds).toBe('0')
    expect(result.value.timestampMilliseconds).toBe('0')
  })

  it('uses the selected UTC mode when ISO input has no timezone', () => {
    const result = convertIsoToTimestamp('1970-01-01T00:00:00', 'utc')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.timestampMilliseconds).toBe('0')
  })

  it('rejects empty, non-integer, and out-of-range timestamp input', () => {
    expect(convertTimestamp('', 'seconds').ok).toBe(false)
    expect(convertTimestamp('1.5', 'seconds').ok).toBe(false)
    expect(convertTimestamp('not-a-timestamp', 'milliseconds').ok).toBe(false)
  })

  it('creates deterministic current-time shortcuts for UTC mode', () => {
    const date = new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 6))

    expect(getCurrentTimeInput('utc', date)).toBe('2024-01-02T03:04:05.006Z')
    expect(getCurrentTimeInput('local', date)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.006$/)
  })
})
