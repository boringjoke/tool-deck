import { failure, success, type ToolResult } from './tool-result'

export const DICE_MIN_COUNT = 1
export const DICE_MAX_COUNT = 6
export const DICE_DEFAULT_SIDES = 6
export const DICE_MIN_SIDES = 2
export const DICE_MAX_SIDES = 255
export const DICE_MAX_HISTORY = 10
export const DICE_MAX_RANDOM_ATTEMPTS = 128

/** 定义骰子核心使用的可注入安全随机源。 */
export interface DiceRandomSource {
  getRandomValues: (array: Uint8Array) => Uint8Array
}

/** 描述一次投掷的骰子面数、各骰子结果和点数总和。 */
export interface DiceRoll {
  readonly sides: number
  readonly values: readonly number[]
  readonly total: number
}

/** 描述当前页面内存中的投掷历史。 */
export type DiceRollHistory = readonly DiceRoll[]

/** 判断骰子面数是否处于当前随机字节支持的安全范围。 */
function isValidDiceSides(sides: number): boolean {
  return Number.isSafeInteger(sides)
    && sides >= DICE_MIN_SIDES
    && sides <= DICE_MAX_SIDES
}

/** 判断一次骰子结果是否满足数量、范围和总和一致性约束。 */
function isValidDiceRoll(roll: DiceRoll): boolean {
  if (!roll || !isValidDiceSides(roll.sides) || !Array.isArray(roll.values)) {
    return false
  }

  if (roll.values.length < DICE_MIN_COUNT || roll.values.length > DICE_MAX_COUNT) {
    return false
  }

  if (!Number.isSafeInteger(roll.total) || roll.total < 0) {
    return false
  }

  const total = roll.values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 1 || value > roll.sides) {
      return Number.NaN
    }

    return sum + value
  }, 0)

  return Number.isSafeInteger(total) && total === roll.total
}

/** 使用拒绝取样生成一枚无偏骰子结果。 */
function rollSingleDie(
  sides: number,
  source: DiceRandomSource,
): ToolResult<number> {
  const acceptanceLimit = Math.floor(256 / sides) * sides

  for (let attempt = 0; attempt < DICE_MAX_RANDOM_ATTEMPTS; attempt += 1) {
    try {
      const bytes = new Uint8Array(1)
      source.getRandomValues(bytes)
      const randomByte = bytes[0]

      if (randomByte === undefined) {
        return failure('operation-failed', '安全随机源没有返回有效结果，请重试。')
      }

      if (randomByte < acceptanceLimit) {
        return success((randomByte % sides) + 1)
      }
    } catch {
      return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法掷骰子。')
    }
  }

  return failure('operation-failed', '安全随机源连续返回无效样本，请重试。')
}

/** 校验骰子数量和面数，并使用安全随机源生成一次投掷结果。 */
export function rollDice(
  count: number,
  source: DiceRandomSource,
  sides = DICE_DEFAULT_SIDES,
): ToolResult<DiceRoll> {
  if (!Number.isSafeInteger(count) || count < DICE_MIN_COUNT || count > DICE_MAX_COUNT) {
    return failure('out-of-range', `骰子数量必须是 ${DICE_MIN_COUNT}–${DICE_MAX_COUNT} 之间的整数。`)
  }

  if (!isValidDiceSides(sides)) {
    return failure('out-of-range', `骰子面数必须是 ${DICE_MIN_SIDES}–${DICE_MAX_SIDES} 之间的整数。`)
  }

  if (!source || typeof source.getRandomValues !== 'function') {
    return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法掷骰子。')
  }

  const values: number[] = []

  for (let index = 0; index < count; index += 1) {
    const valueResult = rollSingleDie(sides, source)

    if (!valueResult.ok) {
      return valueResult
    }

    values.push(valueResult.value)
  }

  const roll: DiceRoll = {
    sides,
    values,
    total: values.reduce((sum, value) => sum + value, 0),
  }

  return success(roll)
}

/** 将一次成功投掷加入历史并限制为最近十条记录。 */
export function appendDiceRollHistory(
  history: DiceRollHistory,
  roll: DiceRoll,
): ToolResult<DiceRollHistory> {
  if (!Array.isArray(history) || history.some((item) => !isValidDiceRoll(item)) || !isValidDiceRoll(roll)) {
    return failure('operation-failed', '骰子历史状态无效，请清空后重试。')
  }

  return success([roll, ...history].slice(0, DICE_MAX_HISTORY))
}
