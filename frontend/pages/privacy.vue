<script setup lang="ts">
usePublicSeo({
  title: '隐私说明 · Tool Deck',
  description: 'Tool Deck 的本地处理、存储和网络请求说明。',
  pathname: '/privacy',
})
</script>

<template>
  <section class="site-container page-section page-section--narrow">
    <div class="eyebrow">隐私说明</div>
    <h1 class="page-title">隐私说明</h1>
    <div class="privacy-callout">
      阶段 0 的工具基础能力优先在浏览器本地运行，不上传用户输入，也不接入统计、错误监控或反馈服务。
    </div>
    <div class="prose-block">
      <p>收藏和最近使用记录计划保存在当前浏览器本地，不依赖账号或后端数据库。</p>
      <p>具体工具上线前，会在工具页面说明处理方式、网络依赖和输入限制。</p>
    </div>
  </section>
</template>
