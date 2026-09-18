<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getWorldCapitalFlagPath,
  getWorldCapitalRegionLabel,
  getWorldCapitalRoleLabel,
  searchWorldCapitals,
  validateWorldCapitalCatalog,
  WORLD_CAPITAL_CATALOG,
  WORLD_CAPITAL_DATASET_METADATA,
  WORLD_CAPITAL_REGION_OPTIONS,
  type WorldCapitalRegionFilter,
  type WorldCapitalView,
} from '~/core/world-capitals'

const query = ref('')
const selectedRegion = ref<WorldCapitalRegionFilter>('all')
const view = ref<WorldCapitalView>('table')

const catalogValidation = validateWorldCapitalCatalog()
const catalogError = catalogValidation.ok ? null : catalogValidation.error

const visibleRecords = computed(() => {
  if (catalogError) {
    return []
  }

  return searchWorldCapitals({
    query: query.value,
    region: selectedRegion.value,
  })
})

const visibleCapitalCount = computed(() => visibleRecords.value.reduce(
  (total, record) => total + record.capitals.length,
  0,
))

const resultSummary = computed(() => `${visibleRecords.value.length} 个国家 · ${visibleCapitalCount.value} 个首都`)

const hasResettableState = computed(() => Boolean(
  query.value
  || selectedRegion.value !== 'all'
  || view.value !== 'table',
))

/** 清除搜索、地区和视图状态。 */
function clearAll() {
  query.value = ''
  selectedRegion.value = 'all'
  view.value = 'table'
}

onMounted(() => {
  if (window.matchMedia('(max-width: 640px)').matches) {
    view.value = 'cards'
  }
})
</script>

<template>
  <div class="tool-workspace world-capitals-tool">
    <ToolInputPanel
      title="查询条件"
      description="搜索国家或首都，在浏览器本地筛选静态参考目录。"
    >
      <div class="world-capitals-tool__controls">
        <label class="tool-field world-capitals-tool__query-field">
          <span class="tool-field__label">搜索国家或首都</span>
          <input
            v-model="query"
            class="tool-input world-capitals-tool__query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="例如：中国、Beijing、USA"
            aria-label="搜索国家、首都或别名"
          >
        </label>

        <label class="tool-field world-capitals-tool__region-field">
          <span class="tool-field__label">地区</span>
          <select v-model="selectedRegion" class="tool-select" aria-label="首都地区">
            <option v-for="option in WORLD_CAPITAL_REGION_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <fieldset class="world-capitals-tool__option-group">
          <legend>结果视图</legend>
          <div class="world-capitals-tool__segmented" role="group" aria-label="结果视图">
            <button
              type="button"
              class="world-capitals-tool__segment"
              :class="{ 'world-capitals-tool__segment--active': view === 'table' }"
              :aria-pressed="view === 'table'"
              @click="view = 'table'"
            >
              表格
            </button>
            <button
              type="button"
              class="world-capitals-tool__segment"
              :class="{ 'world-capitals-tool__segment--active': view === 'cards' }"
              :aria-pressed="view === 'cards'"
              @click="view = 'cards'"
            >
              卡片
            </button>
          </div>
        </fieldset>

        <div class="world-capitals-tool__option-actions">
          <ClearButton label="恢复全部" :disabled="!hasResettableState" @clear="clearAll" />
        </div>
      </div>
    </ToolInputPanel>

    <section class="tool-panel world-capitals-tool__results" aria-labelledby="world-capitals-results-title">
      <header class="tool-panel__header">
        <h2 id="world-capitals-results-title" class="tool-panel__title">首都目录</h2>
        <span class="tool-panel__status" aria-live="polite">{{ resultSummary }}</span>
      </header>

      <ErrorNotice v-if="catalogError" :error="catalogError" />

      <template v-else>
        <details class="world-capitals-tool__sources">
          <summary>数据来源与范围</summary>
          <p>{{ WORLD_CAPITAL_DATASET_METADATA.coverage }}</p>
          <p>数据版本 {{ WORLD_CAPITAL_DATASET_METADATA.version }}，复核日期 {{ WORLD_CAPITAL_DATASET_METADATA.checkedAt }}。</p>
          <ul>
            <li v-for="source in WORLD_CAPITAL_DATASET_METADATA.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noreferrer">{{ source.name }}</a>：{{ source.scope }}
            </li>
          </ul>
          <p class="tool-note">地区只用于目录筛选，不代表政治归属或承认立场；没有法定首都的例外记录会以来源说明和角色标注。</p>
        </details>

        <div v-if="visibleRecords.length === 0" class="tool-state world-capitals-tool__empty" role="status">
          <strong>没有匹配的国家或首都</strong>
          <span>请调整搜索词或地区筛选，也可以点击“恢复全部”。</span>
        </div>

        <div v-else-if="view === 'table'" class="world-capitals-tool__table-wrap">
          <table class="world-capitals-tool__table">
            <caption class="sr-only">各国首都查询结果</caption>
            <colgroup>
              <col>
              <col>
              <col>
              <col>
            </colgroup>
            <thead>
              <tr>
                <th scope="col">国家</th>
                <th scope="col">首都</th>
                <th scope="col">地区</th>
                <th scope="col">ISO</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in visibleRecords" :key="record.id">
                <th scope="row">
                  <div class="world-capitals-tool__country">
                    <img
                      class="world-capitals-tool__flag"
                      :src="getWorldCapitalFlagPath(record.isoAlpha2)"
                      alt=""
                      aria-hidden="true"
                      width="32"
                      height="24"
                      loading="lazy"
                      decoding="async"
                    >
                    <div>
                      <span class="world-capitals-tool__name">{{ record.nameZh }}</span>
                      <span class="world-capitals-tool__subname">{{ record.nameEn }}</span>
                    </div>
                  </div>
                </th>
                <td>
                  <div class="world-capitals-tool__capital-list">
                    <div v-for="capital in record.capitals" :key="capital.id" class="world-capitals-tool__capital-entry">
                      <div class="world-capitals-tool__capital-heading">
                        <span class="world-capitals-tool__capital-name">{{ capital.nameZh }}</span>
                        <span v-if="capital.nameEn !== capital.nameZh" class="world-capitals-tool__capital-en">{{ capital.nameEn }}</span>
                        <span v-if="capital.role" class="world-capitals-tool__role">{{ getWorldCapitalRoleLabel(capital.role) }}</span>
                      </div>
                      <span v-if="capital.note" class="world-capitals-tool__capital-note">{{ capital.note }}</span>
                    </div>
                  </div>
                </td>
                <td>{{ getWorldCapitalRegionLabel(record.region) }}</td>
                <td class="world-capitals-tool__iso">
                  <span>{{ record.isoAlpha3 }}</span>
                  <small>{{ record.isoAlpha2 }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="world-capitals-tool__cards" aria-label="各国首都卡片结果">
          <article v-for="record in visibleRecords" :key="record.id" class="world-capitals-tool__card">
            <header class="world-capitals-tool__card-header">
              <img
                class="world-capitals-tool__flag"
                :src="getWorldCapitalFlagPath(record.isoAlpha2)"
                alt=""
                aria-hidden="true"
                width="32"
                height="24"
                loading="lazy"
                decoding="async"
              >
              <div class="world-capitals-tool__card-country-copy">
                <p class="world-capitals-tool__eyebrow">{{ getWorldCapitalRegionLabel(record.region) }} · {{ record.isoAlpha3 }}</p>
                <h3 class="world-capitals-tool__card-title">{{ record.nameZh }}</h3>
                <p class="world-capitals-tool__subname">{{ record.nameEn }} · {{ record.isoAlpha2 }}</p>
              </div>
            </header>

            <div class="world-capitals-tool__card-capitals">
              <div v-for="capital in record.capitals" :key="capital.id" class="world-capitals-tool__capital-entry">
                <div class="world-capitals-tool__capital-heading">
                  <span class="world-capitals-tool__capital-name">{{ capital.nameZh }}</span>
                  <span v-if="capital.role" class="world-capitals-tool__role">{{ getWorldCapitalRoleLabel(capital.role) }}</span>
                </div>
                <span v-if="capital.nameEn !== capital.nameZh" class="world-capitals-tool__capital-en">{{ capital.nameEn }}</span>
                <span v-if="capital.note" class="world-capitals-tool__capital-note">{{ capital.note }}</span>
              </div>
            </div>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>
