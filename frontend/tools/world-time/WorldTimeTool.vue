<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  addWorldTimeOption,
  createWorldTimeSnapshot,
  getDefaultWorldTimeOptions,
  searchBuiltinWorldTimeOptions,
  validateIanaTimeZone,
  type WorldTimeBuiltinOption,
  type WorldTimeOption,
  type WorldTimeSnapshot,
} from '~/core/world-time'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const defaultOptions = getDefaultWorldTimeOptions()
const builtinQuery = ref('')
const customTimeZone = ref('')
const selectedOptions = ref<WorldTimeOption[]>([...defaultOptions])
const snapshots = ref<WorldTimeSnapshot[]>([])
const nowMilliseconds = ref<number | null>(null)
const error = ref<ToolError | null>(null)
const builtinCombobox = ref<HTMLElement | null>(null)
const isBuiltinDropdownOpen = ref(false)
const highlightedBuiltinIndex = ref(0)
const builtinListId = 'world-time-builtin-list'
let refreshTimer: ReturnType<typeof setInterval> | undefined

const builtinOptions = computed(() => searchBuiltinWorldTimeOptions(builtinQuery.value))

const highlightedBuiltinOption = computed(() => (
  builtinOptions.value[highlightedBuiltinIndex.value] ?? null
))

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  return snapshots.value.length > 0 ? 'success' : 'idle'
})

const emptyText = computed(() => {
  if (selectedOptions.value.length === 0) {
    return '当前没有已选城市，请从左侧搜索并添加城市或输入 IANA 时区。'
  }

  return '正在读取当前时间，请稍候。'
})

const hasResettableState = computed(() => Boolean(
  selectedOptions.value.length > 0
  || builtinQuery.value
  || customTimeZone.value
  || error.value,
))

/** 判断指定时区是否已经在当前城市列表中。 */
function isSelected(option: WorldTimeOption): boolean {
  return selectedOptions.value.some((selectedOption) => selectedOption.timeZone === option.timeZone)
}

/** 获取内置城市的目录元数据，自定义 IANA 时区不补充虚构的城市信息。 */
function getBuiltinDetails(option: WorldTimeOption): WorldTimeBuiltinOption | null {
  return option.source === 'builtin' ? option as WorldTimeBuiltinOption : null
}

/** 查找当前筛选结果中第一个尚未添加的内置城市。 */
function findFirstAvailableBuiltinIndex(): number {
  const index = builtinOptions.value.findIndex((option) => !isSelected(option))
  return index >= 0 ? index : 0
}

/** 将下拉菜单的键盘高亮重置到可添加的首个选项。 */
function resetBuiltinHighlight() {
  highlightedBuiltinIndex.value = findFirstAvailableBuiltinIndex()
}

/** 打开内置城市筛选下拉菜单并校正当前高亮项。 */
function openBuiltinDropdown() {
  isBuiltinDropdownOpen.value = true

  const highlightedOption = builtinOptions.value[highlightedBuiltinIndex.value]

  if (!highlightedOption || isSelected(highlightedOption)) {
    resetBuiltinHighlight()
  }
}

/** 关闭内置城市筛选下拉菜单。 */
function closeBuiltinDropdown() {
  isBuiltinDropdownOpen.value = false
}

/** 按方向键在尚未添加的内置城市之间移动下拉高亮。 */
function moveBuiltinHighlight(direction: 1 | -1) {
  const availableIndexes = builtinOptions.value.reduce<number[]>((indexes, option, index) => {
    if (!isSelected(option)) {
      indexes.push(index)
    }

    return indexes
  }, [])

  const firstAvailableIndex = availableIndexes[0]

  if (firstAvailableIndex === undefined) {
    return
  }

  const currentPosition = availableIndexes.indexOf(highlightedBuiltinIndex.value)
  const nextPosition = currentPosition < 0
    ? 0
    : (currentPosition + direction + availableIndexes.length) % availableIndexes.length

  highlightedBuiltinIndex.value = availableIndexes[nextPosition] ?? firstAvailableIndex
}

/** 处理城市搜索输入并打开下拉菜单。 */
function handleBuiltinQueryInput() {
  clearCurrentError()
  resetBuiltinHighlight()
  openBuiltinDropdown()
}

/** 处理内置城市下拉菜单的键盘导航和选择。 */
function handleBuiltinKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()

    if (!isBuiltinDropdownOpen.value) {
      openBuiltinDropdown()
      return
    }

    moveBuiltinHighlight(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (event.key === 'Enter' && isBuiltinDropdownOpen.value) {
    const option = highlightedBuiltinOption.value

    if (option && !isSelected(option)) {
      event.preventDefault()
      addBuiltinOption(option)
    }

    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeBuiltinDropdown()
  }
}

/** 在焦点离开城市下拉菜单时关闭菜单，保留菜单内部焦点移动。 */
function handleBuiltinFocusout(event: FocusEvent) {
  const nextTarget = event.relatedTarget as Node | null

  if (nextTarget && builtinCombobox.value?.contains(nextTarget)) {
    return
  }

  closeBuiltinDropdown()
}

/** 将当前选中时区按同一时间点格式化为实时结果。 */
function refreshWorldTime(now = Date.now()) {
  nowMilliseconds.value = now

  if (selectedOptions.value.length === 0) {
    snapshots.value = []
    error.value = null
    return
  }

  const nextSnapshots: WorldTimeSnapshot[] = []

  for (const option of selectedOptions.value) {
    const result = createWorldTimeSnapshot(option, now)

    if (!result.ok) {
      error.value = result.error
      return
    }

    nextSnapshots.push(result.value)
  }

  snapshots.value = nextSnapshots
  error.value = null
}

/** 将一个内置城市加入当前实时列表。 */
function addBuiltinOption(option: WorldTimeBuiltinOption) {
  const result = addWorldTimeOption(selectedOptions.value, option)

  if (!result.ok) {
    error.value = result.error
    return
  }

  selectedOptions.value = [...result.value]
  error.value = null
  resetBuiltinHighlight()

  if (nowMilliseconds.value !== null) {
    refreshWorldTime()
  }
}

/** 校验并将自定义 IANA 时区加入当前实时列表。 */
function addCustomTimeZone() {
  const optionResult = validateIanaTimeZone(customTimeZone.value)

  if (!optionResult.ok) {
    error.value = optionResult.error
    return
  }

  const result = addWorldTimeOption(selectedOptions.value, optionResult.value)

  if (!result.ok) {
    error.value = result.error
    return
  }

  selectedOptions.value = [...result.value]
  customTimeZone.value = ''
  error.value = null

  if (nowMilliseconds.value !== null) {
    refreshWorldTime()
  }
}

/** 从当前列表移除指定城市或自定义时区。 */
function removeOption(optionId: string) {
  selectedOptions.value = selectedOptions.value.filter((option) => option.id !== optionId)

  if (selectedOptions.value.length === 0) {
    snapshots.value = []
    nowMilliseconds.value = null
    error.value = null
    return
  }

  refreshWorldTime()
}

/** 清空当前选中城市、实时结果和错误，不恢复持久化状态。 */
function clearAll() {
  selectedOptions.value = []
  snapshots.value = []
  nowMilliseconds.value = null
  error.value = null
}

/** 清除搜索或输入变化对应的旧错误。 */
function clearCurrentError() {
  error.value = null
}

onMounted(() => {
  refreshWorldTime()
  refreshTimer = setInterval(() => refreshWorldTime(), 1000)
})

onUnmounted(() => {
  if (refreshTimer !== undefined) {
    clearInterval(refreshTimer)
  }
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split world-time-tool">
    <ToolInputPanel title="时区配置" description="从首都目录中选择城市，或输入 IANA 时区；时间在浏览器本地实时更新。">
      <div class="world-time-tool__catalog" aria-label="内置城市与首都目录">
        <div class="world-time-tool__section-heading">
          <span class="tool-field__label">选择城市 / 首都</span>
          <span class="world-time-tool__count">{{ builtinOptions.length }} 个匹配</span>
        </div>
        <div
          ref="builtinCombobox"
          class="world-time-tool__builtin-combobox"
          @focusout="handleBuiltinFocusout"
        >
          <label class="tool-field">
            <span class="tool-field__label">搜索城市或国家</span>
            <input
              v-model="builtinQuery"
              class="tool-input"
              type="search"
              autocomplete="off"
              placeholder="例如：伦敦、Japan、Europe/London"
              role="combobox"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-label="搜索城市或国家"
              :aria-expanded="isBuiltinDropdownOpen"
              :aria-controls="isBuiltinDropdownOpen && builtinOptions.length ? builtinListId : undefined"
              :aria-activedescendant="isBuiltinDropdownOpen && highlightedBuiltinOption ? `world-time-option-${highlightedBuiltinOption.id}` : undefined"
              @focus="openBuiltinDropdown"
              @input="handleBuiltinQueryInput"
              @keydown="handleBuiltinKeydown"
            >
          </label>

          <div
            v-if="isBuiltinDropdownOpen && builtinOptions.length"
            :id="builtinListId"
            class="world-time-tool__catalog-dropdown"
            role="listbox"
            aria-label="可添加城市和首都"
          >
            <button
              v-for="(option, index) in builtinOptions"
              :id="`world-time-option-${option.id}`"
              :key="option.id"
              type="button"
              role="option"
              class="world-time-tool__catalog-item"
              :data-highlighted="highlightedBuiltinIndex === index"
              :aria-selected="isSelected(option)"
              :aria-label="`${option.cityNameZh}，${option.cityNameEn}，${option.countryName}`"
              :disabled="isSelected(option)"
              @mouseenter="highlightedBuiltinIndex = index"
              @click="addBuiltinOption(option)"
            >
              <span class="world-time-tool__option-copy">
                <span class="world-time-tool__option-title">
                  <strong>{{ option.cityNameZh }}</strong>
                  <span>{{ option.cityNameEn }}</span>
                </span>
                <span class="world-time-tool__option-country">{{ option.countryName }}</span>
              </span>
              <span class="world-time-tool__catalog-status">{{ isSelected(option) ? '已添加' : '添加' }}</span>
            </button>
          </div>
          <p v-else-if="isBuiltinDropdownOpen" class="tool-note world-time-tool__empty-note">没有匹配的城市或首都。</p>
        </div>
      </div>

      <div class="world-time-tool__custom-field">
        <label class="tool-field">
          <span class="tool-field__label">自定义 IANA 时区</span>
          <input
            v-model="customTimeZone"
            class="tool-input"
            type="text"
            autocomplete="off"
            placeholder="例如：Pacific/Auckland"
            aria-label="自定义 IANA 时区"
            @input="clearCurrentError"
            @keydown.enter.prevent="addCustomTimeZone"
          >
        </label>
        <button type="button" class="button button--secondary" @click="addCustomTimeZone">添加时区</button>
      </div>
      <p class="tool-note">目录按英文名称首字母排序，支持联合国成员国及观察员国的首都；当前列表最多保留 12 个城市或时区。自定义时区只保留在当前页面。</p>

      <div class="world-time-tool__selected">
        <div class="world-time-tool__section-heading">
          <span class="tool-field__label">当前列表</span>
          <span class="world-time-tool__count">{{ selectedOptions.length }} / 12</span>
        </div>
        <div v-if="selectedOptions.length" class="world-time-tool__selected-list">
          <div v-for="option in selectedOptions" :key="option.id" class="world-time-tool__selected-item">
            <div class="world-time-tool__option-copy">
              <div class="world-time-tool__option-title">
                <strong>{{ option.label }}</strong>
                <span v-if="getBuiltinDetails(option)">{{ getBuiltinDetails(option)?.cityNameEn }}</span>
              </div>
              <div class="world-time-tool__option-meta">
                <span v-if="getBuiltinDetails(option)">{{ getBuiltinDetails(option)?.countryName }}</span>
                <code>{{ option.timeZone }}</code>
              </div>
            </div>
            <button
              type="button"
              class="button button--secondary button--small"
              :aria-label="`移除 ${option.label}`"
              @click="removeOption(option.id)"
            >
              移除
            </button>
          </div>
        </div>
        <p v-else class="tool-note world-time-tool__empty-note">列表为空，可以重新搜索并添加城市。</p>
      </div>

      <div class="tool-panel__actions">
        <ClearButton label="清空城市" :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="当前时间"
      :status="status"
      :error="error"
      :empty-text="emptyText"
      :preserve-content-on-error="snapshots.length > 0"
      aria-live="off"
    >
      <div v-if="snapshots.length" class="world-time-tool__snapshots">
        <article v-for="snapshot in snapshots" :key="snapshot.option.id" class="world-time-tool__snapshot">
          <header class="world-time-tool__snapshot-header">
            <div>
              <span class="world-time-tool__snapshot-source">
                {{ snapshot.option.source === 'builtin' ? '内置城市' : '自定义时区' }}
              </span>
              <h3>{{ snapshot.option.label }}</h3>
              <span v-if="getBuiltinDetails(snapshot.option)" class="world-time-tool__snapshot-location">
                {{ getBuiltinDetails(snapshot.option)?.cityNameEn }}
                ·
                {{ getBuiltinDetails(snapshot.option)?.countryName }}
              </span>
            </div>
            <button
              type="button"
              class="world-time-tool__remove-button"
              :aria-label="`移除 ${snapshot.option.label}`"
              @click="removeOption(snapshot.option.id)"
            >
              ×
            </button>
          </header>

          <div class="world-time-tool__clock">
            <span class="world-time-tool__date">{{ snapshot.localDate }}</span>
            <strong class="world-time-tool__time">{{ snapshot.localTime }}</strong>
            <span class="world-time-tool__weekday">{{ snapshot.weekday }}</span>
          </div>

          <dl class="world-time-tool__meta">
            <div>
              <dt>UTC 偏移</dt>
              <dd>{{ snapshot.utcOffset }}</dd>
            </div>
            <div>
              <dt>IANA 时区</dt>
              <dd>{{ snapshot.timeZone }}</dd>
            </div>
          </dl>
        </article>
      </div>
    </ToolResultPanel>
  </div>
</template>
