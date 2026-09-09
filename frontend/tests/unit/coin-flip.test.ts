import { describe, expect, it } from 'vitest'

import {
  createCoinFlipStatistics,
  flipCoin,
  recordCoinFlip,
  type CoinFlipRandomSource,
} from '../../core/coin-flip'

/** 创建返回固定随机字节的测试随机源。 */
function createRandomSource(byte: number): CoinFlipRandomSource {
  return {
    getRandomValues: (array: Uint8Array) => {
      array[0] = byte
      return array
    },
  }
}

describe('coin flip core', () => {
  it('maps the two halves of a random byte to heads and tails', () => {
    expect(flipCoin(createRandomSource(0))).toEqual({ ok: true, value: 'heads' })
    expect(flipCoin(createRandomSource(127))).toEqual({ ok: true, value: 'heads' })
    expect(flipCoin(createRandomSource(128))).toEqual({ ok: true, value: 'tails' })
    expect(flipCoin(createRandomSource(255))).toEqual({ ok: true, value: 'tails' })
  })

  it('accumulates total, heads, and tails counts for repeated flips', () => {
    let statistics = createCoinFlipStatistics()

    const first = recordCoinFlip(statistics, 'heads')
    expect(first).toEqual({ ok: true, value: { total: 1, heads: 1, tails: 0 } })
    if (!first.ok) return
    statistics = first.value

    const second = recordCoinFlip(statistics, 'tails')
    expect(second).toEqual({ ok: true, value: { total: 2, heads: 1, tails: 1 } })
    if (!second.ok) return
    statistics = second.value

    expect(recordCoinFlip(statistics, 'heads')).toEqual({
      ok: true,
      value: { total: 3, heads: 2, tails: 1 },
    })
  })

  it('returns a crypto error when the secure source is unavailable or throws', () => {
    expect(flipCoin(null as unknown as CoinFlipRandomSource)).toMatchObject({
      ok: false,
      error: { code: 'crypto-unavailable' },
    })
    expect(flipCoin({
      getRandomValues: () => {
        throw new Error('unavailable')
      },
    })).toMatchObject({
      ok: false,
      error: { code: 'crypto-unavailable' },
    })
  })

  it('rejects inconsistent statistics and invalid sides', () => {
    expect(recordCoinFlip({ total: 2, heads: 1, tails: 0 }, 'heads')).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
    expect(recordCoinFlip(createCoinFlipStatistics(), 'invalid' as 'heads')).toMatchObject({
      ok: false,
      error: { code: 'operation-failed' },
    })
  })
})
