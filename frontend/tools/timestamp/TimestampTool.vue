<script setup lang="ts">
import { computed, ref } from 'vue'
import { convertIsoToTimestamp, convertTimestamp, getCurrentTimeInput, type TimestampConversion, type TimestampUnit, type TimezoneMode } from '~/core/timestamp'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

type TimestampMode = 'timestamp-to-date' | 'date-to-timestamp'
type DateInputMode = 'picker' | 'iso'

const modeOptions: readonly { value: TimestampMode; label: string }[] = [
  { value: 'timestamp-to-date', label: '时间戳 → 日期时间' },
  { value: 'date-to-timestamp', label: '日期时间 → 时间戳' },
]

const dateInputModeOptions: readonly { value: DateInputMode; label: string }[] = [
  { value: 'picker', label: '选择时间' },
  { value: 'iso', label: 'ISO 8601 文本' },
]

const mode = ref<TimestampMode>('timestamp-to-date')
const timestampValue = ref('')
const timestampUnit = ref<TimestampUnit>('seconds')
const dateInputMode = ref<DateInputMode>('picker')
const datePickerValue = ref('')
const isoValue = ref('')
const timezoneMode = ref<TimezoneMode>('local')
const result = ref<TimestampConversion | null>(null)
const error = ref<ToolError | null>(null)

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (!result.value) {
    return 'idle'
  }

  return 'success'
})

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function formatDateTimePickerValue(date: Date, timezone: TimezoneMode): string {
  const values = timezone === 'utc'
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        second: date.getUTCSeconds(),
        millisecond: date.getUTCMilliseconds(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds(),
        millisecond: date.getMilliseconds(),
      }

  return `${pad(values.year, 4)}-${pad(values.month)}-${pad(values.day)}T${pad(values.hour)}:${pad(values.minute)}:${pad(values.second)}.${pad(values.millisecond, 3)}`
}

function normalizeDateTimePickerValue(value: string, timezone: TimezoneMode): string {
  const input = value.trim()

  if (!input) {
    return ''
  }

  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(input)

  if (hasExplicitTimezone) {
    const date = new Date(input)
    return Number.isNaN(date.getTime()) ? '' : formatDateTimePickerValue(date, timezone)
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:(?:T|\s)(\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?)?$/u.exec(input)

  if (!match) {
    return ''
  }

  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = ''] = match
  const millisecond = fraction.padEnd(3, '0').slice(0, 3)

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}`
}

const resultText = computed(() => {
  if (!result.value) {
    return ''
  }

  return [
    `秒级时间戳：${result.value.timestampSeconds}`,
    `毫秒级时间戳：${result.value.timestampMilliseconds}`,
    `本地时间：${result.value.local}`,
    `UTC：${result.value.utc}`,
    `ISO 8601：${result.value.iso}`,
  ].join('\n')
})

function clearResult() {
  result.value = null
  error.value = null
}

function setMode(nextMode: TimestampMode) {
  mode.value = nextMode
  clearResult()
}

function setDateInputMode(nextMode: DateInputMode) {
  if (dateInputMode.value === nextMode) {
    return
  }

  if (nextMode === 'iso') {
    isoValue.value = datePickerValue.value
  } else {
    const pickerValue = normalizeDateTimePickerValue(isoValue.value, timezoneMode.value)

    if (pickerValue) {
      datePickerValue.value = pickerValue
    }
  }

  dateInputMode.value = nextMode
  clearResult()
}

function convert() {
  const conversion = mode.value === 'timestamp-to-date'
    ? convertTimestamp(timestampValue.value, timestampUnit.value)
    : convertIsoToTimestamp(
        dateInputMode.value === 'picker' ? datePickerValue.value : isoValue.value,
        timezoneMode.value,
      )

  if (!conversion.ok) {
    result.value = null
    error.value = conversion.error
    return
  }

  result.value = conversion.value
  error.value = null
}

function fillCurrentTime() {
  if (mode.value === 'timestamp-to-date') {
    const milliseconds = Date.now()
    timestampValue.value = timestampUnit.value === 'seconds'
      ? String(Math.trunc(milliseconds / 1000))
      : String(milliseconds)
  } else if (dateInputMode.value === 'picker') {
    datePickerValue.value = formatDateTimePickerValue(new Date(), timezoneMode.value)
  } else {
    isoValue.value = getCurrentTimeInput(timezoneMode.value)
  }

  convert()
}

function handleClear() {
  timestampValue.value = ''
  datePickerValue.value = ''
  isoValue.value = ''
  clearResult()
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split timestamp-tool">
    <div class="timestamp-tool__mode-tabs" role="group" aria-label="时间戳转换方向">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        class="timestamp-tool__mode-tab"
        :class="{ 'timestamp-tool__mode-tab--active': mode === option.value }"
        :aria-pressed="mode === option.value"
        @click="setMode(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <ToolInputPanel title="时间输入" description="支持秒/毫秒时间戳和 ISO 8601 日期时间，转换在本地完成。">
      <div v-if="mode === 'timestamp-to-date'" class="tool-field-grid tool-field-grid--two timestamp-tool__top-options">
        <label class="tool-field">
          <span class="tool-field__label">时间戳单位</span>
          <select v-model="timestampUnit" class="tool-select" aria-label="时间戳单位" @change="clearResult">
            <option value="seconds">秒</option>
            <option value="milliseconds">毫秒</option>
          </select>
        </label>
        <div class="timestamp-tool__shortcut-field">
          <span class="tool-field__label">快捷操作</span>
          <button type="button" class="button button--secondary timestamp-tool__shortcut" @click="fillCurrentTime">使用当前时间</button>
        </div>
      </div>

      <div v-else class="tool-field-grid tool-field-grid--two timestamp-tool__top-options">
        <label class="tool-field">
          <span class="tool-field__label">无时区输入解释</span>
          <select v-model="timezoneMode" class="tool-select" aria-label="无时区输入解释" @change="clearResult">
            <option value="local">本地时间</option>
            <option value="utc">UTC</option>
          </select>
        </label>
        <div class="timestamp-tool__input-mode-field">
          <span class="tool-field__label">日期输入方式</span>
          <div class="timestamp-tool__input-modes" role="group" aria-label="日期输入方式">
            <button
              v-for="option in dateInputModeOptions"
              :key="option.value"
              type="button"
              class="timestamp-tool__input-mode"
              :class="{ 'timestamp-tool__input-mode--active': dateInputMode === option.value }"
              :aria-pressed="dateInputMode === option.value"
              @click="setDateInputMode(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>

      <label v-if="mode === 'timestamp-to-date'" class="tool-field">
        <span class="tool-field__label">时间戳</span>
        <input v-model="timestampValue" class="tool-input" inputmode="numeric" placeholder="例如：1711929600" aria-label="时间戳输入">
      </label>
      <template v-else>
        <label class="tool-field">
          <span class="tool-field__label">{{ dateInputMode === 'picker' ? '选择日期和时间' : 'ISO 8601 日期时间' }}</span>
          <input
            v-if="dateInputMode === 'picker'"
            v-model="datePickerValue"
            class="tool-input timestamp-tool__date-picker"
            type="datetime-local"
            step="0.001"
            aria-label="选择日期和时间"
          >
          <input
            v-else
            v-model="isoValue"
            class="tool-input"
            placeholder="例如：2024-01-01T08:00:00+08:00"
            aria-label="ISO 8601 日期时间输入"
          >
        </label>
        <p v-if="dateInputMode === 'picker'" class="timestamp-tool__input-note">选择器输入不带时区，将按上方的本地时间/UTC选项解释。</p>
      </template>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" @click="convert">开始转换</button>
        <ClearButton :disabled="!timestampValue && !datePickerValue && !isoValue && !result" @clear="handleClear" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel title="转换结果" :status="status" :error="error" empty-text="输入时间戳或 ISO 8601 日期时间后，转换结果会显示在这里。">
      <div class="stat-grid stat-grid--compact">
        <div class="stat-card"><span class="stat-card__label">秒级时间戳</span><code class="stat-card__code">{{ result?.timestampSeconds }}</code></div>
        <div class="stat-card"><span class="stat-card__label">毫秒级时间戳</span><code class="stat-card__code">{{ result?.timestampMilliseconds }}</code></div>
        <div class="stat-card"><span class="stat-card__label">本地时间</span><code class="stat-card__code">{{ result?.local }}</code></div>
        <div class="stat-card"><span class="stat-card__label">UTC</span><code class="stat-card__code">{{ result?.utc }}</code></div>
        <div class="stat-card stat-card--wide"><span class="stat-card__label">ISO 8601</span><code class="stat-card__code">{{ result?.iso }}</code></div>
      </div>
      <p v-if="result?.notice" class="tool-note">{{ result.notice }}</p>
      <template #actions>
        <CopyButton :text="resultText" />
      </template>
    </ToolResultPanel>

  </div>
</template>
