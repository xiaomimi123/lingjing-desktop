<script setup lang="ts">
/**
 * v1.6: 单 iframe wrapper, 嵌入 Hermes 原生 dashboard.
 * Vue Router 把 /hermes/* 全部路由到这个组件, 通过 $route.path 计算 iframe src.
 * server 端 /api/hermes/embed/* reverse proxy 到 http://127.0.0.1:9119/* + 注入 token.
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
// 路径映射:
//   /hermes        → /api/hermes/embed/
//   /hermes/chat   → /api/hermes/embed/chat
//   /hermes/foo/bar → /api/hermes/embed/foo/bar
const iframeSrc = computed(() => {
  const sub = route.path.replace(/^\/hermes/, '') || '/'
  return `/api/hermes/embed${sub}`
})
</script>

<template>
  <div class="hermes-embed-root">
    <iframe :src="iframeSrc" class="hermes-embed-frame" />
  </div>
</template>

<style scoped>
.hermes-embed-root {
  width: 100%;
  height: 100%;
  display: flex;
}
.hermes-embed-frame {
  flex: 1;
  border: none;
  width: 100%;
  height: 100%;
}
</style>
