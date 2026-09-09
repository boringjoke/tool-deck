import { failure, success, type ToolResult } from './tool-result'

export type CoinSide = 'heads' | 'tails'

export interface CoinFlipRandomSource {
  getRandomValues: (array: Uint8Array) => Uint8Array
}

export interface CoinFlipStatistics {
  readonly total: number
  readonly heads: number
  readonly tails: number
}

/** 创建当前抛硬币会话的空统计。 */
export function createCoinFlipStatistics(): CoinFlipStatistics {
  return {
    total: 0,
    heads: 0,
    tails: 0,
  }
}

/** 校验抛硬币统计快照，避免错误状态继续累加。 */
function isValidCoinFlipStatistics(statistics: CoinFlipStatistics): boolean {
  return Number.isSafeInteger(statistics.total)
    && Number.isSafeInteger(statistics.heads)
    && Number.isSafeInteger(statistics.tails)
    && statistics.total >= 0
    && statistics.heads >= 0
    && statistics.tails >= 0
    && statistics.total === statistics.heads + statistics.tails
}

/** 记录一次正面或反面结果并返回新的统计快照。 */
export function recordCoinFlip(
  statistics: CoinFlipStatistics,
  side: CoinSide,
): ToolResult<CoinFlipStatistics> {
  if (!isValidCoinFlipStatistics(statistics)) {
    return failure('operation-failed', '抛硬币统计状态无效，请清空后重试。')
  }

  if (side !== 'heads' && side !== 'tails') {
    return failure('operation-failed', '抛硬币结果无效，请清空后重试。')
  }

  const nextStatistics = {
    total: statistics.total + 1,
    heads: statistics.heads + (side === 'heads' ? 1 : 0),
    tails: statistics.tails + (side === 'tails' ? 1 : 0),
  }

  if (!isValidCoinFlipStatistics(nextStatistics)) {
    return failure('operation-failed', '抛硬币统计超出可安全计算范围，请清空后重试。')
  }

  return success(nextStatistics)
}

/** 使用一个安全随机字节生成正面或反面结果。 */
export function flipCoin(source: CoinFlipRandomSource): ToolResult<CoinSide> {
  if (!source || typeof source.getRandomValues !== 'function') {
    return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法抛硬币。')
  }

  try {
    const bytes = new Uint8Array(1)
    source.getRandomValues(bytes)
    const randomByte = bytes[0]

    if (randomByte === undefined) {
      return failure('operation-failed', '安全随机源没有返回有效结果，请重试。')
    }

    return success(randomByte < 128 ? 'heads' : 'tails')
  } catch {
    return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法抛硬币。')
  }
}
