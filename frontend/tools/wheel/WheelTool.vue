<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { getSecureRandomSource } from '~/adapters/secure-random'
import {
  distributeWheelWeightsEvenly,
  normalizeWheelOptions,
  removeSelectedWheelOption,
  selectWheelOption,
  WHEEL_MAX_LABEL_LENGTH,
  WHEEL_MAX_OPTIONS,
  type WheelOption,
  type WheelSelection,
} from '~/core/wheel'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const ANIMATION_DURATION_MS = 1500
const DEFAULT_OPTIONS = [
  { id: 'option-a', label: '选项 A', weightTenths: 333 },
  { id: 'option-b', label: '选项 B', weightTenths: 333 },
  { id: 'option-c', label: '选项 C', weightTenths: 0 },
] as const
const WHEEL_COLORS = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed', '#ca8a04', '#be123c']

type WheelVisualSegment = WheelOption & {
  startAngle: number
  endAngle: number
  color: string
}

const options = ref<WheelOption[]>(createDefaultOptions())
const weightInputValues = ref<Record<string, string>>({})
const removeSelected = ref(false)
const currentSelection = ref<WheelSelection | null>(null)
const pendingSelection = ref<WheelSelection | null>(null)
const lastResultWasRemoved = ref(false)
const error = ref<ToolError | null>(null)
const isSpinning = ref(false)
const rotationDegrees = ref(0)
let nextOptionId = 1
let animationHandle: ReturnType<typeof setTimeout> | null = null

const normalizedOptions = computed(() => normalizeWheelOptions(options.value))

const visualSegments = computed(() => buildWheelSegments(options.value))

const wheelGradient = computed(() => buildWheelGradient(visualSegments.value))

const isDepleted = computed(() => options.value.length === 0)

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (isSpinning.value) {
    return 'processing'
  }

  return currentSelection.value ? 'success' : 'idle'
})

const resultContextLabel = computed(() => {
  if (isSpinning.value || (error.value && currentSelection.value)) {
    return '上一次成功结果'
  }

  return currentSelection.value ? '本次结果' : '当前结果'
})

const resultStatusLabel = computed(() => {
  if (isSpinning.value) {
    return '正在转动…'
  }

  if (isDepleted.value) {
    return '转盘已耗尽'
  }

  return currentSelection.value ? '已完成' : '等待开始'
})

const resultText = computed(() => {
  if (!currentSelection.value) {
    return ''
  }

  return `本次结果：${currentSelection.value.option.label}`
})

const weightSummary = computed(() => {
  if (normalizedOptions.value.ok) {
    return '总占比 100.0%'
  }

  const manualTotal = options.value
    .slice(0, -1)
    .reduce((sum, option) => sum + (Number.isSafeInteger(option.weightTenths) ? option.weightTenths : 0), 0)

  return `前面已配置 ${formatWeight(manualTotal)}%`
})

const hasResettableState = computed(() => Boolean(
  !isDefaultOptions(options.value)
  || removeSelected.value
  || currentSelection.value
  || error.value
  || isSpinning.value,
))

/** 创建一组新的初始转盘选项，避免清空操作复用可变引用。 */
function createDefaultOptions(): WheelOption[] {
  return DEFAULT_OPTIONS.map((option) => ({ ...option }))
}

/** 判断当前选项是否仍然等于初始示例配置。 */
function isDefaultOptions(currentOptions: readonly WheelOption[]): boolean {
  return currentOptions.length === DEFAULT_OPTIONS.length
    && currentOptions.every((option, index) => {
      const defaultOption = DEFAULT_OPTIONS[index]

      if (!defaultOption) {
        return false
      }

      return option.id === defaultOption.id
        && option.label === defaultOption.label
        && option.weightTenths === defaultOption.weightTenths
    })
}

/** 将内部十分之一百分点权重格式化为页面百分比文本。 */
function formatWeight(weightTenths: number | null): string {
  if (weightTenths === null || !Number.isSafeInteger(weightTenths)) {
    return ''
  }

  return (weightTenths / 10).toFixed(1)
}

/** 读取当前行应展示的权重，包括最后一项的自动剩余值。 */
function getDisplayedWeight(index: number): number | null {
  if (normalizedOptions.value.ok) {
    return normalizedOptions.value.value[index]?.weightTenths ?? null
  }

  return options.value[index]?.weightTenths ?? null
}

/** 读取权重输入框当前编辑文本，避免按键过程中被格式化打断。 */
function getWeightInputValue(index: number, option: WheelOption): string {
  if (index === options.value.length - 1) {
    return formatWeight(getDisplayedWeight(index))
  }

  return weightInputValues.value[option.id] ?? formatWeight(getDisplayedWeight(index))
}

/** 清除权重输入框的临时编辑文本并恢复规范化显示。 */
function resetWeightInputValues() {
  weightInputValues.value = {}
}

/** 根据当前有效权重构建转盘分区的角度和颜色信息。 */
function buildWheelSegments(currentOptions: readonly WheelOption[]): WheelVisualSegment[] {
  const normalizedResult = normalizeWheelOptions(currentOptions)

  if (!normalizedResult.ok) {
    return []
  }

  const segments: WheelVisualSegment[] = []
  let currentAngle = 0

  for (let index = 0; index < normalizedResult.value.length; index += 1) {
    const option = normalizedResult.value[index]

    if (!option) {
      return []
    }

    const angle = option.weightTenths / 1000 * 360

    segments.push({
      ...option,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: WHEEL_COLORS[index % WHEEL_COLORS.length] ?? '#0f766e',
    })
    currentAngle += angle
  }

  return segments
}

/** 将转盘分区转换为以顶部为零度基准的 CSS 圆锥渐变。 */
function buildWheelGradient(segments: readonly WheelVisualSegment[]): string {
  if (!segments.length) {
    return 'conic-gradient(from 0deg, #dbe5e3 0deg 360deg)'
  }

  const stops = segments
    .map((segment) => `${segment.color} ${segment.startAngle}deg ${segment.endAngle}deg`)
    .join(', ')

  return `conic-gradient(from 0deg, ${stops})`
}

/** 判断转盘分区是否拥有足够空间展示辅助文字标签。 */
function shouldShowWheelLabel(segment: WheelVisualSegment): boolean {
  return segment.endAngle - segment.startAngle >= 22
}

/** 计算转盘分区辅助文字沿扇区中心线的样式变量。 */
function getWheelLabelStyle(segment: WheelVisualSegment): Record<string, string> {
  const centerAngle = (segment.startAngle + segment.endAngle) / 2

  return {
    '--wheel-label-angle': `${centerAngle}deg`,
    '--wheel-label-counter-angle': `${-centerAngle}deg`,
  }
}

/** 计算目标分区停在顶部指针下方所需的最终旋转角度。 */
function calculateTargetRotation(currentRotation: number, segment: WheelVisualSegment): number {
  const segmentCenter = (segment.startAngle + segment.endAngle) / 2
  const currentModulo = ((currentRotation % 360) + 360) % 360
  const targetModulo = ((360 - segmentCenter) + 360) % 360
  const correction = (targetModulo - currentModulo + 360) % 360

  return currentRotation + correction + 360 * 4
}

/** 判断当前浏览器是否要求减少非必要动态效果。 */
function shouldReduceMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 清除尚未完成的转盘动画回调。 */
function clearAnimation() {
  if (animationHandle !== null) {
    clearTimeout(animationHandle)
    animationHandle = null
  }
}

/** 提交一次成功选择，并按开关决定是否移除选中项。 */
function completeSpin(selection: WheelSelection) {
  currentSelection.value = selection
  pendingSelection.value = null
  lastResultWasRemoved.value = false

  if (removeSelected.value) {
    const removalResult = removeSelectedWheelOption(options.value, selection.index)

    if (!removalResult.ok) {
      error.value = removalResult.error
      isSpinning.value = false
      animationHandle = null
      return
    }

    options.value = removalResult.value
    resetWeightInputValues()
    lastResultWasRemoved.value = true
  }

  isSpinning.value = false
  animationHandle = null
}

/** 更新转盘选项文本并清除已经过期的错误状态。 */
function updateOptionLabel(index: number, value: string) {
  const option = options.value[index]

  if (!option || isSpinning.value) {
    return
  }

  options.value[index] = {
    ...option,
    label: value,
  }
  error.value = null
}

/** 将页面权重输入解析为十分之一百分点整数，拒绝超过一位的小数。 */
function parseWheelWeightInput(value: string): number {
  const normalizedValue = value.trim()

  if (!/^-?(?:\d+(?:\.\d{0,1})?|\.\d)$/.test(normalizedValue)) {
    return Number.NaN
  }

  const parsedValue = Number(normalizedValue)

  return Number.isFinite(parsedValue) ? Math.round(parsedValue * 10) : Number.NaN
}

/** 更新非最后一项的可编辑权重。 */
function updateOptionWeight(index: number, value: string) {
  const option = options.value[index]

  if (!option || isSpinning.value || index >= options.value.length - 1) {
    return
  }

  const weightTenths = parseWheelWeightInput(value)
  weightInputValues.value = {
    ...weightInputValues.value,
    [option.id]: value,
  }

  options.value[index] = {
    ...option,
    weightTenths,
  }
  error.value = null
}

/** 添加一个位于自动权重项之前的新选项。 */
function addOption() {
  if (isSpinning.value) {
    return
  }

  if (options.value.length >= WHEEL_MAX_OPTIONS) {
    error.value = {
      code: 'out-of-range',
      message: `转盘最多支持 ${WHEEL_MAX_OPTIONS} 个选项。`,
    }
    return
  }

  nextOptionId += 1
  const newOption: WheelOption = {
    id: `option-new-${nextOptionId}`,
    label: `新选项 ${nextOptionId}`,
    weightTenths: 0,
  }
  const insertIndex = Math.max(options.value.length - 1, 0)

  options.value = [
    ...options.value.slice(0, insertIndex),
    newOption,
    ...options.value.slice(insertIndex),
  ]
  resetWeightInputValues()
  error.value = null
}

/** 将当前全部选项按相等比例重新分配权重。 */
function averageWeights() {
  if (isSpinning.value || options.value.length === 0) {
    return
  }

  const result = distributeWheelWeightsEvenly(options.value)

  if (!result.ok) {
    error.value = result.error
    return
  }

  options.value = result.value
  resetWeightInputValues()
  error.value = null
}

/** 删除指定转盘选项并保留其余配置顺序。 */
function removeOption(index: number) {
  if (isSpinning.value || !options.value[index]) {
    return
  }

  options.value = options.value.filter((_, optionIndex) => optionIndex !== index)
  resetWeightInputValues()
  error.value = null
}

/** 清除选项编辑后不再适用的错误状态。 */
function clearInputError() {
  error.value = null
}

/** 执行一次按权重的安全随机选择并启动转盘动画。 */
function spin() {
  if (isSpinning.value || isDepleted.value) {
    return
  }

  const source = getSecureRandomSource()

  if (!source) {
    error.value = {
      code: 'crypto-unavailable',
      message: '当前浏览器没有可用的安全随机源，无法启动转盘。',
    }
    return
  }

  const selectionResult = selectWheelOption(options.value, source)

  if (!selectionResult.ok) {
    error.value = selectionResult.error
    return
  }

  const segment = visualSegments.value[selectionResult.value.index]

  if (!segment) {
    error.value = {
      code: 'operation-failed',
      message: '转盘视觉状态无效，请清空后重试。',
    }
    return
  }

  error.value = null
  pendingSelection.value = selectionResult.value
  isSpinning.value = true
  rotationDegrees.value = calculateTargetRotation(rotationDegrees.value, segment)
  clearAnimation()

  if (shouldReduceMotion()) {
    completeSpin(selectionResult.value)
    return
  }

  animationHandle = setTimeout(() => {
    completeSpin(selectionResult.value)
  }, ANIMATION_DURATION_MS)
}

/** 清除当前选项、结果、错误和去除状态并恢复初始转盘。 */
function clearAll() {
  clearAnimation()
  options.value = createDefaultOptions()
  resetWeightInputValues()
  removeSelected.value = false
  currentSelection.value = null
  pendingSelection.value = null
  lastResultWasRemoved.value = false
  error.value = null
  isSpinning.value = false
  rotationDegrees.value = 0
}

onBeforeUnmount(() => {
  clearAnimation()
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split wheel-tool">
    <ToolInputPanel title="转盘配置" description="在浏览器本地编辑选项和占比，使用安全随机源完成一次转盘选择。">
      <div class="wheel-tool__intro">
        <span class="wheel-tool__eyebrow">随机互动</span>
        <p>配置选项的占比后启动转盘；最后一项的占比会自动补足到 100.0%。</p>
      </div>

      <div class="wheel-tool__primary-actions">
        <div class="wheel-tool__remove-control">
          <label class="tool-check-field wheel-tool__remove-toggle">
            <input v-model="removeSelected" type="checkbox" :disabled="isSpinning" @change="clearInputError">
            <span>去除选中</span>
          </label>
          <p class="wheel-tool__toggle-help">开启后，选中的选项会在动画完成后移除，其占比平均分给剩余选项。</p>
        </div>

        <div class="tool-panel__actions">
          <button type="button" class="button button--primary" :disabled="isSpinning || isDepleted" @click="spin">
            {{ isSpinning ? '转动中…' : '开始转盘' }}
          </button>
          <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
        </div>
      </div>

      <div class="wheel-tool__section-heading">
        <div>
          <span class="tool-field__label">选项与占比</span>
          <p>{{ weightSummary }}</p>
        </div>
        <span class="wheel-tool__count">{{ options.length }} / {{ WHEEL_MAX_OPTIONS }}</span>
      </div>

      <div class="wheel-tool__config-actions">
        <div class="wheel-tool__config-buttons">
          <button type="button" class="button button--secondary button--small" :disabled="isSpinning || options.length >= WHEEL_MAX_OPTIONS" @click="addOption">
            添加选项
          </button>
          <button type="button" class="button button--secondary button--small" :disabled="isSpinning || options.length === 0" @click="averageWeights">
            平均分配
          </button>
        </div>
        <span class="wheel-tool__hint">{{ options.length >= WHEEL_MAX_OPTIONS ? `已达到 ${WHEEL_MAX_OPTIONS} 项上限` : '最后一项占比自动计算' }}</span>
      </div>

      <div v-if="options.length" class="wheel-tool__options" aria-label="转盘选项列表">
        <div v-for="(option, index) in options" :key="option.id" class="wheel-tool__option-row">
          <label class="tool-field wheel-tool__label-field">
            <span class="tool-field__label">选项 {{ index + 1 }}</span>
            <input
              class="tool-input"
              type="text"
              :value="option.label"
              :maxlength="WHEEL_MAX_LABEL_LENGTH"
              :disabled="isSpinning"
              :aria-label="`选项 ${index + 1} 文本`"
              @input="updateOptionLabel(index, ($event.target as HTMLInputElement).value)"
            >
          </label>

          <label class="tool-field wheel-tool__weight-field">
            <span class="tool-field__label">占比{{ index === options.length - 1 ? '（自动）' : '' }}</span>
            <span class="wheel-tool__weight-input">
              <input
                class="tool-input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                 :value="getWeightInputValue(index, option)"
                :readonly="index === options.length - 1"
                :disabled="isSpinning || index === options.length - 1"
                :aria-label="`选项 ${index + 1} 占比`"
                @input="updateOptionWeight(index, ($event.target as HTMLInputElement).value)"
              >
              <span>%</span>
            </span>
          </label>

          <button
            type="button"
            class="text-button text-button--danger wheel-tool__remove-button"
            :disabled="isSpinning"
            :aria-label="`删除选项 ${index + 1}`"
            @click="removeOption(index)"
          >
            删除
          </button>
        </div>
      </div>

      <div v-else class="wheel-tool__depleted-config">
        <strong>转盘已没有可用选项</strong>
        <p>可以添加新选项，或点击“清空”恢复初始配置。</p>
      </div>

    </ToolInputPanel>

    <ToolResultPanel
      title="转盘结果"
      :status="status"
      :error="error"
      aria-live="off"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      :empty-text="''"
    >
      <div class="wheel-tool__result" :aria-busy="isSpinning">
        <div class="wheel-tool__stage" aria-label="转盘预览">
          <span class="wheel-tool__pointer" aria-hidden="true"></span>
          <div
            class="wheel-tool__wheel"
            :class="{ 'wheel-tool__wheel--spinning': isSpinning }"
            :style="{ background: wheelGradient, transform: `rotate(${rotationDegrees}deg)` }"
            aria-hidden="true"
          >
            <template v-for="segment in visualSegments" :key="`label-${segment.id}`">
              <span
                v-if="shouldShowWheelLabel(segment)"
                class="wheel-tool__wheel-label"
                :style="getWheelLabelStyle(segment)"
              >
                {{ segment.label }}
              </span>
            </template>
            <span class="wheel-tool__wheel-center">转盘</span>
          </div>
        </div>

        <div class="wheel-tool__result-copy">
          <span class="wheel-tool__result-label">{{ resultContextLabel }}</span>
          <strong>{{ isSpinning ? '正在转动，请稍候' : (currentSelection?.option.label || resultStatusLabel) }}</strong>
          <span v-if="lastResultWasRemoved && !isSpinning" class="wheel-tool__removed-note">已从转盘移除 · 剩余 {{ options.length }} 项</span>
        </div>

        <p v-if="isSpinning" class="wheel-tool__accessible-result" aria-live="polite">正在转动，请稍候。</p>
        <p v-else-if="currentSelection" class="wheel-tool__accessible-result" aria-live="polite">
          {{ error ? `上一次结果为${currentSelection.option.label}。` : `本次结果为${currentSelection.option.label}。` }}
        </p>
        <p v-else class="wheel-tool__empty-result">编辑选项和占比后，点击“开始转盘”。</p>

        <div v-if="visualSegments.length" class="wheel-tool__legend" aria-label="当前转盘选项和占比">
          <div v-for="segment in visualSegments" :key="segment.id" class="wheel-tool__legend-item">
            <span class="wheel-tool__legend-swatch" :style="{ backgroundColor: segment.color }" aria-hidden="true"></span>
            <span>{{ segment.label }}</span>
            <strong>{{ formatWeight(segment.weightTenths) }}%</strong>
          </div>
        </div>
        <div v-else class="wheel-tool__empty-result">当前没有可展示的转盘选项。</div>
      </div>

      <template #actions>
        <CopyButton :text="resultText" label="复制当前结果" :disabled="!currentSelection" />
      </template>
    </ToolResultPanel>
  </div>
</template>
