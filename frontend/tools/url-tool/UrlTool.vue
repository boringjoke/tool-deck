<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  decodeUrl,
  encodeUrl,
  generateWhereIn,
  parseAbsoluteUrl,
  rebuildUrl,
  type ParsedUrl,
  type UrlEncodingMode,
  type UrlQueryParameter,
} from '~/core/url-tool'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

type UrlMode = 'parse' | 'encode' | 'decode'

const modeOptions: readonly { value: UrlMode; label: string }[] = [
  { value: 'parse', label: '解析与参数编辑' },
  { value: 'encode', label: 'URL 编码' },
  { value: 'decode', label: 'URL 解码' },
]

const mode = ref<UrlMode>('parse')
const encodingMode = ref<UrlEncodingMode>('component')
const input = ref('')
const parsed = ref<ParsedUrl | null>(null)
const parameters = ref<UrlQueryParameter[]>([])
const parseError = ref<ToolError | null>(null)
const encodingError = ref<ToolError | null>(null)
const encodedResult = ref('')
const rebuiltUrl = ref('')
const sqlResult = ref('')

const error = computed(() => mode.value === 'parse' ? parseError.value : encodingError.value)
const status = computed<ToolUiStatus>(() => {
  if (!input.value.trim()) {
    return 'idle'
  }

  if (error.value) {
    return 'error'
  }

  if (mode.value === 'parse') {
    return parsed.value ? 'success' : 'idle'
  }

  return encodedResult.value ? 'success' : 'idle'
})

function parseInput() {
  rebuiltUrl.value = ''
  sqlResult.value = ''

  if (!input.value.trim()) {
    parsed.value = null
    parameters.value = []
    parseError.value = null
    return
  }

  const result = parseAbsoluteUrl(input.value)

  if (!result.ok) {
    parsed.value = null
    parameters.value = []
    parseError.value = result.error
    return
  }

  parsed.value = result.value
  parameters.value = result.value.parameters.map((parameter) => ({ ...parameter }))
  parseError.value = null
}

watch(mode, () => {
  parsed.value = null
  parameters.value = []
  parseError.value = null
  encodingError.value = null
  encodedResult.value = ''
  rebuiltUrl.value = ''
  sqlResult.value = ''

  if (mode.value === 'parse') {
    parseInput()
  }
})

watch(input, () => {
  if (mode.value === 'parse') {
    parseInput()
  } else {
    encodingError.value = null
    encodedResult.value = ''
  }
})

function runEncoding() {
  const result = mode.value === 'encode'
    ? encodeUrl(input.value, encodingMode.value)
    : decodeUrl(input.value, encodingMode.value)

  if (!result.ok) {
    encodedResult.value = ''
    encodingError.value = result.error
    return
  }

  encodedResult.value = result.value
  encodingError.value = null
}

function addParameter() {
  parameters.value = [
    ...parameters.value,
    { key: '', value: '', hasEquals: true },
  ]
  rebuiltUrl.value = ''
  sqlResult.value = ''
}

function removeParameter(index: number) {
  parameters.value = parameters.value.filter((_, parameterIndex) => parameterIndex !== index)
  rebuiltUrl.value = ''
  sqlResult.value = ''
}

function invalidateDerivedResults() {
  rebuiltUrl.value = ''
  sqlResult.value = ''
}

function rebuildCurrentUrl() {
  if (!parsed.value) {
    return
  }

  const result = rebuildUrl(parsed.value, parameters.value)

  if (!result.ok) {
    parseError.value = result.error
    return
  }

  rebuiltUrl.value = result.value
  parseError.value = null
}

function buildSql() {
  const result = generateWhereIn(parameters.value)

  if (!result.ok) {
    parseError.value = result.error
    sqlResult.value = ''
    return
  }

  sqlResult.value = result.value
  parseError.value = null
}

function clearInput() {
  input.value = ''
  parsed.value = null
  parameters.value = []
  parseError.value = null
  encodingError.value = null
  encodedResult.value = ''
  rebuiltUrl.value = ''
  sqlResult.value = ''
}

const parseDetails = computed(() => {
  if (!parsed.value) {
    return []
  }

  return [
    { label: 'Origin', value: parsed.value.origin || '（无）' },
    { label: 'Path', value: parsed.value.pathname || '/' },
    { label: '协议', value: parsed.value.protocol },
    { label: '主机', value: parsed.value.host || '（无）' },
    { label: '查询字符串', value: parsed.value.queryString || '（无）' },
    { label: 'Fragment', value: parsed.value.hash || '（无）' },
  ]
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split url-tool">
    <div class="url-tool__mode-tabs" role="group" aria-label="URL 操作模式">
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        class="url-tool__mode-tab"
        :class="{ 'url-tool__mode-tab--active': mode === option.value }"
        :aria-pressed="mode === option.value"
        @click="mode = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <ToolInputPanel title="URL 输入" description="解析、编辑或进行 URL 编码和解码，所有操作均在浏览器本地完成。">
      <label v-if="mode !== 'parse'" class="tool-field">
        <span class="tool-field__label">编码语义</span>
        <select v-model="encodingMode" class="tool-select" aria-label="URL 编码语义">
          <option value="component">URL 组件</option>
          <option value="full">完整 URL</option>
        </select>
      </label>

      <label class="tool-field">
        <span class="tool-field__label">{{ mode === 'parse' ? '完整绝对 URL' : mode === 'encode' ? '待编码内容' : '待解码内容' }}</span>
        <textarea
          v-model="input"
          class="tool-textarea"
          rows="5"
          :placeholder="mode === 'parse' ? '例如：https://example.com/search?a=1&a=2#result' : '请输入文本…'"
          aria-label="URL 输入内容"
        />
      </label>

      <div class="tool-panel__actions">
        <button v-if="mode !== 'parse'" type="button" class="button button--primary" @click="runEncoding">
          {{ mode === 'encode' ? '开始编码' : '开始解码' }}
        </button>
        <ClearButton :disabled="!input && !encodedResult && !rebuiltUrl && !sqlResult" @clear="clearInput" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="mode === 'parse' ? 'URL 解析结果' : mode === 'encode' ? 'URL 编码结果' : 'URL 解码结果'"
      :status="status"
      :error="error"
      :empty-text="mode === 'parse' ? '输入完整 URL 后，会自动拆分 Origin、Path 和查询参数。' : '输入内容并执行操作后，结果会显示在这里。'"
    >
      <template v-if="mode === 'parse' && parsed">
        <div class="url-detail-grid">
          <div v-for="detail in parseDetails" :key="detail.label" class="detail-card">
            <span class="detail-card__label">{{ detail.label }}</span>
            <code class="detail-card__value">{{ detail.value }}</code>
          </div>
        </div>

        <div class="tool-subsection">
          <div class="tool-subsection__header">
            <div>
              <h3 class="tool-subsection__title">查询参数</h3>
              <p class="tool-subsection__hint">重复键保留为多行，空值和原始顺序不会被静默丢弃。</p>
            </div>
            <button type="button" class="button button--secondary button--small" @click="addParameter">增加参数</button>
          </div>

          <div v-if="parameters.length" class="parameter-table-wrap">
            <table class="parameter-table">
              <thead>
                <tr><th scope="col">#</th><th scope="col">键</th><th scope="col">值</th><th scope="col">等号</th><th scope="col">操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="(parameter, index) in parameters" :key="index">
                  <td class="parameter-table__index">{{ index + 1 }}</td>
                  <td><input v-model="parameter.key" class="tool-input" :aria-label="`第 ${index + 1} 行参数名`" @input="invalidateDerivedResults"></td>
                  <td><input v-model="parameter.value" class="tool-input" :aria-label="`第 ${index + 1} 行参数值`" @input="invalidateDerivedResults"></td>
                  <td><input v-model="parameter.hasEquals" type="checkbox" :aria-label="`第 ${index + 1} 行保留等号`" @change="invalidateDerivedResults"></td>
                  <td><button type="button" class="text-button text-button--danger" @click="removeParameter(index)">删除</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="tool-state tool-state--empty">当前 URL 没有查询参数，可以点击“增加参数”。</p>
        </div>

        <div class="tool-panel__actions">
          <button type="button" class="button button--primary" @click="rebuildCurrentUrl">重建完整 URL</button>
          <button type="button" class="button button--secondary" @click="buildSql">生成 SQL WHERE IN</button>
        </div>

        <div v-if="rebuiltUrl" class="output-block">
          <span class="output-block__label">完整 URL</span>
          <code class="output-block__value">{{ rebuiltUrl }}</code>
          <CopyButton :text="rebuiltUrl" label="复制完整 URL" />
        </div>
        <div v-if="sqlResult" class="output-block">
          <span class="output-block__label">SQL WHERE IN</span>
          <code class="output-block__value output-block__value--multiline">{{ sqlResult }}</code>
          <CopyButton :text="sqlResult" label="复制 SQL" />
        </div>
      </template>

      <template v-else>
        <div class="output-block">
          <code class="output-block__value output-block__value--multiline">{{ encodedResult }}</code>
          <CopyButton :text="encodedResult" label="复制结果" />
        </div>
      </template>
    </ToolResultPanel>

  </div>
</template>
