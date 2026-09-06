<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '输入',
  description: '',
})
</script>

<template>
  <section class="tool-panel tool-input-panel">
    <header class="tool-panel__header">
      <h2 class="tool-panel__title">{{ title }}</h2>
      <p v-if="description" class="tool-panel__description">{{ description }}</p>
    </header>
    <div class="tool-panel__body">
      <slot />
    </div>
  </section>
</template>
