<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useWebSocketStore } from '@/stores/websocket'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { useLingjingBillingStore } from '@/stores/lingjing-billing'

const collapsed = ref(false)
const wsStore = useWebSocketStore()
const connStore = useHermesConnectionStore()
const billingStore = useLingjingBillingStore()
const route = useRoute()
const router = useRouter()

const isOpenClaw = computed(() => connStore.currentGateway === 'openclaw')

onMounted(async () => {
  // 如果用户直接访问 /hermes/* 但当前网关是 openclaw(或反之),
  // 顺着路由自动切换网关 —— 不要把用户重定向到默认页面,体验更顺。
  const routeGateway = route.meta?.gateway as 'openclaw' | 'hermes' | undefined
  if (routeGateway && routeGateway !== connStore.currentGateway) {
    await connStore.switchGateway(routeGateway)
  }
  // 显式连接对应后端(switchGateway 内部已经处理 disconnect 旧的,这里只管 connect)
  if (isOpenClaw.value) {
    wsStore.connect()
  } else {
    connStore.connect()
  }
  billingStore.startPolling()
})

watch(isOpenClaw, (val) => {
  if (val) {
    wsStore.connect()
    connStore.disconnect()
  } else {
    wsStore.disconnect()
    connStore.connect()
  }
  const currentGateway = val ? 'openclaw' : 'hermes'
  const routeGateway = route.meta?.gateway as string | undefined
  if (routeGateway && routeGateway !== currentGateway) {
    router.push(val ? '/' : '/hermes/chat')
  }
})

onUnmounted(() => {
  wsStore.disconnect()
  billingStore.stopPolling()
})
</script>

<template>
  <NLayout has-sider position="absolute" class="app-layout-root">
    <NLayoutSider
      class="app-layout-sider"
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="collapsed"
      show-trigger
      :native-scrollbar="false"
      style="height: 100vh;"
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <AppSidebar :collapsed="collapsed" />
    </NLayoutSider>

    <NLayout class="app-layout-main">
      <NLayoutHeader bordered class="app-layout-header">
        <AppHeader />
      </NLayoutHeader>

      <NLayoutContent
        class="app-layout-content"
        :native-scrollbar="false"
        content-style="padding: 16px 20px 20px;"
      >
        <div class="page-container">
          <RouterView v-slot="{ Component }">
            <transition name="fade" mode="out-in">
              <component :is="Component" />
            </transition>
          </RouterView>
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.app-layout-root {
  inset: 0;
  height: 100vh;
  overflow: hidden;
}

.app-layout-main {
  height: 100vh;
  overflow: hidden;
}

.app-layout-header {
  height: var(--header-height);
  padding: 0 20px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 12;
  background: var(--bg-card, #FFFFFF);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
}

/* 主内容区保持白色 —— 浅灰反而让大块留白看起来"内容缺失",
 * 白色让留白变成"留白"本身的呼吸感(Apple HIG 倡导的 negative space)。 */
.app-layout-content {
  height: calc(100vh - var(--header-height));
  background: #FFFFFF;
}

/* 深色模式:主内容区背景需要跟着切,否则白底会突兀 */
:root[data-theme='dark'] .app-layout-content {
  background: #18181B;
}

:root[data-theme='dark'] .app-layout-header {
  background: #1C1C1E;
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

/* dark mode 下 header 按钮图标用浅色,避免跟深背景融在一起看不见 */
:root[data-theme='dark'] .app-layout-header :deep(.n-button) {
  color: rgba(255, 255, 255, 0.85);
}

:root[data-theme='dark'] .app-layout-header :deep(.n-button:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #FFFFFF;
}

/* 让 RouterView 内的子页面自然撑满高度,empty state 自然垂直居中,
 * 不再上面一半内容、下面一半空白。子页面如果用 max-width 自己限制,
 * 这层 flex 也不影响。 */
.page-container {
  min-height: calc(100vh - var(--header-height) - 36px);
  display: flex;
  flex-direction: column;
}


:deep(.app-layout-content .n-layout-scroll-container) {
  height: 100%;
}
</style>
