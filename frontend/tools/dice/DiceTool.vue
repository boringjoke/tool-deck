<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { getSecureRandomSource } from '~/adapters/secure-random'
import {
  appendDiceRollHistory,
  DICE_DEFAULT_SIDES,
  rollDice,
  type DiceRoll,
  type DiceRollHistory,
} from '~/core/dice'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const ANIMATION_DURATION_MS = 420
const diceCountOptions = [1, 2, 3, 4, 5, 6] as const

const diceCount = ref(1)
const currentRoll = ref<DiceRoll | null>(null)
const pendingRoll = ref<DiceRoll | null>(null)
const history = ref<DiceRollHistory>([])
const error = ref<ToolError | null>(null)
const isRolling = ref(false)
let animationHandle: ReturnType<typeof setTimeout> | null = null

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (isRolling.value) {
    return 'processing'
  }

  return currentRoll.value ? 'success' : 'idle'
})

const resultContextLabel = computed(() => {
  if (isRolling.value && currentRoll.value) {
    return '上一次成功结果'
  }

  if (error.value && currentRoll.value) {
    return '上一次成功结果'
  }

  return currentRoll.value ? '本次结果' : '当前结果'
})

const resultStatusLabel = computed(() => {
  if (isRolling.value) {
    return '正在掷骰子…'
  }

  return currentRoll.value ? '已完成' : '等待投掷'
})

const displayedRoll = computed(() => pendingRoll.value ?? currentRoll.value)

const resultText = computed(() => {
  if (!currentRoll.value) {
    return ''
  }

  return [
    `本次结果：${formatRollValues(currentRoll.value)}`,
    `骰子数量：${currentRoll.value.values.length}`,
    `点数总和：${currentRoll.value.total}`,
  ].join('\n')
})

const hasResettableState = computed(() => Boolean(
  diceCount.value !== 1
  || currentRoll.value
  || history.value.length
  || error.value
  || isRolling.value,
))

/** 将一次投掷的骰子结果转换为可复制和展示的文本。 */
function formatRollValues(roll: DiceRoll): string {
  return roll.values.join('、')
}

/** 判断当前浏览器是否要求减少非必要动态效果。 */
function shouldReduceMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 清除尚未完成的骰子动画回调。 */
function clearAnimation() {
  if (animationHandle !== null) {
    clearTimeout(animationHandle)
    animationHandle = null
  }
}

/** 提交一次成功投掷的当前结果和会话历史。 */
function completeRoll(roll: DiceRoll, nextHistory: DiceRollHistory) {
  currentRoll.value = roll
  pendingRoll.value = null
  history.value = nextHistory
  isRolling.value = false
  animationHandle = null
}

/** 执行一次安全随机的六面骰子投掷并启动展示动画。 */
function roll() {
  if (isRolling.value) {
    return
  }

  const source = getSecureRandomSource()

  if (!source) {
    error.value = {
      code: 'crypto-unavailable',
      message: '当前浏览器没有可用的安全随机源，无法掷骰子。',
    }
    return
  }

  const rollResult = rollDice(diceCount.value, source, DICE_DEFAULT_SIDES)

  if (!rollResult.ok) {
    error.value = rollResult.error
    return
  }

  const historyResult = appendDiceRollHistory(history.value, rollResult.value)

  if (!historyResult.ok) {
    error.value = historyResult.error
    return
  }

  error.value = null
  pendingRoll.value = rollResult.value
  isRolling.value = true
  clearAnimation()

  if (shouldReduceMotion()) {
    completeRoll(rollResult.value, historyResult.value)
    return
  }

  animationHandle = setTimeout(() => {
    completeRoll(rollResult.value, historyResult.value)
  }, ANIMATION_DURATION_MS)
}

/** 清除骰子数量、当前结果、会话历史和错误状态。 */
function clearAll() {
  clearAnimation()
  diceCount.value = 1
  currentRoll.value = null
  pendingRoll.value = null
  history.value = []
  error.value = null
  isRolling.value = false
}

/** 清除骰子数量变化后不再适用的当前错误提示。 */
function clearInputError() {
  error.value = null
}

onBeforeUnmount(() => {
  clearAnimation()
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split dice-tool">
    <ToolInputPanel title="掷骰子" description="使用浏览器安全随机源在本地生成标准六面骰子结果，不会上传或保存投掷记录。">
      <div class="dice-tool__intro">
        <span class="dice-tool__eyebrow">随机互动</span>
        <p>选择一次投掷的骰子数量，点击按钮生成每枚骰子的点数和本次总和。</p>
      </div>

      <label class="tool-field dice-tool__count-field">
        <span class="tool-field__label">骰子数量</span>
        <select v-model.number="diceCount" class="tool-input" :disabled="isRolling" aria-label="骰子数量" @change="clearInputError">
          <option v-for="option in diceCountOptions" :key="option" :value="option">
            {{ option }} 枚
          </option>
        </select>
      </label>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isRolling" @click="roll">
          {{ isRolling ? '掷骰子中…' : '掷骰子' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="掷骰子结果"
      :status="status"
      :error="error"
      aria-live="off"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      :empty-text="''"
    >
      <div class="dice-tool__result" :aria-busy="isRolling">
        <template v-if="displayedRoll">
          <div class="dice-tool__result-heading">
            <span class="dice-tool__result-label">{{ resultContextLabel }}</span>
            <strong>{{ resultStatusLabel }}</strong>
          </div>

          <ol class="dice-tool__dice-list" aria-label="本次骰子结果">
            <li
              v-for="(value, index) in displayedRoll.values"
              :key="`${index}-${value}`"
              class="dice-tool__die"
              :class="{ 'dice-tool__die--rolling': isRolling }"
              :aria-label="`第 ${index + 1} 枚骰子：${value}`"
            >
              <span class="dice-tool__die-caption">D{{ displayedRoll.sides }} · {{ index + 1 }}</span>
              <strong>{{ value }}</strong>
            </li>
          </ol>

          <div class="dice-tool__total">
            <span>点数总和</span>
            <output :aria-label="`点数总和 ${displayedRoll.total}`">{{ displayedRoll.total }}</output>
          </div>

          <p class="dice-tool__accessible-result" aria-live="polite">
            {{ isRolling ? '正在掷骰子，请稍候。' : `本次结果为${formatRollValues(displayedRoll)}，点数总和为${displayedRoll.total}。` }}
          </p>
        </template>

        <div v-else class="dice-tool__empty">
          <span class="dice-tool__result-label">当前结果</span>
          <strong>点击“掷骰子”开始</strong>
          <p>结果会以文本和骰子面牌同时显示。</p>
        </div>

        <section v-if="history.length" class="dice-tool__history" aria-labelledby="dice-history-title">
          <div class="dice-tool__history-header">
            <h3 id="dice-history-title">最近投掷</h3>
            <span>最多保留 10 次</span>
          </div>
          <ol class="dice-tool__history-list">
            <li v-for="(rollRecord, index) in history" :key="`${index}-${rollRecord.total}-${formatRollValues(rollRecord)}`">
              <span>第 {{ history.length - index }} 条</span>
              <strong>{{ formatRollValues(rollRecord) }}</strong>
              <span>总和 {{ rollRecord.total }}</span>
            </li>
          </ol>
        </section>
      </div>

      <template #actions>
        <CopyButton :text="resultText" label="复制本次结果" :disabled="!currentRoll" />
      </template>
    </ToolResultPanel>
  </div>
</template>
