<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  formatHistoricalRange,
  getHistoricalDatePrecisionLabel,
  getHistoricalPeriodLabel,
  getHistoricalTimelineLayout,
  getHistoricalTrackLabel,
  searchHistoricalDynasties,
  validateHistoricalDynastyCatalog,
  HISTORICAL_DYNASTY_DATASET_METADATA,
  HISTORICAL_PERIOD_OPTIONS,
  HISTORICAL_TRACK_OPTIONS,
  type HistoricalPeriodFilter,
  type HistoricalTrackFilter,
} from '~/core/historical-dynasties'

const query = ref('')
const selectedPeriod = ref<HistoricalPeriodFilter>('all')
const selectedTrack = ref<HistoricalTrackFilter>('all')
const selectedRecordId = ref<string | null>(null)

const catalogValidation = validateHistoricalDynastyCatalog()
const catalogError = catalogValidation.ok ? null : catalogValidation.error

const visibleRecords = computed(() => {
  if (catalogError) {
    return []
  }

  return searchHistoricalDynasties({
    query: query.value,
    period: selectedPeriod.value,
    track: selectedTrack.value,
  })
})

const timelineSections = computed(() => getHistoricalTimelineLayout(visibleRecords.value))

const selectedRecord = computed(() => visibleRecords.value.find((record) => record.id === selectedRecordId.value) ?? null)

const resultSummary = computed(() => {
  if (catalogError) {
    return '目录不可用'
  }

  return `${visibleRecords.value.length} 条记录 · ${visibleRecords.value.filter((record) => record.track === 'mainline').length} 条主线 · ${visibleRecords.value.filter((record) => record.track === 'parallel').length} 条并行`
})

const hasResettableState = computed(() => Boolean(
  query.value
  || selectedPeriod.value !== 'all'
  || selectedTrack.value !== 'all'
  || selectedRecordId.value,
))

/** 选中一条历史记录并把详情同步到桌面检查器或移动端抽屉。 */
function selectRecord(id: string) {
  selectedRecordId.value = id
}

/** 清除搜索、筛选和当前选中记录。 */
function clearAll() {
  query.value = ''
  selectedPeriod.value = 'all'
  selectedTrack.value = 'all'
  selectedRecordId.value = null
}

/** 只清除当前选中的历史记录。 */
function clearSelection() {
  selectedRecordId.value = null
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    clearSelection()
  }
}

watch(visibleRecords, (records) => {
  if (selectedRecordId.value && !records.some((record) => record.id === selectedRecordId.value)) {
    selectedRecordId.value = null
  }
})

onMounted(() => window.addEventListener('keydown', handleWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleWindowKeydown))
</script>

<template>
  <div class="tool-workspace historical-dynasties-tool">
    <ToolInputPanel
      title="查询条件"
      description="浏览中国古代主要朝代与并行政权的静态时间轴。"
    >
      <div class="historical-dynasties-tool__controls">
        <label class="tool-field historical-dynasties-tool__query-field">
          <span class="tool-field__label">搜索朝代或政权</span>
          <input
            v-model="query"
            class="tool-input historical-dynasties-tool__query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="例如：汉、南朝宋、五代十国"
            aria-label="搜索朝代或政权名称、别名"
          >
        </label>

        <label class="tool-field historical-dynasties-tool__period-field">
          <span class="tool-field__label">历史阶段</span>
          <select v-model="selectedPeriod" class="tool-select" aria-label="历史阶段">
            <option value="all">全部阶段</option>
            <option v-for="option in HISTORICAL_PERIOD_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="tool-field historical-dynasties-tool__track-field">
          <span class="tool-field__label">轨道</span>
          <select v-model="selectedTrack" class="tool-select" aria-label="主线或并行轨道">
            <option v-for="option in HISTORICAL_TRACK_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <div class="historical-dynasties-tool__option-actions">
          <ClearButton label="恢复全部" :disabled="!hasResettableState" @clear="clearAll" />
        </div>
      </div>
    </ToolInputPanel>

    <section class="tool-panel historical-dynasties-tool__results" aria-labelledby="historical-dynasties-results-title">
      <header class="tool-panel__header">
        <h2 id="historical-dynasties-results-title" class="tool-panel__title">历史时间轴</h2>
        <span class="tool-panel__status" aria-live="polite">{{ resultSummary }}</span>
      </header>

      <ErrorNotice v-if="catalogError" :error="catalogError" />

      <template v-else>
        <details class="historical-dynasties-tool__sources">
          <summary>数据来源与范围</summary>
          <p>{{ HISTORICAL_DYNASTY_DATASET_METADATA.coverage }}</p>
          <p>数据版本 {{ HISTORICAL_DYNASTY_DATASET_METADATA.version }}，复核日期 {{ HISTORICAL_DYNASTY_DATASET_METADATA.checkedAt }}。</p>
          <ul>
            <li v-for="source in HISTORICAL_DYNASTY_DATASET_METADATA.sources" :key="source.id">
              <a :href="source.url" target="_blank" rel="noreferrer">{{ source.name }}</a>：{{ source.scope }}
            </li>
          </ul>
          <p class="tool-note">年代使用公元前/公元显示；约略年代、区间和传统纪年以说明文字保留适用范围，不表示完整历史年表。</p>
          <p class="tool-note">{{ HISTORICAL_DYNASTY_DATASET_METADATA.validation }}</p>
        </details>

        <div v-if="visibleRecords.length === 0" class="tool-state historical-dynasties-tool__empty" role="status">
          <strong>没有匹配的朝代或政权</strong>
          <span>请调整搜索词或筛选条件，也可以点击“恢复全部”。</span>
        </div>

        <template v-else>
          <div class="historical-dynasties-tool__legend" aria-label="时间轴图例">
            <span class="historical-dynasties-tool__legend-item historical-dynasties-tool__legend-item--mainline">主线朝代</span>
            <span class="historical-dynasties-tool__legend-item historical-dynasties-tool__legend-item--parallel">并行政权</span>
            <span class="historical-dynasties-tool__legend-note">卡片中的“约”“区间”表示年代精度限制</span>
          </div>

          <div
            class="historical-dynasties-tool__workspace"
            :class="{ 'historical-dynasties-tool__workspace--has-selection': selectedRecord }"
          >
            <div class="historical-dynasties-tool__timeline-wrap">
              <div class="historical-dynasties-tool__timeline" aria-label="中国古代主要朝代与并行政权时间轴">
                <div class="historical-dynasties-tool__axis" aria-hidden="true">
                  <span>约前2070年</span>
                  <span>前221年</span>
                  <span>220年</span>
                  <span>589年</span>
                  <span>907年</span>
                  <span>1271年</span>
                  <span>1912年</span>
                </div>

                <section
                  v-for="section in timelineSections.filter((item) => item.mainline.length || item.parallel.length)"
                  :key="section.value"
                  class="historical-dynasties-tool__period"
                >
                  <header class="historical-dynasties-tool__period-header">
                    <div>
                      <p class="historical-dynasties-tool__period-eyebrow">{{ section.rangeLabel }}</p>
                      <h3>{{ section.label }}</h3>
                    </div>
                    <span>{{ section.mainline.length + section.parallel.length }} 条</span>
                  </header>

                  <div v-if="section.mainline.length" class="historical-dynasties-tool__lane historical-dynasties-tool__lane--mainline">
                    <div class="historical-dynasties-tool__lane-label">主线朝代</div>
                    <div class="historical-dynasties-tool__lane-items">
                      <button
                        v-for="record in section.mainline"
                        :key="record.id"
                        type="button"
                        class="historical-dynasties-tool__record"
                        :class="{ 'historical-dynasties-tool__record--selected': selectedRecordId === record.id }"
                        :aria-pressed="selectedRecordId === record.id"
                        @click="selectRecord(record.id)"
                        @keydown.enter.prevent="selectRecord(record.id)"
                        @keydown.space.prevent="selectRecord(record.id)"
                      >
                        <span class="historical-dynasties-tool__record-range">{{ formatHistoricalRange(record) }}</span>
                        <strong>{{ record.nameZh }}</strong>
                        <span v-if="record.aliases.length" class="historical-dynasties-tool__record-aliases">{{ record.aliases.slice(0, 2).join(' · ') }}</span>
                      </button>
                    </div>
                  </div>

                  <div v-if="section.parallel.length" class="historical-dynasties-tool__lane historical-dynasties-tool__lane--parallel">
                    <div class="historical-dynasties-tool__lane-label">并行政权</div>
                    <div class="historical-dynasties-tool__lane-items">
                      <button
                        v-for="record in section.parallel"
                        :key="record.id"
                        type="button"
                        class="historical-dynasties-tool__record"
                        :class="{ 'historical-dynasties-tool__record--selected': selectedRecordId === record.id }"
                        :aria-pressed="selectedRecordId === record.id"
                        @click="selectRecord(record.id)"
                        @keydown.enter.prevent="selectRecord(record.id)"
                        @keydown.space.prevent="selectRecord(record.id)"
                      >
                        <span class="historical-dynasties-tool__record-range">{{ formatHistoricalRange(record) }}</span>
                        <strong>{{ record.nameZh }}</strong>
                        <span v-if="record.aliases.length" class="historical-dynasties-tool__record-aliases">{{ record.aliases.slice(0, 2).join(' · ') }}</span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <aside v-if="selectedRecord" class="historical-dynasties-tool__details" aria-live="polite" aria-labelledby="historical-dynasties-selected-title">
              <header class="historical-dynasties-tool__details-header">
                <div>
                  <p class="historical-dynasties-tool__period-eyebrow">已选记录</p>
                  <h3 id="historical-dynasties-selected-title">{{ selectedRecord.nameZh }}</h3>
                </div>
                <button type="button" class="historical-dynasties-tool__clear-selection" @click="clearSelection">
                  清除选中
                </button>
              </header>

              <dl class="historical-dynasties-tool__detail-grid">
                <div>
                  <dt>年代</dt>
                  <dd>{{ formatHistoricalRange(selectedRecord) }}</dd>
                </div>
                <div>
                  <dt>历史阶段</dt>
                  <dd>{{ getHistoricalPeriodLabel(selectedRecord.periodKey) }}</dd>
                </div>
                <div>
                  <dt>轨道</dt>
                  <dd>{{ getHistoricalTrackLabel(selectedRecord.track) }}</dd>
                </div>
                <div>
                  <dt>年代口径</dt>
                  <dd>{{ getHistoricalDatePrecisionLabel(selectedRecord.datePrecision) }}</dd>
                </div>
              </dl>
              <p v-if="selectedRecord.aliases.length" class="historical-dynasties-tool__detail-aliases">
                别名：{{ selectedRecord.aliases.join('、') }}
              </p>
              <p class="historical-dynasties-tool__detail-note">{{ selectedRecord.note }}</p>
            </aside>
          </div>
        </template>
      </template>
    </section>
  </div>
</template>
