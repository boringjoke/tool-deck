<script setup lang="ts">
import { ref } from 'vue'
import { copyText } from '~/adapters/clipboard'

const props = withDefaults(defineProps<{
  text: string
  label?: string
  disabled?: boolean
}>(), {
  label: '复制结果',
  disabled: false,
})

const feedback = ref('')
const isWorking = ref(false)

async function handleCopy() {
  if (props.disabled || !props.text || isWorking.value) {
    return
  }

  isWorking.value = true
  const result = await copyText(props.text)
  feedback.value = result.message
  isWorking.value = false
}
</script>

<template>
  <span class="tool-action-with-feedback">
    <button
      type="button"
      class="button button--secondary"
      :disabled="props.disabled || !props.text || isWorking"
      @click="handleCopy"
    >
      {{ isWorking ? '复制…' : label }}
    </button>
    <span v-if="feedback" class="tool-action-feedback" role="status">{{ feedback }}</span>
  </span>
</template>
