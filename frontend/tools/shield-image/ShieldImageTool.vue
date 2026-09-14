<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  createShieldDownloadFileName,
  downloadShieldPng,
  downloadShieldSvg,
  type ShieldExportFormat,
} from '~/adapters/shield-image'
import {
  DEFAULT_SHIELD_LEFT_COLOR,
  DEFAULT_SHIELD_RIGHT_COLOR,
  SHIELD_TEXT_MAX_LENGTH,
  generateShieldImage,
  type ShieldImageValue,
} from '~/core/shield-image'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const leftText = ref('')
const rightText = ref('')
const leftColor = ref(DEFAULT_SHIELD_LEFT_COLOR)
const rightColor = ref(DEFAULT_SHIELD_RIGHT_COLOR)
const result = ref<ShieldImageValue | null>(null)
const error = ref<ToolError | null>(null)
const exportNotice = ref('')
const isGenerating = ref(false)
const exportingFormat = ref<ShieldExportFormat | null>(null)

const status = computed<ToolUiStatus>(() => {
  if (isGenerating.value) {
    return 'processing'
  }

  if (error.value) {
    return 'error'
  }

  return result.value ? 'success' : 'idle'
})

const leftTextLength = computed(() => Array.from(leftText.value).length)
const rightTextLength = computed(() => Array.from(rightText.value).length)
const hasPendingChanges = computed(() => Boolean(
  result.value && (
    result.value.leftText !== leftText.value.trim()
    || result.value.rightText !== rightText.value.trim()
    || result.value.leftColor !== normalizeColorForComparison(leftColor.value)
    || result.value.rightColor !== normalizeColorForComparison(rightColor.value)
  ),
))
const resultStateLabel = computed(() => {
  if (isGenerating.value) {
    return '正在生成新预览'
  }

  return error.value || hasPendingChanges.value ? '上一次成功结果' : '当前 Shield 预览'
})
const hasResettableState = computed(() => Boolean(
  leftText.value
  || rightText.value
  || leftColor.value !== DEFAULT_SHIELD_LEFT_COLOR
  || rightColor.value !== DEFAULT_SHIELD_RIGHT_COLOR
  || result.value
  || error.value
  || exportNotice.value,
))

/** 将颜色输入规范化为用于比较当前配置的值。 */
function normalizeColorForComparison(value: string): string {
  const normalized = value.trim().toLowerCase()

  if (/^#[\da-f]{3}$/iu.test(normalized)) {
    return `#${normalized.slice(1).split('').map((character) => character.repeat(2)).join('')}`
  }

  return normalized
}

/** 按当前双区域配置生成 Shield SVG 预览。 */
function generate() {
  if (isGenerating.value) {
    return
  }

  isGenerating.value = true
  error.value = null
  exportNotice.value = ''

  const generated = generateShieldImage({
    leftText: leftText.value,
    rightText: rightText.value,
    leftColor: leftColor.value,
    rightColor: rightColor.value,
  })

  if (!generated.ok) {
    error.value = generated.error
    isGenerating.value = false
    return
  }

  result.value = generated.value
  isGenerating.value = false
}

/** 将上一次成功生成的 Shield SVG 下载到本地。 */
function downloadSvg() {
  if (!result.value || isGenerating.value || exportingFormat.value) {
    return
  }

  exportNotice.value = ''
  exportingFormat.value = 'svg'
  const downloadResult = downloadShieldSvg(
    result.value.svg,
    createShieldDownloadFileName('svg'),
  )
  exportNotice.value = downloadResult.message
  exportingFormat.value = null
}

/** 将上一次成功生成的 Shield SVG 转为 PNG 并下载到本地。 */
async function downloadPng() {
  if (!result.value || isGenerating.value || exportingFormat.value) {
    return
  }

  exportNotice.value = ''
  exportingFormat.value = 'png'
  const downloadResult = await downloadShieldPng(
    result.value.svg,
    result.value.width,
    result.value.height,
    createShieldDownloadFileName('png'),
  )
  exportNotice.value = downloadResult.message
  exportingFormat.value = null
}

/** 清空 Shield 输入、结果、错误和导出反馈，并恢复默认颜色。 */
function clearAll() {
  leftText.value = ''
  rightText.value = ''
  leftColor.value = DEFAULT_SHIELD_LEFT_COLOR
  rightColor.value = DEFAULT_SHIELD_RIGHT_COLOR
  result.value = null
  error.value = null
  exportNotice.value = ''
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split shield-image-tool">
    <ToolInputPanel title="生成 Shield" description="输入两侧文字和背景色，在浏览器本地生成 Shield 图片，不会上传或保存内容。">
      <div class="tool-field-grid tool-field-grid--two shield-image-tool__text-fields">
        <label class="tool-field">
          <span class="tool-field__label">左侧文字</span>
          <input
            v-model="leftText"
            class="tool-input"
            type="text"
            autocomplete="off"
            aria-label="Shield 左侧文字"
            aria-describedby="shield-left-text-note"
            placeholder="例如：build"
          >
          <span id="shield-left-text-note" class="shield-image-tool__input-meta">
            {{ leftTextLength }} / {{ SHIELD_TEXT_MAX_LENGTH }} 个 Unicode 字符
          </span>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">右侧文字</span>
          <input
            v-model="rightText"
            class="tool-input"
            type="text"
            autocomplete="off"
            aria-label="Shield 右侧文字"
            aria-describedby="shield-right-text-note"
            placeholder="例如：passing"
          >
          <span id="shield-right-text-note" class="shield-image-tool__input-meta">
            {{ rightTextLength }} / {{ SHIELD_TEXT_MAX_LENGTH }} 个 Unicode 字符
          </span>
        </label>
      </div>

      <div class="tool-field-grid tool-field-grid--two shield-image-tool__color-fields">
        <label class="tool-field">
          <span class="tool-field__label">左侧背景色</span>
          <input
            v-model="leftColor"
            class="tool-input shield-image-tool__color-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            aria-label="Shield 左侧背景色"
            placeholder="#555555"
          >
        </label>

        <label class="tool-field">
          <span class="tool-field__label">右侧背景色</span>
          <input
            v-model="rightColor"
            class="tool-input shield-image-tool__color-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            aria-label="Shield 右侧背景色"
            placeholder="#4c1"
          >
        </label>
      </div>

      <p class="tool-note shield-image-tool__fixed-note">
        固定扁平样式 · 支持 #RGB 或 #RRGGBB · SVG 预览与 PNG 导出
      </p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isGenerating" @click="generate">
          {{ isGenerating ? '生成中…' : '生成 Shield' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="Shield 预览"
      :status="status"
      :error="error"
      :show-content-on-processing="Boolean(result)"
      :preserve-content-on-error="true"
      empty-text="输入左右文字和背景色后点击“生成 Shield”，预览会显示在这里。"
    >
      <div v-if="result" class="shield-image-tool__result">
        <p class="shield-image-tool__result-label">{{ resultStateLabel }}</p>
        <div class="shield-image-tool__preview">
          <img :src="result.previewSource" alt="已生成 Shield 预览">
        </div>
        <dl class="shield-image-tool__meta">
          <div>
            <dt>左侧文字</dt>
            <dd>{{ result.leftText }}</dd>
          </div>
          <div>
            <dt>右侧文字</dt>
            <dd>{{ result.rightText }}</dd>
          </div>
          <div>
            <dt>图片尺寸</dt>
            <dd>{{ result.width }} × {{ result.height }} px</dd>
          </div>
          <div>
            <dt>背景色</dt>
            <dd>{{ result.leftColor }} / {{ result.rightColor }}</dd>
          </div>
        </dl>
        <p v-if="error" class="tool-note shield-image-tool__stale-note" role="status">
          当前配置生成失败，以上为上一次成功生成的结果。
        </p>
        <p v-else-if="hasPendingChanges" class="tool-note shield-image-tool__stale-note" role="status">
          当前配置已修改，请重新生成 Shield。
        </p>
      </div>
      <p v-if="exportNotice" class="tool-note" role="status">{{ exportNotice }}</p>

      <template #actions>
        <CopyButton
          :text="result?.svg ?? ''"
          label="复制 SVG"
          :disabled="!result || isGenerating || Boolean(exportingFormat)"
        />
        <button
          type="button"
          class="button button--secondary"
          :disabled="!result || isGenerating || Boolean(exportingFormat)"
          @click="downloadSvg"
        >
          {{ exportingFormat === 'svg' ? '导出中…' : '导出 SVG' }}
        </button>
        <button
          type="button"
          class="button button--secondary"
          :disabled="!result || isGenerating || Boolean(exportingFormat)"
          @click="downloadPng"
        >
          {{ exportingFormat === 'png' ? '导出中…' : '导出 PNG' }}
        </button>
      </template>
    </ToolResultPanel>
  </div>
</template>
