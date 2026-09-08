<script setup lang="ts">
defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
  }
}>()

useSeoMeta({
  title: '页面不存在 · Tool Deck',
  description: '页面不存在或尚未启用。',
  robots: 'noindex, nofollow',
})

/** 返回站点首页。 */
function returnHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <section class="site-container error-page">
    <div class="error-page__code">{{ error.statusCode || 404 }}</div>
    <h1 class="page-title">找不到这个页面</h1>
    <p class="page-lead">页面不存在或尚未启用，请返回 Tool Deck 首页。</p>
    <button type="button" class="button button--primary" @click="returnHome">回到工具台</button>
  </section>
</template>
