<script setup lang="ts">
import type { ToolError } from '~/core/tool-result'

defineProps<{
  error: ToolError
}>()
</script>

<template>
  <div class="tool-error" role="alert" aria-live="assertive">
    <strong class="tool-error__title">{{ error.message }}</strong>
    <p v-if="error.details" class="tool-error__details">{{ error.details }}</p>
  </div>
</template>
