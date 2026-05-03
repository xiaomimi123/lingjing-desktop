<script setup lang="ts">
import { h, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NMenu, NText, NIcon, NDivider, NTooltip } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  BookOutline,
  CalendarOutline,
  SparklesOutline,
  GitNetworkOutline,
  ExtensionPuzzleOutline,
  CogOutline,
  PulseOutline,
  FolderOutline,
  PeopleOutline,
  BusinessOutline,
  StorefrontOutline,
  ConstructOutline,
  TerminalOutline,
  DesktopOutline,
  ArchiveOutline,
  SettingsOutline,
  CodeSlashOutline,
  CloudOutline,
  WalletOutline,
  PersonCircleOutline,
  LogOutOutline,
} from '@vicons/ionicons5'
import { routes } from '@/router/routes'
import { useHermesConnectionStore } from '@/stores/hermes/connection'
import { useAuthStore } from '@/stores/auth'
import { useWebSocketStore } from '@/stores/websocket'
import { useLingjingBillingStore } from '@/stores/lingjing-billing'

defineProps<{ collapsed: boolean }>()

const route = useRoute()
const router = useRouter()
const connStore = useHermesConnectionStore()
const authStore = useAuthStore()
const wsStore = useWebSocketStore()
const billingStore = useLingjingBillingStore()

const iconMap: Record<string, unknown> = {
  GridOutline,
  ChatboxEllipsesOutline,
  ChatbubblesOutline,
  BookOutline,
  CalendarOutline,
  SparklesOutline,
  GitNetworkOutline,
  ExtensionPuzzleOutline,
  CogOutline,
  PulseOutline,
  FolderOutline,
  PeopleOutline,
  BusinessOutline,
  StorefrontOutline,
  ConstructOutline,
  TerminalOutline,
  DesktopOutline,
  ArchiveOutline,
  SettingsOutline,
  CodeSlashOutline,
  CloudOutline,
}

function renderIcon(iconName: string) {
  const icon = iconMap[iconName]
  if (!icon) return undefined
  return () => h(NIcon, null, { default: () => h(icon as any) })
}

interface SectionDef {
  key: string
  label: string
}

const SECTIONS: SectionDef[] = [
  { key: 'use', label: '使用' },
  { key: 'build', label: '构建' },
  { key: 'system', label: '系统' },
]

const menuOptions = computed<MenuOption[]>(() => {
  const mainRoute = routes.find((r) => r.path === '/')
  if (!mainRoute?.children) return []

  const currentGateway = connStore.currentGateway
  const visible = mainRoute.children.filter((child) => {
    if (child.meta?.hidden) return false
    const gateway = child.meta?.gateway as string | undefined
    return gateway === currentGateway
  })

  // 把可见路由按 section 分组(默认 'use')
  const grouped = new Map<string, typeof visible>()
  for (const child of visible) {
    const section = (child.meta?.section as string | undefined) || 'use'
    if (!grouped.has(section)) grouped.set(section, [])
    grouped.get(section)!.push(child)
  }

  const opts: MenuOption[] = []
  for (const sec of SECTIONS) {
    const items = grouped.get(sec.key)
    if (!items || items.length === 0) continue
    opts.push({
      type: 'group',
      label: sec.label,
      key: `__group_${sec.key}`,
      children: items.map((child) => ({
        label: child.meta?.title || (child.meta?.titleKey as string),
        key: child.name as string,
        icon: child.meta?.icon ? renderIcon(child.meta.icon as string) : undefined,
      })),
    })
  }

  // 收集没匹配 section 的(未来兜底)
  for (const [secKey, items] of grouped) {
    if (SECTIONS.find((s) => s.key === secKey)) continue
    if (!items.length) continue
    opts.push({
      type: 'group',
      label: secKey,
      key: `__group_${secKey}`,
      children: items.map((child) => ({
        label: child.meta?.title || (child.meta?.titleKey as string),
        key: child.name as string,
        icon: child.meta?.icon ? renderIcon(child.meta.icon as string) : undefined,
      })),
    })
  }

  return opts
})

const activeKey = computed(() => route.name as string)

function handleSelect(key: string) {
  router.push({ name: key })
}

const balance = computed(() => billingStore.balanceUsd)
const memberId = computed(() => authStore.memberId)

function goSettings() {
  router.push({ name: 'Settings' })
}

async function handleLogout() {
  wsStore.disconnect()
  await authStore.logout()
  router.push({ name: 'Login' })
}
</script>

<template>
  <div class="lingjing-sidebar">
    <div class="brand-area" :class="{ 'brand-area-collapsed': collapsed }">
      <div class="app-logo">
        <!-- Logo badge: 圆形渐变背景 + 内部'灵'字白色 -->
        <div class="logo-mark" aria-hidden="true">
          <span class="logo-mark-glyph">灵</span>
        </div>
        <span v-if="!collapsed" class="logo-text">境</span>
      </div>
    </div>

    <div class="menu-scroll">
      <NMenu
        :value="activeKey"
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        :options="menuOptions"
        :indent="20"
        @update:value="handleSelect"
      />
    </div>

    <NDivider class="account-divider" />

    <div class="account-area" :class="{ 'account-area-collapsed': collapsed }">
      <template v-if="!collapsed">
        <div class="account-row info">
          <NIcon size="16" class="row-icon"><WalletOutline /></NIcon>
          <span class="row-label">余额</span>
          <span class="row-value">$ {{ balance }}</span>
        </div>

        <div class="account-row info">
          <NIcon size="16" class="row-icon"><PersonCircleOutline /></NIcon>
          <span class="row-label">编号</span>
          <span class="row-value">NO. {{ memberId }}</span>
        </div>

        <button class="account-row action" @click="handleLogout">
          <NIcon size="16" class="row-icon"><LogOutOutline /></NIcon>
          <span class="row-label">退出登录</span>
        </button>
      </template>

      <template v-else>
        <NTooltip placement="right">
          <template #trigger>
            <button class="icon-only-btn" @click="handleLogout">
              <NIcon size="18"><LogOutOutline /></NIcon>
            </button>
          </template>
          退出登录
        </NTooltip>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* === 第二阶段:对齐 openclaw-key 的 Apple 极简风格 ===
 * 背景 #F5F5F7、4px 网格、border-subtle 极轻分隔线、克制配色 */
.lingjing-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #F5F5F7;
  border-right: 0.5px solid rgba(0, 0, 0, 0.06);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC',
               'Helvetica Neue', 'Noto Sans SC', 'Segoe UI',
               'Microsoft YaHei', sans-serif;
}

.brand-area {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 16px 16px 12px;
  height: auto;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 4px;
}

.brand-area-collapsed {
  justify-content: center;
  padding: 16px 0 12px;
}

/* Logo: 参考 openclaw-key 的 Apple 极简风格 —— 纯黑圆角方块 + "灵"字白色,
 * 旁边紧贴"境"字。无渐变、无阴影、无 hover 抬升,跟 openclaw-key brand-row 一致。 */
.app-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.logo-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1D1D1F;
  color: #fff;
}

.logo-mark-glyph {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  letter-spacing: 0;
  line-height: 1;
}

.logo-text {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--n-text-color, #1D1D1F);
  line-height: 1;
}

.menu-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px 0;
  background: transparent;
}

/* group label —— openclaw-key 风:tertiary 灰、11.5px、克制 */
.menu-scroll :deep(.n-menu-item-group .n-menu-item-group-title) {
  padding-left: 12px;
  padding-right: 8px;
  font-size: 11.5px;
  letter-spacing: 0.05em;
  color: #86868B;
  font-weight: 500;
  text-transform: none;
  margin-top: 12px;
  margin-bottom: 4px;
  height: 24px;
  line-height: 24px;
}

/* 菜单项 —— 紧凑 + 圆角 6 + Apple 风浅 hover */
.menu-scroll :deep(.n-menu-item) {
  height: 34px;
  margin: 1px 0;
}

.menu-scroll :deep(.n-menu-item-content) {
  padding-left: 12px !important;
  padding-right: 12px !important;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 400;
  transition: background 0.12s ease;
}

.menu-scroll :deep(.n-menu-item-content:hover) {
  background: rgba(0, 0, 0, 0.04);
}

.menu-scroll :deep(.n-menu-item-content--selected) {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #1D1D1F !important;
  font-weight: 500;
}

.menu-scroll :deep(.n-menu-item-content--selected::before) {
  display: none; /* 关掉 NMenu 默认左侧蓝色高亮条,改用整块背景 */
}

.menu-scroll :deep(.n-menu-item-content__icon) {
  margin-right: 10px !important;
  font-size: 16px !important;
  opacity: 0.72;
}

.account-divider {
  display: none; /* 由 .account-area 自带的 border-top 提供分隔,不再需要外部 divider */
}

/* 账号区:openclaw-key .account-card 风格 —— 顶部 0.5px 极细分隔线 */
.account-area {
  padding: 12px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
}

.account-area-collapsed {
  align-items: center;
  padding: 12px 0 16px;
  gap: 4px;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: #6E6E73; /* secondary 文本,克制 */
  width: 100%;
  background: transparent;
  border: none;
  cursor: default;
  text-align: left;
  font-family: inherit;
  letter-spacing: 0;
}

.account-row.action {
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  color: #1D1D1F; /* 操作项用主文本色,跟 info 项做层次区分 */
}

.account-row.action:hover {
  background: rgba(0, 0, 0, 0.04);
}

.account-row.action:active {
  background: rgba(0, 0, 0, 0.06);
}

.row-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.row-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 400;
}

.row-value {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: #1D1D1F; /* 数值用主文本色,在 secondary label 旁显眼 */
  font-weight: 500;
}

/* 余额数值用 openclaw-key 的 brand-money 金色作点缀 */
.account-row.info:first-child .row-value {
  color: #B7791F;
}

.icon-only-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--n-text-color);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 2px 0;
  transition: background 0.12s ease;
}

.icon-only-btn:hover {
  background: var(--n-color-hover, rgba(0, 0, 0, 0.04));
}

/* ============== 深色模式覆盖 ==============
 * 浅色那套 hardcode 颜色(#F5F5F7 / #1D1D1F / #86868B / #B7791F 等)
 * 在 dark mode 下不响应 NaiveUI theme 切换。下面用 :root[data-theme='dark']
 * 选择器为 dark mode 重写一组配色,跟浅色形成镜像。 */
:root[data-theme='dark'] .lingjing-sidebar {
  background: #1C1C1E;
  border-right-color: rgba(255, 255, 255, 0.08);
}

:root[data-theme='dark'] .brand-area {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

:root[data-theme='dark'] .logo-mark {
  background: #FFFFFF;
}

:root[data-theme='dark'] .logo-mark-glyph {
  color: #1D1D1F;
}

:root[data-theme='dark'] .logo-text {
  color: #FFFFFF;
}

:root[data-theme='dark'] .menu-scroll :deep(.n-menu-item-group .n-menu-item-group-title) {
  color: #98989D;
}

:root[data-theme='dark'] .menu-scroll :deep(.n-menu-item-content:hover) {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme='dark'] .menu-scroll :deep(.n-menu-item-content--selected) {
  background: rgba(255, 255, 255, 0.10) !important;
  color: #FFFFFF !important;
}

:root[data-theme='dark'] .account-area {
  border-top-color: rgba(255, 255, 255, 0.08);
}

:root[data-theme='dark'] .account-row {
  color: #98989D;
}

:root[data-theme='dark'] .account-row.action {
  color: #FFFFFF;
}

:root[data-theme='dark'] .account-row.action:hover {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme='dark'] .account-row.action:active {
  background: rgba(255, 255, 255, 0.10);
}

:root[data-theme='dark'] .row-value {
  color: #FFFFFF;
}

/* 余额仍然用金色,dark mode 下稍亮一点 */
:root[data-theme='dark'] .account-row.info:first-child .row-value {
  color: #FBBF24;
}
</style>
