<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { getSecureRandomSource } from '~/adapters/secure-random'
import {
  createCoinFlipStatistics,
  flipCoin,
  recordCoinFlip,
  type CoinFlipStatistics,
  type CoinSide,
} from '~/core/coin-flip'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const ANIMATION_DURATION_MS = 480

const result = ref<CoinSide | null>(null)
const statistics = ref<CoinFlipStatistics>(createCoinFlipStatistics())
const error = ref<ToolError | null>(null)
const isFlipping = ref(false)
let animationHandle: ReturnType<typeof setTimeout> | null = null

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  if (isFlipping.value) {
    return 'processing'
  }

  return result.value ? 'success' : 'idle'
})

const displayResultLabel = computed(() => {
  if (isFlipping.value) {
    return '正在抛掷…'
  }

  if (result.value) {
    return getCoinSideLabel(result.value)
  }

  return '等待抛掷'
})

const resultContextLabel = computed(() => {
  if (error.value && result.value) {
    return '上一次成功结果'
  }

  return result.value ? '本次结果' : '当前结果'
})

const resultText = computed(() => {
  if (!result.value) {
    return ''
  }

  return [
    `当前结果：${getCoinSideLabel(result.value)}`,
    `总次数：${statistics.value.total}`,
    `正面：${statistics.value.heads}`,
    `反面：${statistics.value.tails}`,
  ].join('\n')
})

const hasResettableState = computed(() => Boolean(
  result.value
  || statistics.value.total
  || error.value
  || isFlipping.value,
))

/** 将核心硬币结果转换为页面显示文本。 */
function getCoinSideLabel(side: CoinSide): string {
  return side === 'heads' ? '正面' : '反面'
}

/** 判断当前浏览器是否要求减少非必要动态效果。 */
function shouldReduceMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 取消尚未完成的页面动画回调。 */
function clearAnimation() {
  if (animationHandle !== null) {
    clearTimeout(animationHandle)
    animationHandle = null
  }
}

/** 完成本次抛掷并提交结果和连抛统计。 */
function completeFlip(side: CoinSide, nextStatistics: CoinFlipStatistics) {
  result.value = side
  statistics.value = nextStatistics
  isFlipping.value = false
  animationHandle = null
}

/** 使用浏览器安全随机源发起一次抛硬币操作。 */
function flip() {
  if (isFlipping.value) {
    return
  }

  const source = getSecureRandomSource()

  if (!source) {
    error.value = {
      code: 'crypto-unavailable',
      message: '当前浏览器没有可用的安全随机源，无法抛硬币。',
    }
    return
  }

  const flipResult = flipCoin(source)

  if (!flipResult.ok) {
    error.value = flipResult.error
    return
  }

  const statisticsResult = recordCoinFlip(statistics.value, flipResult.value)

  if (!statisticsResult.ok) {
    error.value = statisticsResult.error
    return
  }

  error.value = null
  isFlipping.value = true
  clearAnimation()

  if (shouldReduceMotion()) {
    completeFlip(flipResult.value, statisticsResult.value)
    return
  }

  animationHandle = setTimeout(() => {
    completeFlip(flipResult.value, statisticsResult.value)
  }, ANIMATION_DURATION_MS)
}

/** 清空当前结果、连抛统计和错误状态。 */
function clearAll() {
  clearAnimation()
  result.value = null
  statistics.value = createCoinFlipStatistics()
  error.value = null
  isFlipping.value = false
}

onBeforeUnmount(() => {
  clearAnimation()
})
</script>

<template>
  <div class="tool-workspace tool-workspace--split coin-flip-tool">
    <ToolInputPanel title="抛硬币" description="使用浏览器安全随机源完成本地抛掷，不会上传或保存结果。">
      <div class="coin-flip-tool__intro">
        <span class="coin-flip-tool__eyebrow">随机决策</span>
        <p>点击一次抛掷一枚硬币，再次点击会替换当前结果并累计本次页面会话的统计。</p>
      </div>

      <div class="tool-panel__actions">
        <button type="button" class="button button--primary" :disabled="isFlipping" @click="flip">
          {{ isFlipping ? '抛掷中…' : result ? '再抛一次' : '抛一次' }}
        </button>
        <ClearButton :disabled="!hasResettableState" @clear="clearAll" />
      </div>
    </ToolInputPanel>

    <ToolResultPanel
      title="抛硬币结果"
      :status="status"
      :error="error"
      aria-live="off"
      :show-content-on-idle="true"
      :show-content-on-processing="true"
      :preserve-content-on-error="true"
      :empty-text="''"
    >
      <div class="coin-flip-tool__result" :aria-busy="isFlipping">
        <div
          class="coin-flip-tool__coin"
          :class="{
            'coin-flip-tool__coin--flipping': isFlipping,
            'coin-flip-tool__coin--tails': result === 'tails',
          }"
          aria-hidden="true"
        >
          <span class="coin-flip-tool__coin-face coin-flip-tool__coin-face--heads">正面</span>
          <span class="coin-flip-tool__coin-face coin-flip-tool__coin-face--tails">反面</span>
        </div>

        <div class="coin-flip-tool__result-copy">
          <span class="coin-flip-tool__result-label">{{ resultContextLabel }}</span>
          <strong>{{ displayResultLabel }}</strong>
        </div>

        <dl class="coin-flip-tool__statistics" aria-label="连抛统计">
          <div>
            <dt>总次数</dt>
            <dd>{{ statistics.total }}</dd>
          </div>
          <div>
            <dt>正面</dt>
            <dd>{{ statistics.heads }}</dd>
          </div>
          <div>
            <dt>反面</dt>
            <dd>{{ statistics.tails }}</dd>
          </div>
        </dl>

        <p v-if="result" class="coin-flip-tool__accessible-result" aria-live="polite">
          {{ error ? `上一次结果为${getCoinSideLabel(result)}。` : `本次结果为${getCoinSideLabel(result)}。` }}
        </p>
      </div>

      <template #actions>
        <CopyButton :text="resultText" label="复制结果" :disabled="!result" />
      </template>
    </ToolResultPanel>
  </div>
</template>
