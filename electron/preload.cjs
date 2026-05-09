const { contextBridge, ipcRenderer, safeStorage } = require('electron')

contextBridge.exposeInMainWorld('lingjing', {
  platform: process.platform,
  version: process.versions.electron,
  safeStorage: {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) =>
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(plain).toString('base64')
        : null,
    decrypt: (b64) => {
      if (!safeStorage.isEncryptionAvailable() || !b64) return null
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    },
  },
  /**
   * 用灵镜云端 API Token 自动配置本地两个 Gateway,让 OpenClaw / Hermes
   * 都走 api.aitoken.homes 云端,与"灵境云端"聊天共享同一余额。
   *
   * 入参:{ token: 'sk-xxx', baseUrl: 'https://api.aitoken.homes/v1' }
   * 出参:{ openclaw: 'ok'|'error'|'skipped', hermes: 'ok'|'error'|'skipped',
   *        message?: string }
   */
  configureLocalProviders: (params) =>
    ipcRenderer.invoke('lingjing:configure-local-providers', params),
  /**
   * 主进程绕过 CORS 直接拉 sk-xxx + 配 OpenClaw/Hermes(更可靠)。
   */
  autoConfigureViaMain: (params) =>
    ipcRenderer.invoke('lingjing:auto-configure-via-main', params),
  /**
   * 三方网关健康卡片用:返回本地 server / OpenClaw / Hermes 端口探活结果。
   */
  getGatewayStatus: () => ipcRenderer.invoke('lingjing:gateway-status'),
  /**
   * 网关挂了,UI 侧"重启"按钮调:which='openclaw'|'hermes'。
   */
  restartGateway: (which) => ipcRenderer.invoke('lingjing:gateway-restart', which),
  /**
   * 用户操作系统的默认浏览器打开 URL(只允许 http/https)。
   * 用在通信渠道教学链接、官方文档等场景。
   */
  openExternal: (url) => ipcRenderer.invoke('lingjing:open-external', url),
  /**
   * ClawHub 技能商城 —— 走 openclaw skills CLI 调用,Electron 主进程出锅。
   */
  skillsSearch: (params) => ipcRenderer.invoke('lingjing:skills-search', params),
  skillsInstall: (params) => ipcRenderer.invoke('lingjing:skills-install', params),
  skillsInfo: (params) => ipcRenderer.invoke('lingjing:skills-info', params),
  /**
   * 自动更新(electron-updater + GitHub Releases):
   *   checkForUpdate 立刻查最新版返回 { hasUpdate, currentVersion, latestVersion }
   *   downloadUpdate 触发下载,进度通过 onUpdateEvent 推
   *   installUpdate  下载完了重启安装
   *   onUpdateEvent  渲染端订阅 'available'|'progress'|'downloaded'|'error'
   */
  checkForUpdate: () => ipcRenderer.invoke('lingjing:check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('lingjing:download-update'),
  installUpdate: () => ipcRenderer.invoke('lingjing:install-update'),
  onUpdateEvent: (callback) => {
    const handler = (_event, evt) => callback(evt)
    ipcRenderer.on('lingjing:update-event', handler)
    return () => ipcRenderer.removeListener('lingjing:update-event', handler)
  },
  appVersion: () => ipcRenderer.invoke('lingjing:app-version'),
  /**
   * 错误日志 — 系统设置「错误日志」面板用,
   * 给用户复制完整日志反馈给开发者排查。
   */
  getErrorLogs: () => ipcRenderer.invoke('lingjing:get-error-logs'),
  openLogsFolder: () => ipcRenderer.invoke('lingjing:open-logs-folder'),
  /**
   * v1.2.3: 强制重启 OpenClaw daemon(杀旧 + 删旧 task + 重 spawn)。
   * 模型切换或诊断到 chat 卡死时调用。
   */
  restartOpenClaw: () => ipcRenderer.invoke('lingjing:openclaw-restart'),
  /**
   * v1.4: 诊断契约 — 一次拿全所有诊断信息(端口/task/进程/配置/日志)。
   * 给设置页「诊断」section 展示 + 一键复制 markdown 反馈。
   */
  diagnoseFull: () => ipcRenderer.invoke('lingjing:diagnose-full'),
  /**
   * v1.3.0: 自检 6 步,登录后逐步调用,失败可重试。
   * 每步返回 { ok, durationMs, message? } 结构。
   */
  preflight: {
    backendHealth: () => ipcRenderer.invoke('lingjing:preflight-backend-health'),
    cleanupStale: () => ipcRenderer.invoke('lingjing:preflight-cleanup-stale'),
    startOpenClaw: () => ipcRenderer.invoke('lingjing:preflight-start-openclaw'),
    configureProviders: (params) =>
      ipcRenderer.invoke('lingjing:preflight-configure-providers', params),
    testChat: () => ipcRenderer.invoke('lingjing:preflight-test-chat'),
    startHermes: () => ipcRenderer.invoke('lingjing:preflight-start-hermes'),
  },
  /**
   * 加载动画窗口:监听主进程推送的启动阶段文案(如"正在解压本地 AI 运行时...")。
   * 仅 loading.html 用,渲染端订阅后会拿到字符串文本。
   */
  onLoadingStage: (callback) => {
    const handler = (_event, text) => callback(text)
    ipcRenderer.on('lingjing:loading-stage', handler)
    return () => ipcRenderer.removeListener('lingjing:loading-stage', handler)
  },
  /**
   * 启动失败诊断:接收 { stage, message, logTail, logPath, paths } 显示给用户。
   */
  onLoadingDiagnostic: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('lingjing:loading-diagnostic', handler)
    return () => ipcRenderer.removeListener('lingjing:loading-diagnostic', handler)
  },
  /**
   * 窗口控制 — Win frame:false 时前端自画三个按钮调用
   */
  window: {
    minimize: () => ipcRenderer.invoke('lingjing:window-minimize'),
    toggleMaximize: () => ipcRenderer.invoke('lingjing:window-toggle-maximize'),
    close: () => ipcRenderer.invoke('lingjing:window-close'),
    isMaximized: () => ipcRenderer.invoke('lingjing:window-is-maximized'),
  },
})
