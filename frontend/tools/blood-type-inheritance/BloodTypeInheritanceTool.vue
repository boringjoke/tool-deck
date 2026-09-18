<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BLOOD_TYPE_DATASET_METADATA,
  BLOOD_TYPE_OPTIONS,
  getBloodTypeOption,
  getPossibleChildBloodTypes,
  hasCompleteBloodTypeQuery,
  validateBloodTypeCatalog,
  type BloodTypeId,
} from '~/core/blood-type-inheritance'

const parentA = ref<BloodTypeId | null>(null)
const parentB = ref<BloodTypeId | null>(null)

const catalogValidation = validateBloodTypeCatalog()
const catalogError = catalogValidation.ok ? null : catalogValidation.error

const query = computed(() => ({
  parentA: parentA.value,
  parentB: parentB.value,
}))

const isComplete = computed(() => hasCompleteBloodTypeQuery(query.value))

const possibleChildTypes = computed(() => {
  if (catalogError || !isComplete.value) {
    return []
  }

  return getPossibleChildBloodTypes(parentA.value, parentB.value)
})

const possibleChildOptions = computed(() => possibleChildTypes.value.map(getBloodTypeOption))

const resultSummary = computed(() => {
  if (catalogError) {
    return '目录不可用'
  }

  if (!isComplete.value) {
    return '等待选择两位家长'
  }

  return `${possibleChildTypes.value.length} 种可能`
})

const parentSummary = computed(() => {
  if (!isComplete.value) {
    return ''
  }

  return `家长 A：${getBloodTypeOption(parentA.value!).labelZh} × 家长 B：${getBloodTypeOption(parentB.value!).labelZh}`
})

const hasResettableState = computed(() => Boolean(parentA.value || parentB.value))

/** 清除两位家长的选择和当前结果。 */
function clearAll() {
  parentA.value = null
  parentB.value = null
}
</script>

<template>
  <div class="tool-workspace blood-type-inheritance-tool">
    <ToolInputPanel
      title="组合查询"
      description="选择两位家长的常见血型，查看简化遗传模型下子代可能出现的血型。"
    >
      <div class="blood-type-inheritance-tool__controls">
        <label class="tool-field">
          <span class="tool-field__label">家长 A 血型</span>
          <select v-model="parentA" class="tool-select" aria-label="选择家长 A 血型">
            <option :value="null">请选择血型</option>
            <option v-for="option in BLOOD_TYPE_OPTIONS" :key="option.id" :value="option.id">
              {{ option.labelZh }} · {{ option.description }}
            </option>
          </select>
        </label>

        <label class="tool-field">
          <span class="tool-field__label">家长 B 血型</span>
          <select v-model="parentB" class="tool-select" aria-label="选择家长 B 血型">
            <option :value="null">请选择血型</option>
            <option v-for="option in BLOOD_TYPE_OPTIONS" :key="option.id" :value="option.id">
              {{ option.labelZh }} · {{ option.description }}
            </option>
          </select>
        </label>

        <div class="blood-type-inheritance-tool__option-actions">
          <ClearButton label="恢复全部" :disabled="!hasResettableState" @clear="clearAll" />
        </div>
      </div>
    </ToolInputPanel>

    <section class="tool-panel blood-type-inheritance-tool__results" aria-labelledby="blood-type-inheritance-results-title">
      <header class="tool-panel__header">
        <h2 id="blood-type-inheritance-results-title" class="tool-panel__title">可能的子代血型</h2>
        <span class="tool-panel__status" aria-live="polite">{{ resultSummary }}</span>
      </header>

      <ErrorNotice v-if="catalogError" :error="catalogError" />

      <template v-else>
        <div v-if="!isComplete" class="tool-state blood-type-inheritance-tool__empty" role="status">
          <strong>请选择两位家长的血型</strong>
          <span>选择完成后，这里会列出简化模型下的所有可能结果。</span>
        </div>

        <template v-else>
          <p class="blood-type-inheritance-tool__parent-summary">{{ parentSummary }}</p>

          <div class="blood-type-inheritance-tool__type-grid" role="list" aria-label="子代可能血型">
            <div
              v-for="option in possibleChildOptions"
              :key="option.id"
              class="blood-type-inheritance-tool__type"
              :class="`blood-type-inheritance-tool__type--${option.abo.toLowerCase()}`"
              role="listitem"
            >
              <strong class="blood-type-inheritance-tool__type-code">{{ option.labelZh }}</strong>
              <span class="blood-type-inheritance-tool__type-description">{{ option.description }}</span>
            </div>
          </div>
        </template>

        <p class="tool-note blood-type-inheritance-tool__warning">
          本结果用于学习常见血型遗传规律，不用于诊断、输血配型、亲子鉴定或孕产风险判断；实际血型和相关医学问题请以正规检测及医务人员意见为准。
        </p>

        <details class="blood-type-inheritance-tool__details">
          <summary>遗传原理</summary>
          <p>ABO 系统中，A 和 B 等位基因共显性，O 等位基因按常见教学模型处理为隐性；因此 A 型和 B 型表现型可能对应不止一种基因型。</p>
          <p>RhD 阳性表现型可能对应 DD 或 Dd，RhD 阴性按 dd 处理。表现型不能唯一确定基因型，所以同一组家长可能得到多个可能结果。</p>
          <p>本工具使用常见 ABO + RhD 的简化教学模型，不覆盖 weak D、partial D、Bombay 表型或其他血型系统。</p>
        </details>

        <details class="blood-type-inheritance-tool__sources">
          <summary>数据来源与范围</summary>
          <p>{{ BLOOD_TYPE_DATASET_METADATA.coverage }}</p>
          <p>{{ BLOOD_TYPE_DATASET_METADATA.model }}</p>
          <p>数据版本 {{ BLOOD_TYPE_DATASET_METADATA.version }}，复核日期 {{ BLOOD_TYPE_DATASET_METADATA.checkedAt }}。</p>
          <ul>
            <li v-for="source in BLOOD_TYPE_DATASET_METADATA.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noreferrer">{{ source.name }}</a>：{{ source.scope }}
            </li>
          </ul>
          <p class="tool-note">{{ BLOOD_TYPE_DATASET_METADATA.validation }}</p>
        </details>
      </template>
    </section>
  </div>
</template>
