<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  calculateDateDifference,
  calculateDateTimeAdjustment,
  type DateTimeAdjustmentResult,
  type DateTimeDifferenceResult,
  type DateTimeMode,
  type DateTimeOperation,
  type DateTimeUnit,
} from '~/core/date-time-calculator'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const modeOptions: readonly { value: DateTimeMode; label: string }[] = [
  { value: 'difference', label: '日期差' },
  { value: 'add-subtract', label: '日期加减' },
]

const unitOptions: readonly { value: DateTimeUnit; label: string }[] = [
  { value: 'years', label: '年' },
  { value: 'months', label: '月' },
  { value: 'days', label: '日' },
  { value: 'hours', label: '小时' },
  { value: 'minutes', label: '分钟' },
  { value: 'seconds', label: '秒' },
]

const mode = ref<DateTimeMode>('difference')
const startDateValue = ref('')
const startTimeValue = ref('')
const endDateValue = ref('')
const endTimeValue = ref('')
const baseDateValue = ref('')
const baseTimeValue = ref('')
const operation = ref<DateTimeOperation>('add')
const amount = ref('')
const unit = ref<DateTimeUnit>('days')
const result = ref<DateTimeDifferenceResult | DateTimeAdjustmentResult | null>(null)
const error = ref<ToolError | null>(null)

const status = computed<ToolUiStatus>(() => {
  if (result.value) {
    return 'success'
  }

  if (error.value?.code === 'empty-input') {
    return 'idle'
  }

  if (error.value) {
    return 'error'
  }

  return 'idle'
})

const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '输入日期（时间可选）并点击“开始计算”后，结果会显示在这里。')

const resultTitle = computed(() => result.value?.mode === 'add-subtract' ? '日期加减结果' : '日期差结果')

/** 组合日期和可选时间为核心逻辑使用的本地值。 */
function composeDateTimeValue(dateValue: string, timeValue: string): string {
  const date = dateValue.trim()
  const time = timeValue.trim()

  if (!date) {
    return ''
  }

  return time ? `${date}T${time}` : date
}

const resultIsStale = computed(() => {
  if (!result.value || result.value.mode !== mode.value) {
    return false
  }

  if (result.value.mode === 'difference') {
    return result.value.input.start !== composeDateTimeValue(startDateValue.value, startTimeValue.value)
      || result.value.input.end !== composeDateTimeValue(endDateValue.value, endTimeValue.value)
  }

  return result.value.input.base !== composeDateTimeValue(baseDateValue.value, baseTimeValue.value)
    || result.value.input.operation !== operation.value
    || result.value.input.amount !== amount.value.trim()
    || result.value.input.unit !== unit.value
})

const hasResettableState = computed(() => Boolean(
  startDateValue.value
  || startTimeValue.value
  || endDateValue.value
  || endTimeValue.value
  || baseDateValue.value
  || baseTimeValue.value
  || amount.value
  || result.value
  || error.value
  || mode.value !== 'difference'
  || operation.value !== 'add'
  || unit.value !== 'days',
))

const resultText = computed(() => {
  if (!result.value) {
    return ''
  }

  if (result.value.mode === 'difference') {
    const breakdown = result.value.breakdown
    const sign = breakdown.sign

    return [
      '日期差',
      `开始：${result.value.startLocal}`,
      `结束：${result.value.endLocal}`,
      `总天数：${result.value.totalDays}`,
      `总小时：${result.value.totalHours}`,
      `总分钟：${result.value.totalMinutes}`,
      `总秒数：${result.value.totalSeconds}`,
      `总毫秒：${result.value.totalMilliseconds}`,
      `分解：${sign}${breakdown.days} 天 ${breakdown.hours} 小时 ${breakdown.minutes} 分钟 ${breakdown.seconds} 秒 ${breakdown.milliseconds} 毫秒`,
      `说明：${result.value.notice}`,
    ].join('\n')
  }

  return [
    '日期加减',
    `基准：${result.value.baseLocal}`,
    `操作：${result.value.input.operation === 'add' ? '增加' : '减少'} ${result.value.input.amount}${getUnitLabel(result.value.input.unit)}`,
    `结果：${result.value.resultLocal}`,
    `ISO 8601：${result.value.resultIso}`,
    `说明：${result.value.notice}`,
  ].join('\n')
})

/** 获取日期时间单位的显示名称。 */
function getUnitLabel(value: DateTimeUnit): string {
  return unitOptions.find((option) => option.value === value)?.label ?? value
}

/** 清除当前输入变化对应的错误状态。 */
function clearCurrentError() {
  error.value = null
}

/** 切换工具模式并重置模式相关状态。 */
function setMode(nextMode: DateTimeMode) {
  if (mode.value === nextMode) {
    return
  }

  mode.value = nextMode
  startDateValue.value = ''
  startTimeValue.value = ''
  endDateValue.value = ''
  endTimeValue.value = ''
  baseDateValue.value = ''
  baseTimeValue.value = ''
  amount.value = ''
  operation.value = 'add'
  unit.value = 'days'
  result.value = null
  error.value = null
}

/** 根据当前模式执行日期时间计算。 */
function calculate() {
  const calculation = mode.value === 'difference'
    ? calculateDateDifference(
        composeDateTimeValue(startDateValue.value, startTimeValue.value),
        composeDateTimeValue(endDateValue.value, endTimeValue.value),
      )
    : calculateDateTimeAdjustment({
        base: composeDateTimeValue(baseDateValue.value, baseTimeValue.value),
        operation: operation.value,
        amount: amount.value,
        unit: unit.value,
      })

  if (!calculation.ok) {
    error.value = calculation.error
    return
  }

  result.value = calculation.value
  error.value = null
}

/** 清空当前工具的输入、结果和错误状态。 */
function clearAll() {
  mode.value = 'difference'
  startDateValue.value = ''
  startTimeValue.value = ''
  endDateValue.value = ''
  endTimeValue.value = ''
  baseDateValue.value = ''
  baseTimeValue.value = ''
  operation.value = 'add'
  amount.value = ''
  unit.value = 'days'
  result.value = null
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split date-time-calculator-tool">
    <div class="date-time-calculator-tool__mode-tabs" role="group" aria-label="日期时间计算模式">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        class="date-time-calculator-tool__mode-tab"
        :class="{ 'date-time-calculator-tool__mode-tab--active': mode === option.value }"
        :aria-pressed="mode === option.value"
        @click="setMode(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <ToolInputPanel title="计算配置" description="输入日期；时间可选，在浏览器本地完成日期差或日期加减。">
      <template v-if="mode === 'difference'">
        <div class="tool-field-grid tool-field-grid--two date-time-calculator-tool__date-groups">
          <div class="date-time-calculator-tool__date-group">
            <label class="tool-field">
              <span class="tool-field__label">开始日期</span>
              <input
                v-model="startDateValue"
                class="tool-input date-time-calculator-tool__date-input"
                type="date"
                aria-label="开始日期"
                @input="clearCurrentError"
              >
            </label>
            <label class="tool-field">
              <span class="tool-field__label">时间（可选）</span>
              <input
                v-model="startTimeValue"
                class="tool-input date-time-calculator-tool__time-input"
                type="time"
                step="0.001"
                aria-label="开始时间（可选）"
                @input="clearCurrentError"
              >
            </label>
          </div>
          <div class="date-time-calculator-tool__date-group">
            <label class="tool-field">
              <span class="tool-field__label">结束日期</span>
              <input
                v-model="endDateValue"
                class="tool-input date-time-calculator-tool__date-input"
                type="date"
                aria-label="结束日期"
                @input="clearCurrentError"
              >
            </label>
            <label class="tool-field">
              <span class="tool-field__label">时间（可选）</span>
              <input
                v-model="endTimeValue"
                class="tool-input date-time-calculator-tool__time-input"
                type="time"
                step="0.001"
                aria-label="结束时间（可选）"
                @input="clearCurrentError"
              >
            </label>
          </div>
        </div>
        <p class="tool-note">结果按“结束时间 - 开始时间”计算；时间留空按当天 00:00:00.000 计算，结束时间早于开始时间时会保留负号。</p>
      </template>

      <template v-else>
        <div class="date-time-calculator-tool__date-group date-time-calculator-tool__date-group--single">
          <label class="tool-field">
            <span class="tool-field__label">基准日期</span>
            <input
              v-model="baseDateValue"
              class="tool-input date-time-calculator-tool__date-input"
              type="date"
              aria-label="基准日期"
              @input="clearCurrentError"
            >
          </label>
          <label class="tool-field">
            <span class="tool-field__label">时间（可选）</span>
            <input
              v-model="baseTimeValue"
              class="tool-input date-time-calculator-tool__time-input"
              type="time"
              step="0.001"
              aria-label="基准时间（可选）"
              @input="clearCurrentError"
            >
          </label>
        </div>

        <div class="tool-field-grid tool-field-grid--three">
          <label class="tool-field">
            <span class="tool-field__label">操作</span>
            <select v-model="operation" class="tool-select" aria-label="日期操作" @change="clearCurrentError">
              <option value="add">增加</option>
              <option value="subtract">减少</option>
            </select>
          </label>
          <label class="tool-field">
            <span class="tool-field__label">数值</span>
            <input
              v-model="amount"
              class="tool-input date-time-calculator-tool__amount-input"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="例如：1"
              aria-label="日期增减数值"
              @input="clearCurrentError"
            >
          </label>
          <label class="tool-field">
            <span class="tool-field__label">单位</span>
            <select v-model="unit" class="tool-select" aria-label="日期增减单位" @change="clearCurrentError">
              <option v-for="option in unitOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
        <p class="tool-note">时间留空按当天 00:00:00.000 计算；年和月按日历规则计算，月末日期会钳制到目标月份最后一天；其他结果按当前浏览器本地时区计算。</p>
      </template>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" @click="calculate">开始计算</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="resultTitle"
      :status="status"
      :error="error"
      :empty-text="emptyText"
    >
      <ErrorNotice v-if="error && result" :error="error" />
      <p v-if="resultIsStale" class="tool-note date-time-calculator-tool__stale-note">
        当前配置已改变，下面仍是上一次成功计算的结果；点击“开始计算”更新结果。
      </p>

      <template v-if="result?.mode === 'difference'">
        <div class="stat-grid stat-grid--compact date-time-calculator-tool__stats">
          <div class="stat-card"><span class="stat-card__label">总天数</span><code class="stat-card__code">{{ result.totalDays }}</code></div>
          <div class="stat-card"><span class="stat-card__label">总小时</span><code class="stat-card__code">{{ result.totalHours }}</code></div>
          <div class="stat-card"><span class="stat-card__label">总分钟</span><code class="stat-card__code">{{ result.totalMinutes }}</code></div>
          <div class="stat-card"><span class="stat-card__label">总秒数</span><code class="stat-card__code">{{ result.totalSeconds }}</code></div>
          <div class="stat-card stat-card--wide"><span class="stat-card__label">总毫秒</span><code class="stat-card__code">{{ result.totalMilliseconds }}</code></div>
        </div>
        <div class="output-block date-time-calculator-tool__breakdown">
          <span class="output-block__label">分解结果</span>
          <code class="output-block__value">{{ result.breakdown.sign }}{{ result.breakdown.days }} 天 {{ result.breakdown.hours }} 小时 {{ result.breakdown.minutes }} 分钟 {{ result.breakdown.seconds }} 秒 {{ result.breakdown.milliseconds }} 毫秒</code>
        </div>
        <p class="tool-note">{{ result.startLocal }} → {{ result.endLocal }}</p>
        <p class="tool-note">{{ result.notice }}</p>
      </template>

      <template v-else-if="result?.mode === 'add-subtract'">
        <div class="output-block output-block--prominent date-time-calculator-tool__date-output">
          <span class="output-block__label">计算结果</span>
          <code class="output-block__value">{{ result.resultLocal }}</code>
        </div>
        <p class="tool-note">{{ result.baseLocal }} · {{ result.input.operation === 'add' ? '增加' : '减少' }} {{ result.input.amount }}{{ getUnitLabel(result.input.unit) }}</p>
        <p class="tool-note">ISO 8601：{{ result.resultIso }}</p>
        <p class="tool-note">{{ result.notice }}</p>
      </template>

      <template #actions>
        <CopyButton :text="resultText" />
      </template>
    </ToolResultPanel>
  </div>
</template>
