<script setup lang="ts">
import { computed, ref } from 'vue'
import { createDownloadFileName, downloadText } from '~/adapters/download'
import { generateJsonToSql } from '~/core/json-to-sql'
import { getJsonErrorLocation, type JsonErrorLocation } from '~/core/json-formatter'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

type JsonToSqlErrorTarget = 'table' | 'json'

const tableName = ref('')
const input = ref('')
const output = ref('')
const rowCount = ref(0)
const error = ref<ToolError | null>(null)
const errorTarget = ref<JsonToSqlErrorTarget | null>(null)
const errorInput = ref('')
const inputEditor = ref<HTMLTextAreaElement | null>(null)
const editorScrollTop = ref(0)
const editorScrollLeft = ref(0)
const downloadNotice = ref('')
const isProcessing = ref(false)

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

const resultTitle = computed(() => output.value ? `SQL 结果 · ${rowCount.value} 行` : 'SQL 结果')
const emptyText = computed(() => error.value?.code === 'empty-input'
  ? error.value.message
  : '输入表名和扁平 JSON 对象数组后点击“生成 SQL”，结果会显示在这里。')
const tableNameError = computed(() => errorTarget.value === 'table' ? error.value : null)
const jsonInputError = computed(() => (
  errorTarget.value === 'json' && error.value?.code !== 'empty-input'
    ? error.value
    : null
))
const errorLocation = computed<JsonErrorLocation | null>(() => {
  if (!jsonInputError.value || !errorInput.value) {
    return null
  }

  return getJsonErrorLocation(jsonInputError.value.message, errorInput.value)
})
const inputLines = computed(() => input.value.split(/\r\n|\r|\n/u))
const highlightedErrorLine = computed<number | null>(() => {
  if (!errorLocation.value || input.value !== errorInput.value) {
    return null
  }

  const lineNumber = errorLocation.value.line
  const lineIndex = lineNumber - 1

  return lineIndex >= 0 && lineIndex < inputLines.value.length
    ? lineNumber
    : null
})
const editorHighlightStyle = computed(() => ({
  transform: `translate(${-editorScrollLeft.value}px, ${-editorScrollTop.value}px)`,
}))
const hasResettableState = computed(() => Boolean(
  tableName.value
  || input.value
  || output.value
  || error.value
  || downloadNotice.value,
))

/** 判断生成错误应显示在表名输入区还是 JSON 输入区。 */
function getErrorTarget(toolError: ToolError): JsonToSqlErrorTarget {
  return /^(?:请输入表名|表名)/u.test(toolError.message) ? 'table' : 'json'
}

/** 根据当前表名和 JSON 输入生成 MySQL INSERT 结果。 */
function generate() {
  if (isProcessing.value) {
    return
  }

  isProcessing.value = true
  downloadNotice.value = ''

  try {
    const result = generateJsonToSql(input.value, { tableName: tableName.value })

    if (!result.ok) {
      error.value = result.error
      errorTarget.value = getErrorTarget(result.error)
      errorInput.value = input.value
      return
    }

    output.value = result.value.sql
    rowCount.value = result.value.rowCount
    error.value = null
    errorTarget.value = null
    errorInput.value = ''
  } finally {
    isProcessing.value = false
  }
}

/** 同步 JSON 编辑区和错误高亮层的滚动位置。 */
function syncEditorScroll(event: Event) {
  const editor = event.currentTarget

  if (!(editor instanceof HTMLTextAreaElement)) {
    return
  }

  editorScrollTop.value = editor.scrollTop
  editorScrollLeft.value = editor.scrollLeft
}

/** 将当前 SQL 结果下载为本地 .sql 文件。 */
function download() {
  if (!output.value) {
    return
  }

  const result = downloadText(
    output.value,
    createDownloadFileName('json-to-sql', 'sql'),
  )
  downloadNotice.value = result.message
}

/** 清空当前工具的输入、结果、错误和下载反馈。 */
function clearAll() {
  tableName.value = ''
  input.value = ''
  output.value = ''
  rowCount.value = 0
  error.value = null
  errorTarget.value = null
  errorInput.value = ''
  editorScrollTop.value = 0
  editorScrollLeft.value = 0
  downloadNotice.value = ''

  if (inputEditor.value) {
    inputEditor.value.scrollTop = 0
    inputEditor.value.scrollLeft = 0
  }
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split json-to-sql-tool">
    <ToolInputPanel title="JSON 转 SQL" description="在浏览器本地将扁平 JSON 对象数组转换为 MySQL 多行 INSERT 语句。">
      <label class="tool-field">
        <span class="tool-field__label">表名</span>
        <input
          v-model="tableName"
          class="tool-input"
          :class="{ 'json-to-sql-tool__control--error': tableNameError }"
          type="text"
          placeholder="例如：users"
          autocomplete="off"
          spellcheck="false"
          aria-label="MySQL 表名"
          :aria-invalid="Boolean(tableNameError)"
        >
      </label>

      <div class="tool-field json-to-sql-tool__dialect-field">
        <span class="tool-field__label">数据库方言</span>
        <span class="json-to-sql-tool__dialect">MySQL</span>
      </div>

      <label class="tool-field">
        <span class="tool-field__label">JSON 文本</span>
        <div
          class="json-to-sql-tool__editor"
          :class="{ 'json-to-sql-tool__editor--error': jsonInputError }"
        >
          <pre
            class="json-to-sql-tool__editor-highlights"
            aria-hidden="true"
            :style="editorHighlightStyle"
          ><code><span
            v-for="(line, lineIndex) in inputLines"
            :key="lineIndex"
            class="json-to-sql-tool__editor-highlight-line"
            :class="{ 'json-to-sql-tool__editor-highlight-line--error': lineIndex + 1 === highlightedErrorLine }"
          >{{ line || ' ' }}</span></code></pre>
          <textarea
            ref="inputEditor"
            v-model="input"
            class="tool-textarea tool-textarea--code json-to-sql-tool__input"
            rows="14"
            placeholder='例如：[{"id":1,"name":"Ada"}]'
            aria-label="JSON 文本"
            :aria-invalid="Boolean(jsonInputError)"
            spellcheck="false"
            @scroll="syncEditorScroll"
          />
        </div>
      </label>

      <p class="tool-note">只接受非空、扁平的 JSON 对象数组；每条记录必须包含相同字段，嵌套对象和数组不会自动展开。</p>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isProcessing" @click="generate">
          {{ isProcessing ? '生成中…' : '生成 SQL' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      :title="resultTitle"
      :status="status"
      :error="error"
      :empty-text="emptyText"
      processing-text="正在生成 SQL，请稍候。"
    >
      <pre class="json-to-sql-tool__output"><code>{{ output }}</code></pre>
      <p v-if="downloadNotice" class="tool-note" role="status">{{ downloadNotice }}</p>
      <template #actions>
        <CopyButton :text="output" label="复制 SQL" />
        <button type="button" class="button button--secondary" :disabled="!output" @click="download">下载 SQL</button>
      </template>
    </ToolResultPanel>

    <section v-if="error && output" class="tool-panel json-to-sql-tool__preserved-result" aria-label="上一次成功结果">
      <header class="tool-panel__header">
        <h2 class="tool-panel__title">上一次成功结果</h2>
        <span class="tool-panel__status tool-panel__status--success">已保留 · {{ rowCount }} 行</span>
      </header>
      <p class="tool-note">本次生成失败，下面仍是上一次成功生成的 SQL，不代表当前输入已经处理成功。</p>
      <pre class="json-to-sql-tool__output json-to-sql-tool__output--preserved"><code>{{ output }}</code></pre>
      <div class="tool-panel__actions">
        <CopyButton :text="output" label="复制 SQL" />
        <button type="button" class="button button--secondary" :disabled="!output" @click="download">下载 SQL</button>
      </div>
    </section>
  </div>
</template>
