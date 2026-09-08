<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  convertUnit,
  getUnitCategory,
  UNIT_CATEGORIES,
  type UnitCategory,
  type UnitDefinition,
  type UnitKey,
} from '~/core/unit-converter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

interface ConversionRecord {
  category: UnitCategory
  categoryLabel: string
  input: string
  fromUnit: UnitKey
  fromLabel: string
  fromSymbol: string
  toUnit: UnitKey
  toLabel: string
  toSymbol: string
}

const category = ref<UnitCategory>('length')
const input = ref('')
const fromUnit = ref<UnitKey>('meter')
const toUnit = ref<UnitKey>('foot')
const output = ref('')
const outputRecord = ref<ConversionRecord | null>(null)
const error = ref<ToolError | null>(null)
const isProcessing = ref(false)

const currentCategory = computed(() => getUnitCategory(category.value) ?? UNIT_CATEGORIES[0])
const currentFromUnit = computed(() => getSelectedUnit(fromUnit.value))
const currentToUnit = computed(() => getSelectedUnit(toUnit.value))

const currentConfigurationLabel = computed(() => formatConfiguration({
  categoryLabel: currentCategory.value.label,
  fromLabel: currentFromUnit.value.label,
  fromSymbol: currentFromUnit.value.symbol,
  toLabel: currentToUnit.value.label,
  toSymbol: currentToUnit.value.symbol,
}))

const outputConfigurationLabel = computed(() => outputRecord.value
  ? formatConfiguration(outputRecord.value)
  : currentConfigurationLabel.value)

const hasConfigurationChanged = computed(() => Boolean(
  outputRecord.value
  && (
    outputRecord.value.category !== category.value
    || outputRecord.value.input !== input.value
    || outputRecord.value.fromUnit !== fromUnit.value
    || outputRecord.value.toUnit !== toUnit.value
  ),
))

const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '输入数值并选择单位，点击“开始换算”后结果会显示在这里。')

const status = computed<ToolUiStatus>(() => {
  if (isProcessing.value) {
    return 'processing'
  }

  if (error.value?.code === 'empty-input') {
    return 'idle'
  }

  if (error.value) {
    return 'error'
  }

  return output.value ? 'success' : 'idle'
})

const hasResettableState = computed(() => Boolean(
  input.value
  || output.value
  || error.value
  || category.value !== 'length'
  || fromUnit.value !== 'meter'
  || toUnit.value !== 'foot',
))

/** 获取当前类别中选中的单位定义。 */
function getSelectedUnit(unit: UnitKey): UnitDefinition {
  return currentCategory.value.units.find((definition) => definition.key === unit)
    ?? currentCategory.value.units[0]!
}

/** 将单位换算配置格式化为展示文本。 */
function formatConfiguration(configuration: {
  categoryLabel: string
  fromLabel: string
  fromSymbol: string
  toLabel: string
  toSymbol: string
}): string {
  return `${configuration.categoryLabel} · ${configuration.fromLabel} (${configuration.fromSymbol}) → ${configuration.toLabel} (${configuration.toSymbol})`
}

/** 处理单位类别变化并同步默认单位。 */
function handleCategoryChange() {
  const nextCategory = currentCategory.value
  fromUnit.value = nextCategory.defaultFrom
  toUnit.value = nextCategory.defaultTo
  input.value = ''
  error.value = null
}

/** 清除当前输入变化对应的错误状态。 */
function clearCurrentError() {
  error.value = null
}

/** 执行当前工具配置的转换操作。 */
function runConversion() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true

  try {
    const result = convertUnit({
      category: category.value,
      value: input.value,
      fromUnit: fromUnit.value,
      toUnit: toUnit.value,
    })

    if (!result.ok) {
      error.value = result.error
      return
    }

    output.value = result.value
    outputRecord.value = {
      category: category.value,
      categoryLabel: currentCategory.value.label,
      input: input.value,
      fromUnit: fromUnit.value,
      fromLabel: currentFromUnit.value.label,
      fromSymbol: currentFromUnit.value.symbol,
      toUnit: toUnit.value,
      toLabel: currentToUnit.value.label,
      toSymbol: currentToUnit.value.symbol,
    }
    error.value = null
  } finally {
    isProcessing.value = false
  }
}

/** 清空当前工具的输入、结果和错误状态。 */
function clearAll() {
  category.value = 'length'
  input.value = ''
  fromUnit.value = 'meter'
  toUnit.value = 'foot'
  output.value = ''
  outputRecord.value = null
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split unit-converter-tool">
    <ToolInputPanel title="换算配置" description="选择类别和单位，在浏览器本地完成数值换算。">
      <label class="tool-field">
        <span class="tool-field__label">换算类别</span>
        <select v-model="category" class="tool-select" aria-label="换算类别" @change="handleCategoryChange">
          <option v-for="option in UNIT_CATEGORIES" :key="option.key" :value="option.key">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="tool-field">
        <span class="tool-field__label">数值</span>
        <input
          v-model="input"
          class="tool-input unit-converter-tool__input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="例如：1.5"
          aria-label="待换算数值"
        >
      </label>

      <div class="tool-field-grid tool-field-grid--two">
        <label class="tool-field">
          <span class="tool-field__label">源单位</span>
          <select v-model="fromUnit" class="tool-select" aria-label="源单位" @change="clearCurrentError">
            <option v-for="unit in currentCategory.units" :key="unit.key" :value="unit.key">
              {{ unit.label }}（{{ unit.symbol }}）
            </option>
          </select>
        </label>
        <label class="tool-field">
          <span class="tool-field__label">目标单位</span>
          <select v-model="toUnit" class="tool-select" aria-label="目标单位" @change="clearCurrentError">
            <option v-for="unit in currentCategory.units" :key="unit.key" :value="unit.key">
              {{ unit.label }}（{{ unit.symbol }}）
            </option>
          </select>
        </label>
      </div>

      <p class="tool-note">支持十进制数值；不接受逗号、指数、单位后缀或表达式。温度允许负数，其他类别只接受零或正数。</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="runConversion">开始换算</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="`${outputConfigurationLabel}结果`"
      :status="status"
      :error="error"
      :empty-text="emptyText"
    >
      <p v-if="hasConfigurationChanged" class="tool-note unit-converter-tool__stale-note">
        当前配置已改变，下面仍是上一次成功换算的结果；点击“开始换算”更新结果。
      </p>
      <div class="output-block output-block--prominent unit-converter-tool__output">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <template #actions>
        <CopyButton :text="output" />
      </template>
    </ToolResultPanel>

    <section v-if="error && output && outputRecord" class="tool-panel unit-converter-tool__preserved-result" aria-label="上一次成功结果">
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留</span>
      </header>
      <p class="tool-note">本次{{ currentConfigurationLabel }}失败，下面仍是上一次{{ outputConfigurationLabel }}结果，不代表当前输入已经换算成功。</p>
      <div class="output-block unit-converter-tool__output unit-converter-tool__output--preserved">
        <code class="output-block__value">{{ output }}</code>
      </div>
      <div class="tool-panel__actions">
        <CopyButton :text="output" />
      </div>
    </section>
  </div>
</template>
