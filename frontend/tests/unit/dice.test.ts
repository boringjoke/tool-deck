import { describe, expect, it } from 'vitest'

import {
  appendDiceRollHistory,
  DICE_MAX_HISTORY,
  rollDice,
  type DiceRandomSource,
} from '../../core/dice'

/** 创建按顺序返回固定随机字节的测试随机源。 */
function createRandomSource(bytes: number[]): DiceRandomSource {
  let index = 0

  return {
    getRandomValues: (array: Uint8Array) => {
      array[0] = bytes[index] ?? 0
      index += 1
      return array
    },
  }
}

describe('dice core', () => {
  it('maps six-sided random byte boundaries to values from 1 to 6', () => {
    const result = rollDice(6, createRandomSource([0, 1, 5, 6, 250, 251]))

    expect(result).toEqual({
      ok: true,
      value: {
        sides: 6,
        values: [1, 2, 6, 1, 5, 6],
        total: 21,
      },
    })
  })

  it('rejects biased byte values before accepting a valid sample', () => {
    const result = rollDice(1, createRandomSource([252, 255, 0]))

    expect(result).toEqual({
      ok: true,
      value: {
        sides: 6,
        values: [1],
        total: 1,
      },
    })
  })

  it('validates count and preserves the sum for multiple dice', () => {
    const result = rollDice(3, createRandomSource([2, 3, 4]))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.values).toHaveLength(3)
    expect(result.value.total).toBe(result.value.values.reduce((sum, value) => sum + value, 0))
    expect(rollDice(0, createRandomSource([]))).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
    expect(rollDice(7, createRandomSource([]))).toMatchObject({
      ok: false,
      error: { code: 'out-of-range' },
    })
  })

  it('returns secure random errors without returning partial results', () => {
    expect(rollDice(1, null as unknown as DiceRandomSource)).toMatchObject({
      ok: false,
      error: { code: 'crypto-unavailable' },
    })
    expect(rollDice(2, {
      getRandomValues: () => {
        throw new Error('unavailable')
      },
    })).toMatchObject({
      ok: false,
      error: { code: 'crypto-unavailable' },
    })
  })

  it('keeps the ten newest history records and does not mutate input history', () => {
    const history = Array.from({ length: DICE_MAX_HISTORY }, (_, index) => ({
      sides: 6,
      values: [index + 1 <= 6 ? index + 1 : 1],
      total: index + 1 <= 6 ? index + 1 : 1,
    }))
    const nextRoll = {
      sides: 6,
      values: [6],
      total: 6,
    }

    const result = appendDiceRollHistory(history, nextRoll)

    expect(result).toEqual({
      ok: true,
      value: [nextRoll, ...history.slice(0, DICE_MAX_HISTORY - 1)],
    })
    expect(history).toHaveLength(DICE_MAX_HISTORY)
    expect(history[0]).toEqual({ sides: 6, values: [1], total: 1 })
  })

  it('rejects invalid history or a random source that keeps returning rejected samples', () => {
    expect(appendDiceRollHistory([{ sides: 6, values: [7], total: 7 }], {
      sides: 6,
      values: [1],
      total: 1,
    })).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })

    expect(rollDice(1, createRandomSource(Array.from({ length: 128 }, () => 255)))).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })
})
