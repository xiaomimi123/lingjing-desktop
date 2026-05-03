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
})
