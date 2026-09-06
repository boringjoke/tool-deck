<script setup lang="ts">
import { computed, ref } from 'vue'
import { createDownloadFileName, downloadText } from '~/adapters/download'
import { getSecureRandomSource } from '~/adapters/secure-random'
import { formatUuidCase, generateUuidList, UUID_MAX_COUNT, UUID_MIN_COUNT } from '~/core/uuid'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const count = ref(1)
const uppercase = ref(false)
const results = ref<string[]>([])
const error = ref<ToolError | null>(null)
const downloadNotice = ref('')

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  return results.value.length ? 'success' : 'idle'
})

const displayedResults = computed(() => results.value.map((uuid) => formatUuidCase(uuid, uppercase.value)))
const resultText = computed(() => displayedResults.value.join('\n'))
const resultTitle = computed(() => results.value.length ? `UUID v4 × ${results.value.length}` : 'UUID 结果')
const hasResettableState = computed(() => Boolean(
  results.value.length || error.value || downloadNotice.value || count.value !== 1 || uppercase.value,
))

function generate() {
  downloadNotice.value = ''
  const source = getSecureRandomSource()

  if (!source) {
    results.value = []
    error.value = {
      code: 'crypto-unavailable',
      message: '当前浏览器没有可用的安全随机源，无法生成 UUID。',
    }
    return
  }

  const result = generateUuidList(count.value, source)

  if (!result.ok) {
    results.value = []
    error.value = result.error
    return
  }

  results.value = result.value
  error.value = null
}

function download() {
  if (!resultText.value) {
    return
  }

  const result = downloadText(
    resultText.value,
    createDownloadFileName('uuid-generator', 'txt'),
  )
  downloadNotice.value = result.message
}

function clearAll() {
  count.value = 1
  uppercase.value = false
  results.value = []
  error.value = null
  downloadNotice.value = ''
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split uuid-tool">
    <ToolInputPanel title="生成选项" description="使用浏览器安全随机源生成标准 UUID v4，不会上传或保存结果。">
      <div class="tool-field-grid tool-field-grid--two uuid-tool__config-grid">
        <label class="tool-field">
          <span class="tool-field__label">生成数量（{{ UUID_MIN_COUNT }}–{{ UUID_MAX_COUNT }}）</span>
          <input v-model.number="count" class="tool-input uuid-tool__count-input" type="number" :min="UUID_MIN_COUNT" :max="UUID_MAX_COUNT" step="1" inputmode="numeric" aria-label="UUID 生成数量">
        </label>
        <div class="uuid-tool__format-field">
          <span class="tool-field__label">格式选项</span>
          <label class="tool-check-field uuid-tool__format-option">
            <input v-model="uppercase" type="checkbox" aria-label="UUID 使用大写">
            <span>输出大写字母</span>
          </label>
        </div>
      </div>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" @click="generate">生成 UUID</button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel :title="resultTitle" :status="status" :error="error" empty-text="设置生成数量并点击“生成 UUID”，结果会按行显示。">
      <ol class="uuid-list">
        <li v-for="uuid in displayedResults" :key="uuid"><code>{{ uuid }}</code></li>
      </ol>
      <p v-if="downloadNotice" class="tool-note" role="status">{{ downloadNotice }}</p>
      <template #actions>
        <CopyButton :text="resultText" label="复制全部" />
        <button type="button" class="button button--secondary" :disabled="!resultText" @click="download">导出 TXT</button>
      </template>
    </ToolResultPanel>
  </div>
</template>
