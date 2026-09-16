<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  convertCoordinate,
  COORDINATE_SYSTEMS,
  getCoordinateSystemLabel,
  type CoordinateConversionValue,
  type CoordinateSystem,
} from '~/core/coordinate-converter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

interface ConversionRecord {
  latitude: string
  longitude: string
  source: CoordinateSystem
  target: CoordinateSystem
}

const source = ref<CoordinateSystem>('wgs84')
const target = ref<CoordinateSystem>('gcj02')
const latitude = ref('')
const longitude = ref('')
const output = ref<CoordinateConversionValue | null>(null)
const outputRecord = ref<ConversionRecord | null>(null)
const error = ref<ToolError | null>(null)
const isProcessing = ref(false)

const conversionLabel = computed(() => `${getCoordinateSystemLabel(source.value)} → ${getCoordinateSystemLabel(target.value)}`)
const outputConversionLabel = computed(() => output.value
  ? `${getCoordinateSystemLabel(output.value.source)} → ${getCoordinateSystemLabel(output.value.target)}`
  : conversionLabel.value)

const hasConfigurationChanged = computed(() => Boolean(
  outputRecord.value
  && (
    outputRecord.value.latitude !== latitude.value
    || outputRecord.value.longitude !== longitude.value
    || outputRecord.value.source !== source.value
    || outputRecord.value.target !== target.value
  ),
))

const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '填写纬度和经度，选择源/目标坐标系后点击“开始转换”。')

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
  latitude.value
  || longitude.value
  || output.value
  || error.value
  || source.value !== 'wgs84'
  || target.value !== 'gcj02',
))

/** 清除当前输入变化对应的错误状态，保留上一次成功结果供用户对照。 */
function clearCurrentError() {
  error.value = null
}

/** 交换源坐标系和目标坐标系，不自动执行新的转换。 */
function swapSystems() {
  const currentSource = source.value
  source.value = target.value
  target.value = currentSource
  clearCurrentError()
}

/** 执行当前坐标配置的转换操作。 */
function runConversion() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true

  try {
    const result = convertCoordinate({
      latitude: latitude.value,
      longitude: longitude.value,
      source: source.value,
      target: target.value,
    })

    if (!result.ok) {
      error.value = result.error
      return
    }

    output.value = result.value
    outputRecord.value = {
      latitude: latitude.value,
      longitude: longitude.value,
      source: source.value,
      target: target.value,
    }
    error.value = null
  } finally {
    isProcessing.value = false
  }
}

/** 清空当前工具的输入、结果和错误状态。 */
function clearAll() {
  source.value = 'wgs84'
  target.value = 'gcj02'
  latitude.value = ''
  longitude.value = ''
  output.value = null
  outputRecord.value = null
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split coordinate-converter-tool">
    <ToolInputPanel title="转换配置" description="选择坐标系并输入一个经纬度点，在浏览器本地完成近似转换。">
      <div class="tool-field-grid tool-field-grid--two">
        <label class="tool-field">
          <span class="tool-field__label">源坐标系</span>
          <select v-model="source" class="tool-select" aria-label="源坐标系" @change="clearCurrentError">
            <option v-for="system in COORDINATE_SYSTEMS" :key="system.key" :value="system.key">
              {{ system.label }}
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">目标坐标系</span>
          <select v-model="target" class="tool-select" aria-label="目标坐标系" @change="clearCurrentError">
            <option v-for="system in COORDINATE_SYSTEMS" :key="system.key" :value="system.key">
              {{ system.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="coordinate-converter-tool__swap-row">
        <button
          type="button"
          class="button button--secondary coordinate-converter-tool__swap-button"
          aria-label="交换源坐标系和目标坐标系"
          :disabled="isProcessing"
          @click="swapSystems"
        >
          <span class="coordinate-converter-tool__swap-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path d="M3 6h13m0 0-3-3m3 3-3 3M17 14H4m0 0 3-3m-3 3 3 3" />
            </svg>
          </span>
          <span>交换</span>
        </button>
      </div>

      <div class="tool-field-grid tool-field-grid--two coordinate-converter-tool__coordinates">
        <label class="tool-field">
          <span class="tool-field__label">纬度</span>
          <input
            v-model="latitude"
            class="tool-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="例如：39.915"
            aria-label="纬度"
            @input="clearCurrentError"
          >
        </label>

        <label class="tool-field">
          <span class="tool-field__label">经度</span>
          <input
            v-model="longitude"
            class="tool-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="例如：116.404"
            aria-label="经度"
            @input="clearCurrentError"
          >
        </label>
      </div>

      <p class="tool-note">仅接受十进制度数，不接受逗号、指数或单位；结果默认显示 6 位小数。</p>
      <p class="tool-note">涉及 GCJ-02 或 BD-09 时，参考公式适用范围为纬度 3.86–53.55、经度 73.66–135.05。</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="runConversion">
          开始转换
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="`${outputConversionLabel}结果`"
      :status="status"
      :error="error"
      :empty-text="emptyText"
    >
      <p v-if="hasConfigurationChanged && output" class="tool-note coordinate-converter-tool__stale-note">
        当前输入或转换方向已改变，下面仍是上一次成功转换的结果；点击“开始转换”更新结果。
      </p>

      <div v-if="output" class="output-block coordinate-converter-tool__output">
        <div class="coordinate-converter-tool__result-grid">
          <div class="coordinate-converter-tool__result-item">
            <span class="output-block__label">纬度</span>
            <code class="output-block__value">{{ output.latitudeText }}</code>
          </div>
          <div class="coordinate-converter-tool__result-item">
            <span class="output-block__label">经度</span>
            <code class="output-block__value">{{ output.longitudeText }}</code>
          </div>
        </div>
        <p class="tool-note">{{ outputConversionLabel }} · 默认显示 6 位小数，结果仅供近似数据整理。</p>
      </div>

      <template #actions>
        <CopyButton :text="output?.copyText ?? ''" />
      </template>
    </ToolResultPanel>

    <section
      v-if="error && output && outputRecord"
      class="tool-panel coordinate-converter-tool__preserved-result"
      aria-label="上一次成功结果"
    >
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留</span>
      </header>
      <p class="tool-note">
        本次{{ conversionLabel }}转换失败，下面仍是上一次{{ outputConversionLabel }}结果，不代表当前输入已经转换成功。
      </p>
      <div class="output-block coordinate-converter-tool__output coordinate-converter-tool__output--preserved">
        <div class="coordinate-converter-tool__result-grid">
          <div class="coordinate-converter-tool__result-item">
            <span class="output-block__label">纬度</span>
            <code class="output-block__value">{{ output.latitudeText }}</code>
          </div>
          <div class="coordinate-converter-tool__result-item">
            <span class="output-block__label">经度</span>
            <code class="output-block__value">{{ output.longitudeText }}</code>
          </div>
        </div>
      </div>
      <div class="tool-panel__actions">
        <CopyButton :text="output.copyText" />
      </div>
    </section>
  </div>
</template>
