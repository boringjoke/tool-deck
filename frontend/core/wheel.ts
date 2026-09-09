import { failure, success, type ToolResult } from './tool-result'
import type { SecureRandomSource } from './uuid'

export const WHEEL_MIN_OPTIONS = 1
export const WHEEL_MAX_OPTIONS = 20
export const WHEEL_MAX_LABEL_LENGTH = 80
export const WHEEL_TOTAL_WEIGHT_TENTHS = 1000
export const WHEEL_MAX_RANDOM_ATTEMPTS = 128

/** 描述转盘中的一个选项及其十分之一百分点权重。 */
export interface WheelOption {
  readonly id: string
  readonly label: string
  readonly weightTenths: number
}

/** 描述一次按权重完成的转盘选择。 */
export interface WheelSelection {
  readonly index: number
  readonly option: WheelOption
  readonly weightTenths: number
}

/** 判断选项文本是否满足当前转盘的非空和长度约束。 */
function isValidWheelLabel(label: string): boolean {
  return label.trim().length > 0
    && Array.from(label.trim()).length <= WHEEL_MAX_LABEL_LENGTH
}

/** 判断权重是否为 0.1% 精度的合法非负整数。 */
function isValidWheelWeight(weightTenths: number): boolean {
  return Number.isSafeInteger(weightTenths)
    && weightTenths >= 0
    && weightTenths <= WHEEL_TOTAL_WEIGHT_TENTHS
}

/** 计算最后一个选项应承担的剩余权重。 */
function getRemainingWheelWeight(manualWeightTotal: number): number {
  return WHEEL_TOTAL_WEIGHT_TENTHS - manualWeightTotal
}

/** 校验并规范化转盘选项，同时计算最后一项的自动权重。 */
export function normalizeWheelOptions(
  options: readonly WheelOption[],
): ToolResult<WheelOption[]> {
  if (!Array.isArray(options) || options.length < WHEEL_MIN_OPTIONS) {
    return failure('empty-input', '请至少保留一个非空转盘选项。')
  }

  if (options.length > WHEEL_MAX_OPTIONS) {
    return failure('out-of-range', `转盘最多支持 ${WHEEL_MAX_OPTIONS} 个选项。`)
  }

  const labels = new Set<string>()
  const normalizedOptions: WheelOption[] = []
  let manualWeightTotal = 0

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]

    if (!option || typeof option.id !== 'string' || option.id.trim().length === 0) {
      return failure('operation-failed', '转盘选项状态无效，请清空后重试。')
    }

    if (typeof option.label !== 'string') {
      return failure('invalid-input', '转盘选项文本状态无效，请修改后重试。')
    }

    const label = option.label.trim()

    if (!isValidWheelLabel(label)) {
      return label.length === 0
        ? failure('empty-input', '转盘选项不能为空，请补充内容后重试。')
        : failure('out-of-range', `每个转盘选项最多支持 ${WHEEL_MAX_LABEL_LENGTH} 个字符。`)
    }

    if (labels.has(label)) {
      return failure('invalid-input', '转盘选项不能重复，请修改重复内容。')
    }

    labels.add(label)

    if (index < options.length - 1) {
      if (!isValidWheelWeight(option.weightTenths)) {
        return failure('invalid-input', '可编辑权重必须是 0.0%–100.0% 的 0.1% 精度非负数。')
      }

      manualWeightTotal += option.weightTenths

      if (manualWeightTotal > WHEEL_TOTAL_WEIGHT_TENTHS) {
        return failure('out-of-range', '前面选项的权重总和不能超过 100.0%。')
      }
    }

    normalizedOptions.push({
      id: option.id,
      label,
      weightTenths: index < options.length - 1 ? option.weightTenths : 0,
    })
  }

  const lastIndex = normalizedOptions.length - 1
  const lastOption = normalizedOptions[lastIndex]

  if (!lastOption) {
    return failure('operation-failed', '转盘选项状态无效，请清空后重试。')
  }

  const remainingWeight = getRemainingWheelWeight(manualWeightTotal)

  normalizedOptions[lastIndex] = {
    ...lastOption,
    weightTenths: remainingWeight,
  }

  if (normalizedOptions.every((option) => option.weightTenths === 0)) {
    return failure('invalid-input', '至少需要一个占比大于 0.0% 的转盘选项。')
  }

  return success(normalizedOptions)
}

/** 将当前有效选项按顺序平均分配到总权重，并由最后一项承担余数。 */
export function distributeWheelWeightsEvenly(
  options: readonly WheelOption[],
): ToolResult<WheelOption[]> {
  if (!Array.isArray(options) || options.length < WHEEL_MIN_OPTIONS || options.length > WHEEL_MAX_OPTIONS) {
    return normalizeWheelOptions(options)
  }

  const optionCount = options.length
  const baseWeight = Math.floor(1000 / optionCount)
  const lastIndex = optionCount - 1
  const evenlyDistributedOptions: WheelOption[] = []

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]

    if (!option) {
      return failure('operation-failed', '转盘选项状态无效，请清空后重试。')
    }

    evenlyDistributedOptions.push({
      ...option,
      weightTenths: index === lastIndex ? 0 : baseWeight,
    })
  }

  return normalizeWheelOptions(evenlyDistributedOptions)
}

/** 使用拒绝取样生成一个落在总权重范围内的无偏随机整数。 */
function createWeightedRandomValue(source: SecureRandomSource): ToolResult<number> {
  const randomDomain = 2 ** 32
  const acceptanceLimit = Math.floor(randomDomain / WHEEL_TOTAL_WEIGHT_TENTHS) * WHEEL_TOTAL_WEIGHT_TENTHS

  for (let attempt = 0; attempt < WHEEL_MAX_RANDOM_ATTEMPTS; attempt += 1) {
    try {
      const randomValues = new Uint32Array(1)
      source.getRandomValues(randomValues)
      const randomValue = randomValues[0]

      if (randomValue === undefined) {
        return failure('operation-failed', '安全随机源没有返回有效结果，请重试。')
      }

      if (randomValue < acceptanceLimit) {
        return success(randomValue % WHEEL_TOTAL_WEIGHT_TENTHS)
      }
    } catch {
      return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法启动转盘。')
    }
  }

  return failure('operation-failed', '安全随机源连续返回无效样本，请重试。')
}

/** 按规范化后的权重选择一个转盘选项。 */
export function selectWheelOption(
  options: readonly WheelOption[],
  source: SecureRandomSource,
): ToolResult<WheelSelection> {
  const normalizedResult = normalizeWheelOptions(options)

  if (!normalizedResult.ok) {
    return normalizedResult
  }

  if (!source || typeof source.getRandomValues !== 'function') {
    return failure('crypto-unavailable', '当前浏览器没有可用的安全随机源，无法启动转盘。')
  }

  const randomResult = createWeightedRandomValue(source)

  if (!randomResult.ok) {
    return randomResult
  }

  let rangeEnd = 0

  for (let index = 0; index < normalizedResult.value.length; index += 1) {
    const option = normalizedResult.value[index]

    if (!option) {
      return failure('operation-failed', '转盘权重状态无效，请清空后重试。')
    }

    rangeEnd += option.weightTenths

    if (randomResult.value < rangeEnd) {
      return success({
        index,
        option,
        weightTenths: option.weightTenths,
      })
    }
  }

  return failure('operation-failed', '转盘权重状态无效，请清空后重试。')
}

/** 移除已选中的选项，并按当前顺序平均分配其权重。 */
export function removeSelectedWheelOption(
  options: readonly WheelOption[],
  selectedIndex: number,
): ToolResult<WheelOption[]> {
  const normalizedResult = normalizeWheelOptions(options)

  if (!normalizedResult.ok) {
    return normalizedResult
  }

  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= normalizedResult.value.length) {
    return failure('operation-failed', '转盘选中项状态无效，请清空后重试。')
  }

  const selectedOption = normalizedResult.value[selectedIndex]

  if (!selectedOption) {
    return failure('operation-failed', '转盘选中项状态无效，请清空后重试。')
  }

  const remainingOptions = normalizedResult.value.filter((_, index) => index !== selectedIndex)

  if (remainingOptions.length === 0) {
    return success([])
  }

  const baseShare = Math.floor(selectedOption.weightTenths / remainingOptions.length)
  const remainder = selectedOption.weightTenths % remainingOptions.length
  const distributedOptions: WheelOption[] = []

  for (let index = 0; index < remainingOptions.length; index += 1) {
    const option = remainingOptions[index]

    if (!option) {
      return failure('operation-failed', '转盘选项状态无效，请清空后重试。')
    }

    const extraShare = index < remainder ? 1 : 0

    distributedOptions.push({
      ...option,
      weightTenths: option.weightTenths + baseShare + extraShare,
    })
  }

  return normalizeWheelOptions(distributedOptions)
}
