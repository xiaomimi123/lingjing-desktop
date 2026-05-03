<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import {
  NSpin, NTag, NButton, NIcon, NEmpty, NModal, NInput, NSpace,
  NCollapse, NCollapseItem, useMessage, useDialog,
} from 'naive-ui'
import {
  CheckmarkCircleOutline, ConstructOutline, GitNetworkOutline,
  OpenOutline, RefreshOutline,
} from '@vicons/ionicons5'
import { useChannelManagementStore } from '@/stores/channel-management'

interface ChannelMeta {
  key: 'qqbot' | 'feishu' | 'dingtalk' | 'wecom' | 'openclaw-weixin' | 'telegram' | 'discord' | 'slack'
  label: string
  emoji: string         // 不是真 emoji,只是占位符方便识别
  description: string
  pluginPackages: string[]
  pluginIds: string[]
  accountFields: { key: string; label: string; placeholder?: string; hint?: string }[]
  accountSecretFields: { key: string; label: string; placeholder?: string }[]
  guideUrl: string
  guideLabel: string
}

const CHANNELS: ChannelMeta[] = [
  {
    key: 'qqbot',
    label: 'QQ',
    emoji: 'Q',
    description: '面向 QQ 群和私聊场景的官方机器人。',
    pluginPackages: ['@openclaw-china/qqbot'],
    pluginIds: ['qqbot'],
    accountFields: [
      { key: 'appId', label: 'App ID', placeholder: '从 QQ 开放平台获取' },
    ],
    accountSecretFields: [
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'sensitive,会加密保存' },
    ],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/qqbot/configuration.md',
    guideLabel: 'QQ 开放平台教学',
  },
  {
    key: 'feishu',
    label: '飞书',
    emoji: '飞',
    description: '字节系办公协作。支持群消息和私聊回调。',
    pluginPackages: ['@openclaw-china/feishu-china', '@openclaw/feishu'],
    pluginIds: ['feishu', 'feishu-china'],
    accountFields: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_xxxxxxxxxxxx' },
    ],
    accountSecretFields: [
      { key: 'appSecret', label: 'App Secret' },
      { key: 'verificationToken', label: 'Verification Token' },
      { key: 'encryptKey', label: 'Encrypt Key(可选)' },
    ],
    guideUrl: 'https://github.com/openclaw/openclaw/blob/main/docs/zh-CN/channels/feishu.md',
    guideLabel: '飞书开放平台教学',
  },
  {
    key: 'dingtalk',
    label: '钉钉',
    emoji: '钉',
    description: '阿里钉钉企业内机器人。',
    pluginPackages: ['@openclaw-china/dingtalk'],
    pluginIds: ['dingtalk'],
    accountFields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'dingxxxxxxxxxx' },
    ],
    accountSecretFields: [
      { key: 'clientSecret', label: 'Client Secret' },
    ],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/dingtalk/configuration.md',
    guideLabel: '钉钉开发者后台教学',
  },
  {
    key: 'wecom',
    label: '企业微信',
    emoji: '企',
    description: '企业微信应用号。',
    pluginPackages: ['@openclaw-china/wecom', '@openclaw-china/wecom-app'],
    pluginIds: ['wecom', 'wecom-app'],
    accountFields: [
      { key: 'corpId', label: 'Corp ID' },
      { key: 'agentId', label: 'Agent ID' },
    ],
    accountSecretFields: [
      { key: 'secret', label: 'App Secret' },
      { key: 'token', label: 'Token(可选)' },
    ],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/wecom/configuration.md',
    guideLabel: '企业微信后台教学',
  },
  {
    key: 'openclaw-weixin',
    label: '个人微信',
    emoji: '微',
    description: '通过 openclaw-weixin 插件接入个人微信。首次配置需在 CLI 扫码登录:`openclaw weixin login`。',
    pluginPackages: ['@openclaw-china/openclaw-weixin'],
    pluginIds: ['openclaw-weixin'],
    accountFields: [],
    accountSecretFields: [],
    guideUrl: 'https://github.com/BytePioneer-AI/openclaw-china/blob/main/doc/guides/weixin/configuration.md',
    guideLabel: '个人微信接入教学',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    emoji: 'T',
    description: '海外即时通讯主流。在 @BotFather 创建 Bot 后拿到 Token。',
    pluginPackages: ['@openclaw/telegram'],
    pluginIds: ['telegram'],
    accountFields: [],
    accountSecretFields: [
      { key: 'token', label: 'Bot Token', placeholder: '123456:ABC-DEF... 从 @BotFather' },
    ],
    guideUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    guideLabel: 'Telegram Bot 创建教学',
  },
  {
    key: 'discord',
    label: 'Discord',
    emoji: 'D',
    description: '海外社区主流。Discord Developer Portal 创建 Bot 后拿 Token。',
    pluginPackages: ['@openclaw/discord'],
    pluginIds: ['discord'],
    accountFields: [],
    accountSecretFields: [
      { key: 'token', label: 'Bot Token', placeholder: 'Bot xxx... 从 Developer Portal' },
    ],
    guideUrl: 'https://discord.com/developers/docs/quick-start/getting-started',
    guideLabel: 'Discord Bot 创建教学',
  },
  {
    key: 'slack',
    label: 'Slack',
    emoji: 'S',
    description: '企业团队协作。需要 Bot Token (xoxb-) + App Token (xapp-) 两个。',
    pluginPackages: ['@openclaw/slack'],
    pluginIds: ['slack'],
    accountFields: [],
    accountSecretFields: [
      { key: 'botToken', label: 'Bot Token (xoxb-)', placeholder: 'xoxb-...' },
      { key: 'appToken', label: 'App Token (xapp-)', placeholder: 'xapp-...' },
    ],
    guideUrl: 'https://api.slack.com/apps',
    guideLabel: 'Slack App 创建教学',
  },
]

const message = useMessage()
const dialog = useDialog()
const channelStore = useChannelManagementStore()

const installingKey = ref<string | null>(null)
const showModal = ref(false)
const modalChannel = ref<ChannelMeta | null>(null)
const formValues = ref<Record<string, string>>({})
const submitting = ref(false)

onMounted(async () => {
  try {
    await channelStore.refreshAll()
  } catch {
    // 网关连不上时安静失败,显示空状态
  }
})

interface CardState {
  pluginInstalled: boolean
  configured: boolean
  active: boolean // configured + plugin installed,认为是"运行中"
}

function cardState(meta: ChannelMeta): CardState {
  const channelKey = meta.key
  const pluginInstalled = channelStore.isPluginInstalled(meta.pluginPackages, {
    channelKey,
    pluginIds: meta.pluginIds,
  })
  const draft = channelStore.channelsDraft[channelKey]
  const configured = !!draft && Object.keys(draft).length > 0
  return {
    pluginInstalled,
    configured,
    active: pluginInstalled && configured,
  }
}

const cards = computed(() =>
  CHANNELS.map((meta) => ({
    meta,
    state: cardState(meta),
  })),
)

const installedCount = computed(() => cards.value.filter((c) => c.state.active).length)

async function handleInstall(meta: ChannelMeta) {
  installingKey.value = meta.key
  try {
    await channelStore.installChannelPlugin(meta.pluginPackages)
    message.success(`${meta.label} 插件已安装`)
    await channelStore.refreshAll()
  } catch (err: any) {
    message.error(`安装失败:${err?.message || '请检查 Gateway 是否在线'}`)
  } finally {
    installingKey.value = null
  }
}

function openConfig(meta: ChannelMeta) {
  modalChannel.value = meta
  // 预填:从 draft 里读已存在的 public field 值;secret 留空("●●●"占位由 input 的 placeholder 处理)
  const draft = channelStore.channelsDraft[meta.key] as Record<string, unknown> | undefined
  const accounts = draft?.accounts as Record<string, Record<string, unknown>> | undefined
  const account = accounts && Object.values(accounts)[0] // 取第一个 account
  const initial: Record<string, string> = {}
  for (const f of meta.accountFields) {
    initial[f.key] = (account?.[f.key] as string) || ''
  }
  for (const f of meta.accountSecretFields) {
    initial[f.key] = '' // 出于安全,secret 编辑时不预填,留空表示"不修改"
  }
  formValues.value = initial
  showModal.value = true
}

async function handleSubmit() {
  if (!modalChannel.value) return
  const meta = modalChannel.value
  const channelKey = meta.key

  // 验证非 secret 字段必填
  for (const f of meta.accountFields) {
    if (!formValues.value[f.key]?.trim()) {
      message.warning(`请填写「${f.label}」`)
      return
    }
  }

  submitting.value = true
  try {
    // 取 account id —— 默认用 main(单账号场景);多账号场景以后再加
    const accountId = 'main'

    // 写非 secret 字段
    for (const f of meta.accountFields) {
      channelStore.setAccountField(channelKey, accountId, f.key, formValues.value[f.key].trim())
    }

    // 标记渠道已启用
    channelStore.setChannelField(channelKey, 'enabled', true)

    // 写 secret(留空表示不修改,跳过)
    for (const f of meta.accountSecretFields) {
      const v = formValues.value[f.key].trim()
      if (v) {
        channelStore.setSecretUpdate({ channelKey, accountId, field: f.key }, v)
      }
    }

    // 保存 + 应用
    await channelStore.saveChannels({ apply: true })
    message.success(`${meta.label} 已配置并启用`)
    showModal.value = false
  } catch (err: any) {
    message.error(`保存失败:${err?.message || '请检查 Gateway 状态'}`)
  } finally {
    submitting.value = false
  }
}

function handleDisable(meta: ChannelMeta) {
  dialog.warning({
    title: '停用渠道',
    content: `停用 ${meta.label} 后,AI 将不再回复该平台的消息。配置数据保留,可随时重新启用。`,
    positiveText: '停用',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        channelStore.setChannelField(meta.key, 'enabled', false)
        await channelStore.saveChannels({ apply: true })
        message.success(`${meta.label} 已停用`)
      } catch (err: any) {
        message.error(err?.message || '停用失败')
      }
    },
  })
}

function openGuide(url: string) {
  // Electron 环境下走 shell.openExternal,否则普通窗口打开
  const bridge = (window as any).lingjing
  if (bridge?.openExternal) {
    bridge.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <div class="ling-channels">
    <header class="page-head">
      <div>
        <h1 class="page-title">通信渠道</h1>
        <p class="page-subtitle">
          让 AI 助手在 QQ / 飞书 / 钉钉 / 企业微信 上自动回复消息。已接入 {{ installedCount }} / {{ CHANNELS.length }} 个
        </p>
      </div>
    </header>

    <NSpin :show="channelStore.loading">
      <div class="channels-grid">
        <div
          v-for="card in cards"
          :key="card.meta.key"
          class="channel-card"
          :class="{
            'is-active': card.state.active,
            'is-installed': card.state.pluginInstalled && !card.state.active,
          }"
        >
          <div class="card-logo">{{ card.meta.emoji }}</div>
          <div class="card-body">
            <div class="card-name-row">
              <span class="card-name">{{ card.meta.label }}</span>
              <NTag
                v-if="card.state.active"
                size="small"
                :bordered="false"
                type="success"
                round
              >
                运行中
              </NTag>
              <NTag
                v-else-if="card.state.pluginInstalled"
                size="small"
                :bordered="false"
                round
              >
                未配置
              </NTag>
              <NTag
                v-else
                size="small"
                :bordered="false"
                round
              >
                未安装
              </NTag>
            </div>
            <p class="card-desc">{{ card.meta.description }}</p>
          </div>
          <div class="card-actions">
            <!-- 1) 未装插件 → 安装按钮 -->
            <NButton
              v-if="!card.state.pluginInstalled"
              type="primary"
              size="small"
              :loading="installingKey === card.meta.key"
              :disabled="installingKey === card.meta.key"
              @click="handleInstall(card.meta)"
            >
              <template #icon><NIcon><ConstructOutline /></NIcon></template>
              一键安装
            </NButton>
            <!-- 2) 已装 → 配置按钮 -->
            <NButton
              v-if="card.state.pluginInstalled"
              size="small"
              :type="card.state.active ? 'default' : 'primary'"
              @click="openConfig(card.meta)"
            >
              {{ card.state.active ? '重新配置' : '配置' }}
            </NButton>
            <!-- 3) 已装且运行中 → 多一个停用按钮 -->
            <NButton
              v-if="card.state.active"
              size="small"
              quaternary
              @click="handleDisable(card.meta)"
            >
              停用
            </NButton>
          </div>
        </div>
      </div>

      <!-- 帮助折叠区 -->
      <NCollapse class="help-collapse" arrow-placement="right">
        <NCollapseItem title="官方接入教学">
          <p class="help-desc">
            各平台的开发者凭证从对应官方控制台获取。点击下方链接查看图文教程。
          </p>
          <div class="help-list">
            <button
              v-for="meta in CHANNELS"
              :key="meta.key"
              class="help-link"
              @click="openGuide(meta.guideUrl)"
            >
              <NIcon size="14"><OpenOutline /></NIcon>
              <span>{{ meta.guideLabel }}</span>
            </button>
          </div>
        </NCollapseItem>
        <NCollapseItem title="高级:刷新/重启 Gateway">
          <NSpace :size="8">
            <NButton size="small" @click="channelStore.refreshAll().catch(() => {})">
              <template #icon><NIcon><RefreshOutline /></NIcon></template>
              刷新状态
            </NButton>
            <span class="help-tip">如插件状态显示不正确,点击刷新</span>
          </NSpace>
        </NCollapseItem>
      </NCollapse>
    </NSpin>

    <!-- 配置 Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalChannel ? `配置 ${modalChannel.label}` : ''"
      style="width: 480px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div v-if="modalChannel">
        <p class="modal-desc">
          填入开发者凭证,保存后自动应用。
          <button class="modal-guide" @click="openGuide(modalChannel.guideUrl)">
            <NIcon size="12"><OpenOutline /></NIcon>
            <span>查看教学</span>
          </button>
        </p>

        <div v-for="f in modalChannel.accountFields" :key="f.key" class="form-item">
          <label class="form-label">{{ f.label }}</label>
          <NInput
            v-model:value="formValues[f.key]"
            :placeholder="f.placeholder || ''"
            size="medium"
          />
          <p v-if="f.hint" class="form-hint">{{ f.hint }}</p>
        </div>

        <div v-for="f in modalChannel.accountSecretFields" :key="f.key" class="form-item">
          <label class="form-label">
            {{ f.label }}
            <span class="form-label-tip">(留空表示不修改)</span>
          </label>
          <NInput
            v-model:value="formValues[f.key]"
            type="password"
            show-password-on="click"
            :placeholder="f.placeholder || '●●●'"
            size="medium"
          />
        </div>
      </div>

      <template #footer>
        <div class="modal-footer">
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" :disabled="submitting" @click="showModal = false">取消</NButton>
            <NButton
              type="primary"
              size="medium"
              :loading="submitting"
              :disabled="!modalChannel"
              @click="handleSubmit"
            >
              保存并启用
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.ling-channels {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  margin-bottom: 22px;
}

.page-title {
  font-size: 22px;
  font-weight: 500;
  color: var(--n-text-color);
  margin: 0 0 6px;
  letter-spacing: -0.2px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
  max-width: 520px;
  line-height: 1.5;
}

/* 渠道卡片网格 */
.channels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 12px;
}

.channel-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.channel-card:hover {
  border-color: var(--n-text-color-3);
}

.channel-card.is-active {
  border-color: rgba(52, 199, 89, 0.4);
  background: rgba(52, 199, 89, 0.04);
}

:root[data-theme='dark'] .channel-card.is-active {
  border-color: rgba(52, 199, 89, 0.4);
  background: rgba(52, 199, 89, 0.06);
}

.channel-card.is-installed {
  border-color: rgba(255, 204, 0, 0.4);
  background: rgba(255, 204, 0, 0.04);
}

.card-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--n-text-color);
}

.channel-card.is-active .card-logo {
  background: rgba(52, 199, 89, 0.12);
  color: var(--n-success-color, #34C759);
}

.card-body {
  flex: 1;
  min-width: 0;
}

.card-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}

.card-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
}

.card-desc {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 帮助折叠 */
.help-collapse {
  margin-top: 26px;
  background: transparent;
}

.help-desc {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0 0 10px;
  line-height: 1.55;
}

.help-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
}

.help-link {
  background: var(--n-action-color);
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--n-text-color);
  font-family: inherit;
  text-align: left;
  transition: border-color 0.12s ease;
}

.help-link:hover {
  border-color: var(--n-text-color-3);
}

.help-link .n-icon {
  color: var(--n-text-color-disabled);
  flex-shrink: 0;
}

.help-tip {
  font-size: 12px;
  color: var(--n-text-color-3);
}

/* Modal 表单 */
.modal-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0 0 16px;
  line-height: 1.55;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.modal-guide {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--n-primary-color, #2080f0);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  font-family: inherit;
}

.modal-guide:hover {
  text-decoration: underline;
}

.form-item {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--n-text-color);
  margin-bottom: 6px;
}

.form-label-tip {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--n-text-color-disabled);
  margin-left: 6px;
}

.form-hint {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  margin: 4px 0 0;
}

.modal-footer {
  display: flex;
  width: 100%;
}
</style>
