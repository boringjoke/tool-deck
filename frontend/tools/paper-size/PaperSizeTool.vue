<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  formatPaperSize,
  getPaperSeriesLabel,
  getPaperStandardLabel,
  PAPER_SIZE_CATALOG,
  PAPER_SIZE_DATASET_METADATA,
  PAPER_SIZE_SERIES_OPTIONS,
  PAPER_SIZE_STANDARD_OPTIONS,
  searchPaperSizes,
  type PaperSeriesFilter,
  type PaperSizeUnit,
  type PaperSizeView,
  type PaperStandardFilter,
  validatePaperSizeCatalog,
} from '~/core/paper-size'

const query = ref('')
const selectedStandard = ref<PaperStandardFilter>('all')
const selectedSeries = ref<PaperSeriesFilter>('all')
const unit = ref<PaperSizeUnit>('mm')
const view = ref<PaperSizeView>('table')

const catalogValidation = validatePaperSizeCatalog()
const catalogError = catalogValidation.ok ? null : catalogValidation.error

const visibleRecords = computed(() => {
  if (catalogError) {
    return []
  }

  return searchPaperSizes({
    query: query.value,
    standard: selectedStandard.value,
    series: selectedSeries.value,
  })
})

const resultSummary = computed(() => `${visibleRecords.value.length} / ${PAPER_SIZE_CATALOG.length} 项`)

const hasResettableState = computed(() => Boolean(
  query.value
  || selectedStandard.value !== 'all'
  || selectedSeries.value !== 'all'
  || unit.value !== 'mm'
  || view.value !== 'table',
))

/** 清除搜索、筛选、单位和视图状态。 */
function clearAll() {
  query.value = ''
  selectedStandard.value = 'all'
  selectedSeries.value = 'all'
  unit.value = 'mm'
  view.value = 'table'
}

onMounted(() => {
  if (window.matchMedia('(max-width: 640px)').matches) {
    view.value = 'cards'
  }
})
</script>

<template>
  <div class="tool-workspace paper-size-tool">
    <ToolInputPanel
      title="查询条件"
      description="搜索标准纸张尺寸，在浏览器本地筛选和切换显示单位。"
    >
      <div class="paper-size-tool__primary-fields">
        <label class="tool-field paper-size-tool__query-field">
          <span class="tool-field__label">搜索纸张</span>
          <input
            v-model="query"
            class="tool-input paper-size-tool__query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="例如：A4、Letter、11 x 17"
            aria-label="搜索纸张名称、英文名或别名"
          >
        </label>

        <label class="tool-field">
          <span class="tool-field__label">标准</span>
          <select v-model="selectedStandard" class="tool-select" aria-label="纸张标准">
            <option v-for="option in PAPER_SIZE_STANDARD_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">系列</span>
          <select v-model="selectedSeries" class="tool-select" aria-label="纸张系列">
            <option v-for="option in PAPER_SIZE_SERIES_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="paper-size-tool__option-groups">
        <fieldset class="paper-size-tool__option-group">
          <legend>显示单位</legend>
          <div class="paper-size-tool__segmented" role="group" aria-label="显示单位">
            <button
              type="button"
              class="paper-size-tool__segment"
              :class="{ 'paper-size-tool__segment--active': unit === 'mm' }"
              :aria-pressed="unit === 'mm'"
              @click="unit = 'mm'"
            >
              毫米
            </button>
            <button
              type="button"
              class="paper-size-tool__segment"
              :class="{ 'paper-size-tool__segment--active': unit === 'in' }"
              :aria-pressed="unit === 'in'"
              @click="unit = 'in'"
            >
              英寸
            </button>
          </div>
        </fieldset>

        <fieldset class="paper-size-tool__option-group">
          <legend>结果视图</legend>
          <div class="paper-size-tool__segmented" role="group" aria-label="结果视图">
            <button
              type="button"
              class="paper-size-tool__segment"
              :class="{ 'paper-size-tool__segment--active': view === 'table' }"
              :aria-pressed="view === 'table'"
              @click="view = 'table'"
            >
              表格
            </button>
            <button
              type="button"
              class="paper-size-tool__segment"
              :class="{ 'paper-size-tool__segment--active': view === 'cards' }"
              :aria-pressed="view === 'cards'"
              @click="view = 'cards'"
            >
              卡片
            </button>
          </div>
        </fieldset>

        <div class="paper-size-tool__option-actions">
          <ClearButton label="恢复全部" :disabled="!hasResettableState" @clear="clearAll" />
        </div>
      </div>
    </ToolInputPanel>

    <section class="tool-panel paper-size-tool__results" aria-labelledby="paper-size-results-title">
      <header class="tool-panel__header">
        <h2 id="paper-size-results-title" class="tool-panel__title">尺寸目录</h2>
        <span class="tool-panel__status" aria-live="polite">{{ resultSummary }}</span>
      </header>

      <ErrorNotice v-if="catalogError" :error="catalogError" />

      <template v-else>
        <details class="paper-size-tool__sources">
          <summary>数据来源与范围</summary>
          <p>{{ PAPER_SIZE_DATASET_METADATA.coverage }}</p>
          <p>数据版本 {{ PAPER_SIZE_DATASET_METADATA.version }}，复核日期 {{ PAPER_SIZE_DATASET_METADATA.checkedAt }}。</p>
          <ul>
            <li v-for="source in PAPER_SIZE_DATASET_METADATA.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noreferrer">{{ source.name }}</a>：{{ source.scope }}
            </li>
          </ul>
          <p class="tool-note">尺寸仅作标准参考，不代表打印机可打印区域、纸张重量或设备兼容性。</p>
        </details>

        <div v-if="visibleRecords.length === 0" class="tool-state paper-size-tool__empty" role="status">
          <strong>没有匹配的纸张尺寸</strong>
          <span>请调整搜索词或筛选条件，也可以点击“恢复全部”。</span>
        </div>

        <div v-else-if="view === 'table'" class="paper-size-tool__table-wrap">
          <table class="paper-size-tool__table">
            <caption class="sr-only">纸张尺寸查询结果</caption>
            <thead>
              <tr>
                <th scope="col">纸张</th>
                <th scope="col">标准</th>
                <th scope="col">系列</th>
                <th scope="col">短边 × 长边</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in visibleRecords" :key="record.id">
                <th scope="row">
                  <span class="paper-size-tool__name">{{ record.nameZh }}</span>
                  <span v-if="record.nameEn !== record.nameZh" class="paper-size-tool__subname">{{ record.nameEn }}</span>
                </th>
                <td>{{ getPaperStandardLabel(record.standard) }}</td>
                <td>{{ getPaperSeriesLabel(record.series) }}</td>
                <td class="paper-size-tool__dimension">{{ formatPaperSize(record, unit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="paper-size-tool__cards" aria-label="纸张尺寸卡片结果">
          <article v-for="record in visibleRecords" :key="record.id" class="paper-size-tool__card">
            <div>
              <p class="paper-size-tool__eyebrow">{{ getPaperStandardLabel(record.standard) }} · {{ getPaperSeriesLabel(record.series) }}</p>
              <h3 class="paper-size-tool__card-title">{{ record.nameZh }}</h3>
              <p v-if="record.nameEn !== record.nameZh" class="paper-size-tool__subname">{{ record.nameEn }}</p>
            </div>
            <p class="paper-size-tool__card-dimension">{{ formatPaperSize(record, unit) }}</p>
            <p class="paper-size-tool__card-note">{{ record.notes }}</p>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
