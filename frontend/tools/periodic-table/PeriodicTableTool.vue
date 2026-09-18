<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  getPeriodicElementBlockLabel,
  getPeriodicElementCategoryLabel,
  getPeriodicElementGridPosition,
  getPeriodicElementSeries,
  getPeriodicElementStateLabel,
  PERIODIC_ELEMENT_BLOCK_OPTIONS,
  PERIODIC_ELEMENT_CATEGORY_OPTIONS,
  PERIODIC_ELEMENT_STATE_OPTIONS,
  PERIODIC_TABLE_DATASET_METADATA,
  searchPeriodicElements,
  validatePeriodicElementCatalog,
  type PeriodicElementBlockFilter,
  type PeriodicElementCategoryFilter,
  type PeriodicElementRecord,
  type PeriodicElementStateFilter,
} from '~/core/periodic-table'

const query = ref('')
const selectedCategory = ref<PeriodicElementCategoryFilter>('all')
const selectedBlock = ref<PeriodicElementBlockFilter>('all')
const selectedState = ref<PeriodicElementStateFilter>('all')
const selectedElementId = ref<string | null>(null)

const catalogValidation = validatePeriodicElementCatalog()
const catalogError = catalogValidation.ok ? null : catalogValidation.error

const visibleElements = computed(() => {
  if (catalogError) {
    return []
  }

  return searchPeriodicElements({
    query: query.value,
    category: selectedCategory.value,
    block: selectedBlock.value,
    state: selectedState.value,
  })
})

const selectedElement = computed(() => visibleElements.value.find(
  (element) => element.id === selectedElementId.value,
) ?? null)

const visibleMainElements = computed(() => visibleElements.value.filter((element) => element.group !== null))

const visibleLanthanides = computed(() => visibleElements.value.filter(
  (element) => element.category === 'lanthanide',
))

const visibleActinides = computed(() => visibleElements.value.filter(
  (element) => element.category === 'actinide',
))

const categoryLegend = computed(() => PERIODIC_ELEMENT_CATEGORY_OPTIONS.filter(
  (option) => option.value !== 'all',
))

const resultSummary = computed(() => `${visibleElements.value.length} / 118 个元素`)

const hasResettableState = computed(() => Boolean(
  query.value
  || selectedCategory.value !== 'all'
  || selectedBlock.value !== 'all'
  || selectedState.value !== 'all'
  || selectedElementId.value,
))

/** 清除查询、属性筛选和当前选中的元素。 */
function clearAll() {
  query.value = ''
  selectedCategory.value = 'all'
  selectedBlock.value = 'all'
  selectedState.value = 'all'
  selectedElementId.value = null
}

/** 选中一个元素，并让详情面板跟随当前网格选择更新。 */
function selectElement(element: PeriodicElementRecord) {
  selectedElementId.value = element.id
}

/** 清除当前选中的元素，供详情面板按钮和 Esc 键使用。 */
function clearSelectedElement() {
  selectedElementId.value = null
}

/** 返回主表元素的 CSS 网格位置，空位由网格自然保留。 */
function getMainElementStyle(element: PeriodicElementRecord) {
  const position = getPeriodicElementGridPosition(element)

  return {
    gridColumn: String(position.column),
    gridRow: String(position.row),
  }
}

/** 返回镧系或锕系元素的 CSS 网格列。 */
function getSeriesElementStyle(element: PeriodicElementRecord) {
  const position = getPeriodicElementGridPosition({
    ...element,
    group: null,
  })

  return {
    gridColumn: String(position.column),
  }
}

function getElementAriaLabel(element: PeriodicElementRecord): string {
  return `${element.atomicNumber} 号元素：${element.nameZh}（${element.symbol}），${element.nameEn}`
}

watch(visibleElements, (elements) => {
  if (selectedElementId.value && !elements.some((element) => element.id === selectedElementId.value)) {
    selectedElementId.value = null
  }
})
</script>

<template>
  <div class="tool-workspace periodic-table-tool" @keydown.esc="clearSelectedElement">
    <ToolInputPanel
      title="查询条件"
      description="搜索元素或按基础属性筛选，在浏览器本地浏览静态周期表。"
    >
      <div class="periodic-table-tool__controls">
        <label class="tool-field periodic-table-tool__query-field">
          <span class="tool-field__label">搜索元素</span>
          <input
            v-model="query"
            class="tool-input periodic-table-tool__query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="例如：氧、O、Oxygen、8"
            aria-label="搜索元素名称、符号或原子序数"
          >
        </label>

        <label class="tool-field">
          <span class="tool-field__label">元素分类</span>
          <select v-model="selectedCategory" class="tool-select" aria-label="元素分类">
            <option v-for="option in PERIODIC_ELEMENT_CATEGORY_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">区块</span>
          <select v-model="selectedBlock" class="tool-select" aria-label="元素区块">
            <option v-for="option in PERIODIC_ELEMENT_BLOCK_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">常温状态</span>
          <select v-model="selectedState" class="tool-select" aria-label="元素常温状态">
            <option v-for="option in PERIODIC_ELEMENT_STATE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <div class="periodic-table-tool__option-actions">
          <ClearButton label="恢复全部" :disabled="!hasResettableState" @clear="clearAll" />
        </div>
      </div>
    </ToolInputPanel>

    <section class="tool-panel periodic-table-tool__results" aria-labelledby="periodic-table-results-title">
      <header class="tool-panel__header">
        <h2 id="periodic-table-results-title" class="tool-panel__title">元素周期表</h2>
        <span class="tool-panel__status" aria-live="polite">{{ resultSummary }}</span>
      </header>

      <ErrorNotice v-if="catalogError" :error="catalogError" />

      <template v-else>
        <div class="periodic-table-tool__legend" aria-label="元素分类图例">
          <span class="periodic-table-tool__legend-note">分类色带仅作辅助，元素名称和分类文本始终保留。</span>
          <span
            v-for="option in categoryLegend"
            :key="option.value"
            class="periodic-table-tool__legend-item"
            :class="`periodic-table-tool__legend-item--${option.value}`"
          >
            <span class="periodic-table-tool__legend-swatch" aria-hidden="true" />
            {{ option.label }}
          </span>
        </div>

        <div v-if="visibleElements.length === 0" class="tool-state periodic-table-tool__empty" role="status">
          <strong>没有匹配的元素</strong>
          <span>请调整搜索词或属性筛选，也可以点击“恢复全部”。</span>
        </div>

        <template v-else>
          <div class="periodic-table-tool__table-scroll" tabindex="0" aria-label="周期表横向滚动区域">
            <div class="periodic-table-tool__grid-shell">
              <div class="periodic-table-tool__group-labels" aria-hidden="true">
                <span v-for="group in 18" :key="group">{{ group }}</span>
              </div>

              <div class="periodic-table-tool__main-grid" role="grid" aria-label="元素周期表主表">
                <button
                  v-for="element in visibleMainElements"
                  :key="element.id"
                  type="button"
                  role="gridcell"
                  class="periodic-table-tool__element"
                  :class="[
                    `periodic-table-tool__element--${element.category}`,
                    { 'periodic-table-tool__element--selected': selectedElementId === element.id },
                  ]"
                  :style="getMainElementStyle(element)"
                  :aria-label="getElementAriaLabel(element)"
                  :aria-pressed="selectedElementId === element.id"
                  @click="selectElement(element)"
                >
                  <span class="periodic-table-tool__atomic-number">{{ element.atomicNumber }}</span>
                  <strong class="periodic-table-tool__symbol">{{ element.symbol }}</strong>
                  <span class="periodic-table-tool__name">{{ element.nameZh }}</span>
                  <span class="periodic-table-tool__weight">{{ element.atomicWeight }}</span>
                </button>
              </div>

              <div class="periodic-table-tool__series-row">
                <span class="periodic-table-tool__series-label">镧系</span>
                <div class="periodic-table-tool__series-grid" role="grid" aria-label="镧系元素">
                  <button
                    v-for="element in visibleLanthanides"
                    :key="element.id"
                    type="button"
                    role="gridcell"
                    class="periodic-table-tool__element periodic-table-tool__element--series"
                    :class="[
                      `periodic-table-tool__element--${element.category}`,
                      { 'periodic-table-tool__element--selected': selectedElementId === element.id },
                    ]"
                    :style="getSeriesElementStyle(element)"
                    :aria-label="getElementAriaLabel(element)"
                    :aria-pressed="selectedElementId === element.id"
                    @click="selectElement(element)"
                  >
                    <span class="periodic-table-tool__atomic-number">{{ element.atomicNumber }}</span>
                    <strong class="periodic-table-tool__symbol">{{ element.symbol }}</strong>
                    <span class="periodic-table-tool__name">{{ element.nameZh }}</span>
                    <span class="periodic-table-tool__weight">{{ element.atomicWeight }}</span>
                  </button>
                </div>
              </div>

              <div class="periodic-table-tool__series-row">
                <span class="periodic-table-tool__series-label">锕系</span>
                <div class="periodic-table-tool__series-grid" role="grid" aria-label="锕系元素">
                  <button
                    v-for="element in visibleActinides"
                    :key="element.id"
                    type="button"
                    role="gridcell"
                    class="periodic-table-tool__element periodic-table-tool__element--series"
                    :class="[
                      `periodic-table-tool__element--${element.category}`,
                      { 'periodic-table-tool__element--selected': selectedElementId === element.id },
                    ]"
                    :style="getSeriesElementStyle(element)"
                    :aria-label="getElementAriaLabel(element)"
                    :aria-pressed="selectedElementId === element.id"
                    @click="selectElement(element)"
                  >
                    <span class="periodic-table-tool__atomic-number">{{ element.atomicNumber }}</span>
                    <strong class="periodic-table-tool__symbol">{{ element.symbol }}</strong>
                    <span class="periodic-table-tool__name">{{ element.nameZh }}</span>
                    <span class="periodic-table-tool__weight">{{ element.atomicWeight }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <section v-if="selectedElement" class="periodic-table-tool__detail" aria-labelledby="periodic-element-detail-title">
            <header class="periodic-table-tool__detail-header">
              <div class="periodic-table-tool__detail-heading">
                <span class="periodic-table-tool__detail-number">{{ selectedElement.atomicNumber }}</span>
                <div>
                  <p class="periodic-table-tool__detail-symbol">{{ selectedElement.symbol }}</p>
                  <h3 id="periodic-element-detail-title" class="periodic-table-tool__detail-title">{{ selectedElement.nameZh }}</h3>
                  <p class="periodic-table-tool__detail-en">{{ selectedElement.nameEn }}</p>
                </div>
              </div>
              <button type="button" class="button button--secondary periodic-table-tool__detail-clear" @click="clearSelectedElement">
                清除选中
              </button>
            </header>

            <dl class="periodic-table-tool__detail-grid">
              <div>
                <dt>标准原子量</dt>
                <dd>{{ selectedElement.atomicWeight }}</dd>
              </div>
              <div>
                <dt>周期 / 族</dt>
                <dd>{{ selectedElement.period }} / {{ selectedElement.group ?? 'f 区序列' }}</dd>
              </div>
              <div>
                <dt>区块</dt>
                <dd>{{ getPeriodicElementBlockLabel(selectedElement.block) }}</dd>
              </div>
              <div>
                <dt>元素分类</dt>
                <dd>{{ getPeriodicElementCategoryLabel(selectedElement.category) }}</dd>
              </div>
              <div>
                <dt>常温状态</dt>
                <dd>{{ getPeriodicElementStateLabel(selectedElement.state) }}</dd>
              </div>
            </dl>
          </section>

          <div v-else class="tool-state periodic-table-tool__selection-empty" role="status">
            <strong>选择一个元素查看详情</strong>
            <span>点击周期表中的元素，或使用键盘聚焦后按 Enter/Space。</span>
          </div>
        </template>

        <details class="periodic-table-tool__sources">
          <summary>数据来源与范围</summary>
          <p>{{ PERIODIC_TABLE_DATASET_METADATA.coverage }}</p>
          <p>数据版本 {{ PERIODIC_TABLE_DATASET_METADATA.version }}，复核日期 {{ PERIODIC_TABLE_DATASET_METADATA.checkedAt }}。</p>
          <ul>
            <li v-for="source in PERIODIC_TABLE_DATASET_METADATA.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noreferrer">{{ source.name }}</a>：{{ source.scope }}
            </li>
          </ul>
          <p class="tool-note">标准原子量中的区间、约值和方括号质量数保留来源语义；104–118 的常温状态为未知/预测，不代表实测状态。</p>
          <p class="tool-note">本工具用于基础知识查询，不提供化学计算、实验安全建议、同位素数据库或实时科研数据。</p>
        </details>
      </template>
    </section>
  </div>
</template>
