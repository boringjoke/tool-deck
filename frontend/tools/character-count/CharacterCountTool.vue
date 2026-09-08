<script setup lang="ts">
import { computed, ref } from 'vue'
import { analyzeText } from '~/core/character-count'
import type { ToolUiStatus } from '~/types/tool'

const text = ref('')
const stats = computed(() => analyzeText(text.value))
const status = computed<ToolUiStatus>(() => text.value ? 'success' : 'idle')
const statItems = computed(() => [
  { label: '字符（含空格）', value: stats.value.charactersWithSpaces },
  { label: '字符（不含空格）', value: stats.value.charactersWithoutSpaces },
  { label: '词数', value: stats.value.wordCount },
  { label: '句子', value: stats.value.sentenceCount },
  { label: '段落', value: stats.value.paragraphCount },
  { label: '行数', value: stats.value.lineCount },
  { label: '汉字数', value: stats.value.hanCount },
  { label: 'UTF-8 字节', value: stats.value.byteCount },
])
const copyText = computed(() => statItems.value.map((item) => `${item.label}：${item.value}`).join('\n'))

/** 清空当前工具的文本输入。 */
function clearInput() {
  text.value = ''
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split">
    <ToolInputPanel
      title="输入文本"
      description="输入或粘贴文本，统计结果会在本地实时更新。"
    >
      <textarea
        v-model="text"
        class="tool-textarea"
        rows="10"
        placeholder="在这里输入或粘贴文字…"
        aria-label="待统计文本"
      />
      <div class="tool-panel__actions">
        <ClearButton :disabled="!text" @clear="clearInput" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="统计结果"
      :status="status"
      empty-text="输入文字后，这里会显示字符、词数、句子、段落和行数。"
    >
      <div class="stat-grid">
        <div v-for="item in statItems" :key="item.label" class="stat-card">
          <span class="stat-card__label">{{ item.label }}</span>
          <strong class="stat-card__value">{{ item.value }}</strong>
        </div>
      </div>
      <template #actions>
        <CopyButton :text="copyText" label="复制统计结果" />
      </template>
    </ToolResultPanel>

    <aside class="tool-help">
      <h3>统计口径</h3>
      <p>字符按用户可见的 Unicode 字素统计；不含空格会排除 Unicode 空白字符。词数和句子使用浏览器标准分词能力，段落按空行分隔。</p>
    </aside>
  </div>
</template>
