import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { titleKey: 'routes.login', public: true },
  },
  {
    path: '/welcome',
    name: 'Welcome',
    component: () => import('@/views/lingjing/Welcome.vue'),
    meta: { public: true, hidden: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/lingjing/Register.vue'),
    meta: { public: true, hidden: true },
  },
  {
    path: '/preflight',
    name: 'Preflight',
    component: () => import('@/views/lingjing/PreflightPage.vue'),
    meta: { hidden: true, requiresAuth: true, skipPreflight: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: { name: 'Chat' },
        meta: { hidden: true },
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { titleKey: 'routes.dashboard', icon: 'GridOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('@/views/chat/ChatPage.vue'),
        meta: { title: '对话', icon: 'ChatboxEllipsesOutline', gateway: 'openclaw', section: 'use' },
      },
      {
        path: 'sessions',
        name: 'Sessions',
        component: () => import('@/views/lingjing/SessionsPage.vue'),
        meta: { title: '历史', icon: 'ChatbubblesOutline', gateway: 'openclaw', section: 'use' },
      },
      {
        path: 'sessions-advanced',
        name: 'SessionsAdvanced',
        component: () => import('@/views/sessions/SessionsPage.vue'),
        meta: { title: '历史(高级)', icon: 'ChatbubblesOutline', gateway: 'openclaw', section: 'use', hidden: true },
      },
      {
        path: 'sessions/:key',
        name: 'SessionDetail',
        component: () => import('@/views/sessions/SessionDetailPage.vue'),
        meta: { titleKey: 'routes.sessionDetail', hidden: true },
      },
      {
        path: 'memory',
        name: 'Memory',
        component: () => import('@/views/memory/MemoryPage.vue'),
        meta: { titleKey: 'routes.memory', icon: 'BookOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'cron',
        name: 'Cron',
        component: () => import('@/views/lingjing/CronPage.vue'),
        meta: { title: '自动化任务', icon: 'CalendarOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'models',
        name: 'Models',
        component: () => import('@/views/lingjing/ModelsPage.vue'),
        meta: { title: '模型管理', icon: 'SparklesOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'channels',
        name: 'Channels',
        component: () => import('@/views/lingjing/ChannelsPage.vue'),
        meta: { title: '通信渠道', icon: 'GitNetworkOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'channels-advanced',
        name: 'ChannelsAdvanced',
        component: () => import('@/views/channels/ChannelsPage.vue'),
        meta: { title: '通信渠道(高级)', icon: 'GitNetworkOutline', gateway: 'openclaw', section: 'build', hidden: true },
      },
      {
        path: 'config',
        redirect: { name: 'Models' },
        meta: { hidden: true },
      },
      {
        path: 'skills',
        name: 'Skills',
        component: () => import('@/views/lingjing/SkillsPage.vue'),
        meta: { title: '技能广场', icon: 'ExtensionPuzzleOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'tools',
        redirect: { name: 'Skills' },
        meta: { hidden: true },
      },
      {
        path: 'system',
        name: 'System',
        component: () => import('@/views/system/SystemPage.vue'),
        meta: { titleKey: 'routes.system', icon: 'PulseOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'terminal',
        name: 'Terminal',
        component: () => import('@/views/terminal/TerminalPage.vue'),
        meta: { titleKey: 'routes.terminal', icon: 'TerminalOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'remote-desktop',
        name: 'RemoteDesktop',
        component: () => import('@/views/remote-desktop/RemoteDesktopPage.vue'),
        meta: { titleKey: 'routes.remoteDesktop', icon: 'DesktopOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'files',
        name: 'Files',
        component: () => import('@/views/files/FilesPage.vue'),
        meta: { titleKey: 'routes.files', icon: 'FolderOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'agents',
        name: 'Agents',
        component: () => import('@/views/lingjing/AgentsPage.vue'),
        meta: { title: '多智能体', icon: 'PeopleOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'workshop',
        name: 'AgentWorkshop',
        component: () => import('@/views/lingjing/AgentWorkshopPage.vue'),
        meta: { title: '智能体工坊', icon: 'ConstructOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'office',
        name: 'Office',
        component: () => import('@/views/office/OfficePage.vue'),
        meta: { titleKey: 'routes.office', icon: 'ConstructOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'myworld',
        name: 'MyWorld',
        component: () => import('@/views/lingjing/MyWorldPage.vue'),
        meta: { title: '虚拟公司', icon: 'BusinessOutline', gateway: 'openclaw', section: 'build' },
      },
      {
        path: 'backup',
        name: 'Backup',
        component: () => import('@/views/backup/BackupPage.vue'),
        meta: { titleKey: 'routes.backup', icon: 'ArchiveOutline', gateway: 'openclaw', hidden: true },
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('@/views/monitor/MonitorPage.vue'),
        meta: { titleKey: 'routes.monitor', icon: 'PulseOutline', hidden: true },
      },
      // v1.6: 所有 /hermes/* 路由统一走单 iframe (HermesEmbed.vue),
      // 嵌入 Hermes 原生 dashboard (9119). server 端 /api/hermes/embed/* 反向代理.
      // 删除 src/views/hermes/*.vue + src/views/lingjing/Hermes*.vue 共 20 个文件 (Task 9).
      // 旧 18 条独立路由统一走 wildcard, Hermes UI 由 Hermes daemon 自己维护.
      {
        path: 'hermes/:section(.*)?',
        name: 'HermesEmbed',
        component: () => import('@/views/hermes/HermesEmbed.vue'),
        meta: { title: 'Hermes', icon: 'GridOutline', gateway: 'hermes', section: 'use' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/lingjing/SettingsPage.vue'),
        meta: { title: '系统设置', icon: 'CogOutline', gateway: 'openclaw', section: 'system' },
      },
    ],
  },
]
