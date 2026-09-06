<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  disabled?: boolean
}>(), {
  label: '清空',
  disabled: false,
})

const emit = defineEmits<{
  clear: []
}>()
</script>

<template>
  <button type="button" class="button button--secondary" :disabled="disabled" @click="emit('clear')">
    {{ label }}
  </button>
</template>
