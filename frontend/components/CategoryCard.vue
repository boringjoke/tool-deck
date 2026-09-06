<script setup lang="ts">
import type { ToolCategory } from '~/types/tool'

const props = defineProps<{
  category: ToolCategory
  toolCount: number
}>()
</script>

<template>
  <NuxtLink :to="`/categories/${props.category.slug}`" class="category-card">
    <div class="category-card__topline">
      <span class="category-card__index">{{ String(props.category.order).padStart(2, '0') }}</span>
      <span class="category-card__count">{{ props.toolCount }} 项可用</span>
    </div>
    <h3 class="category-card__title">{{ props.category.title }}</h3>
    <p class="category-card__description">{{ props.category.description }}</p>
    <span class="category-card__link">查看分类 <span aria-hidden="true">↗</span></span>
  </NuxtLink>
</template>
