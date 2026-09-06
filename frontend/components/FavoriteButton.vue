<script setup lang="ts">
const props = withDefaults(defineProps<{
  active: boolean
  showLabel?: boolean
}>(), {
  showLabel: false,
})

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <button
    type="button"
    class="favorite-button"
    :class="{
      'favorite-button--active': props.active,
      'favorite-button--labeled': props.showLabel,
    }"
    :aria-pressed="props.active"
    :aria-label="props.active ? '取消收藏' : '收藏工具'"
    :title="props.active ? '取消收藏' : '收藏工具'"
    @click="emit('toggle')"
  >
    <span aria-hidden="true">{{ props.active ? '★' : '☆' }}</span>
    <span v-if="props.showLabel">{{ props.active ? '已收藏' : '收藏' }}</span>
    <span v-else class="sr-only">{{ props.active ? '已收藏' : '收藏' }}</span>
  </button>
</template>
