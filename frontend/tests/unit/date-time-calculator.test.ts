import { describe, expect, it } from 'vitest'

import {
  calculateDateDifference,
  calculateDateTimeAdjustment,
} from '../../core/date-time-calculator'

describe('date-time calculator core', () => {
  it('calculates a positive date difference with totals and a breakdown', () => {
    const result = calculateDateDifference(
      '2024-01-01T00:00',
      '2024-01-02T01:02:03.004',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.startLocal).toBe('2024-01-01T00:00:00.000')
    expect(result.value.endLocal).toBe('2024-01-02T01:02:03.004')
    expect(result.value.totalMilliseconds).toBe('90123004')
    expect(result.value.breakdown).toEqual({
      sign: '',
      days: 1,
      hours: 1,
      minutes: 2,
      seconds: 3,
      milliseconds: 4,
    })
  })

  it('keeps a negative direction when the end is earlier than the start', () => {
    const result = calculateDateDifference('2024-01-02T00:00', '2024-01-01T23:59')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.totalMilliseconds).toBe('-60000')
    expect(result.value.breakdown).toEqual({
      sign: '-',
      days: 0,
      hours: 0,
      minutes: 1,
      seconds: 0,
      milliseconds: 0,
    })
  })

  it('treats date-only values as local midnight', () => {
    const result = calculateDateDifference('2024-01-01', '2024-01-02')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.startLocal).toBe('2024-01-01T00:00:00.000')
    expect(result.value.endLocal).toBe('2024-01-02T00:00:00.000')
    expect(result.value.totalMilliseconds).toBe('86400000')
    expect(result.value.breakdown).toEqual({
      sign: '',
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    })
  })

  it('adds calendar months and clamps the day to the target month', () => {
    const result = calculateDateTimeAdjustment({
      base: '2024-01-31T10:20',
      operation: 'add',
      amount: '1',
      unit: 'months',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.resultLocal).toBe('2024-02-29T10:20:00.000')
  })

  it('subtracts a calendar year and clamps leap-day results', () => {
    const result = calculateDateTimeAdjustment({
      base: '2024-02-29T10:20:30',
      operation: 'subtract',
      amount: '1',
      unit: 'years',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.resultLocal).toBe('2023-02-28T10:20:30.000')
  })

  it('adds calendar days and elapsed clock units', () => {
    const days = calculateDateTimeAdjustment({
      base: '2024-03-01T10:20',
      operation: 'add',
      amount: '10',
      unit: 'days',
    })
    const minutes = calculateDateTimeAdjustment({
      base: '2024-03-01T10:20',
      operation: 'add',
      amount: '90',
      unit: 'minutes',
    })

    expect(days.ok).toBe(true)
    expect(minutes.ok).toBe(true)
    if (!days.ok || !minutes.ok) return

    expect(days.value.resultLocal).toBe('2024-03-11T10:20:00.000')
    expect(minutes.value.resultLocal).toBe('2024-03-01T11:50:00.000')
  })

  it('normalizes zero adjustments and preserves millisecond precision', () => {
    const result = calculateDateTimeAdjustment({
      base: '2024-05-06T07:08:09.123',
      operation: 'subtract',
      amount: '0',
      unit: 'seconds',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.resultLocal).toBe('2024-05-06T07:08:09.123')
  })

  it('rejects empty, malformed, nonexistent and negative values', () => {
    expect(calculateDateDifference('', '2024-01-01T00:00').ok).toBe(false)
    expect(calculateDateDifference('2024-02-30T00:00', '2024-03-01T00:00').ok).toBe(false)
    expect(calculateDateTimeAdjustment({
      base: '2024-01-01T00:00',
      operation: 'add',
      amount: '1.5',
      unit: 'days',
    }).ok).toBe(false)
    expect(calculateDateTimeAdjustment({
      base: '2024-01-01T00:00',
      operation: 'add',
      amount: '-1',
      unit: 'days',
    }).ok).toBe(false)
  })

  it('rejects unsupported or out-of-range adjustment values', () => {
    const unsupported = calculateDateTimeAdjustment({
      base: '2024-01-01T00:00',
      operation: 'add' as 'add',
      amount: '1',
      unit: 'weeks' as 'days',
    })
    const tooLarge = calculateDateTimeAdjustment({
      base: '2024-01-01T00:00',
      operation: 'add',
      amount: '9007199254740992',
      unit: 'days',
    })

    expect(unsupported.ok).toBe(false)
    expect(tooLarge.ok).toBe(false)
  })
})
