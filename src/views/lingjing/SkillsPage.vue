<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  NInput, NSwitch, NSpin, NTag, NIcon, NEmpty, NButton, NModal, NSpace,
  NRadioGroup, NRadioButton, NTabs, NTabPane, useMessage,
} from 'naive-ui'
import {
  SearchOutline, OpenOutline, CopyOutline, AlertCircleOutline,
  CheckmarkCircle, RefreshOutline, ConstructOutline, CloudDownloadOutline,
  StorefrontOutline, FlashOutline,
} from '@vicons/ionicons5'
import { useWebSocketStore } from '@/stores/websocket'
import type { Skill } from '@/api/types'

type FilterMode = 'all' | 'enabled' | 'needs-deps' | 'disabled'

interface ClawHubResult {
  slug: string
  displayName: string
  summary: string
  version: string | null
  updatedAt: number
  score: number
}

const message = useMessage()
const wsStore = useWebSocketStore()

const skills = ref<Skill[]>([])
const loading = ref(false)
const lastError = ref('')
const search = ref('')
const filterMode = ref<FilterMode>('all')
const togglingName = ref<string | null>(null)

// 详情 modal
const showDetail = ref(false)
const detailSkill = ref<Skill | null>(null)

// ============ 技能商城 ============
const tabValue = ref<'mine' | 'mall'>('mine')
const mallQuery = ref('')
const mallResults = ref<ClawHubResult[]>([])
const mallSearching = ref(false)
const mallError = ref('')
const installingSlug = ref<string | null>(null)
const HOT_KEYWORDS = ['github', 'note', 'browser', 'database', 'docker', 'memory', 'web', 'pdf']

const installedSlugs = computed(() => new Set(skills.value.map((s) => s.name)))

let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    void searchMall()
  }, 350)
}

async function searchMall() {
  const bridge = (window as any).lingjing
  if (!bridge?.skillsSearch) {
    mallError.value = '请重启灵境应用以启用技能商城(主进程未注入)'
    return
  }
  mallSearching.value = true
  mallError.value = ''
  try {
    const r = await bridge.skillsSearch({ query: mallQuery.value, limit: 30 })
    if (!r?.ok) {
      mallError.value = r?.message || '搜索失败'
      mallResults.value = []
      return
    }
    mallResults.value = (r.results || []) as ClawHubResult[]
  } catch (err: any) {
    mallError.value = err?.message || '搜索失败'
    mallResults.value = []
  } finally {
    mallSearching.value = false
  }
}

async function installFromMall(item: ClawHubResult) {
  const bridge = (window as any).lingjing
  if (!bridge?.skillsInstall) {
    message.error('请重启灵境应用以启用安装功能')
    return
  }
  installingSlug.value = item.slug
  try {
    const r = await bridge.skillsInstall({ slug: item.slug })
    if (!r?.ok) {
      message.error(r?.message || '安装失败')
      return
    }
    message.success(`${item.displayName} 已安装`)
    // 刷新本地技能列表,这样在「我的技能」就能看到
    await loadSkills()
  } catch (err: any) {
    message.error(err?.message || '安装失败')
  } finally {
    installingSlug.value = null
  }
}

function pickHot(keyword: string) {
  mallQuery.value = keyword
  void searchMall()
}

watch(tabValue, (v) => {
  // 第一次切到商城时自动跑一次空查询(获取热门)
  if (v === 'mall' && mallResults.value.length === 0 && !mallSearching.value && !mallError.value) {
    void searchMall()
  }
})

onMounted(loadSkills)

async function loadSkills() {
  loading.value = true
  lastError.value = ''
  try {
    const list = await wsStore.rpc.listSkills()
    skills.value = list as Skill[]
  } catch (err: any) {
    lastError.value = err?.message || '加载技能失败,请检查 OpenClaw Gateway 连接'
    message.error(lastError.value)
  } finally {
    loading.value = false
  }
}

// 状态判断:
// - enabled: 可用且未禁用(eligible=true && disabled=false && installed=true 隐含)
// - needs-deps: 依赖缺失 (eligible=false)
// - disabled: 用户主动禁用
// - always: 系统级常驻(归到 enabled)
function classify(s: Skill): 'enabled' | 'needs-deps' | 'disabled' {
  if (s.disabled) return 'disabled'
  if (s.eligible === false) return 'needs-deps'
  return 'enabled'
}

const stats = computed(() => {
  const c = { enabled: 0, needsDeps: 0, disabled: 0 }
  for (const s of skills.value) {
    const k = classify(s)
    if (k === 'enabled') c.enabled++
    else if (k === 'needs-deps') c.needsDeps++
    else c.disabled++
  }
  return c
})

const filtered = computed<Skill[]>(() => {
  const q = search.value.trim().toLowerCase()
  return skills.value.filter((s) => {
    if (q) {
      const hay = `${s.name} ${s.description || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filterMode.value === 'all') return true
    return classify(s) === filterMode.value
  })
})

async function handleToggle(skill: Skill, value: boolean) {
  togglingName.value = skill.name
  try {
    if (value) {
      // 启用
      await wsStore.rpc.installSkill(skill.name)
      skill.installed = true
      skill.disabled = false
      message.success(`已启用 ${skill.name}`)
    } else {
      // 停用
      try {
        await wsStore.rpc.uninstallSkill(skill.name)
        skill.installed = false
        skill.disabled = true
        message.success(`已停用 ${skill.name}`)
      } catch (err: any) {
        const m = String(err?.message || '')
        if (/method.*not.*found|unknown method|unsupported/i.test(m)) {
          message.warning('当前 Gateway 不支持远程停用')
        } else {
          message.error(m || '停用失败')
        }
        skill.installed = true
        skill.disabled = false
      }
    }
  } catch (err: any) {
    message.error(err?.message || '操作失败')
  } finally {
    togglingName.value = null
  }
}

function openDetail(s: Skill) {
  detailSkill.value = s
  showDetail.value = true
}

function openHomepage(url: string) {
  const bridge = (window as any).lingjing
  if (bridge?.openExternal) {
    bridge.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制')
  } catch {
    message.error('复制失败,请手动选择')
  }
}

// 把 missing requirements 翻译成给用户看的中文片段
function describeMissing(s: Skill): string[] {
  const m = s.missing
  if (!m) return []
  const out: string[] = []
  if (m.bins?.length) out.push(`命令行工具:${m.bins.join(', ')}`)
  if (m.anyBins?.length) out.push(`任一工具:${m.anyBins.join(' / ')}`)
  if (m.config?.length) out.push(`配置:${m.config.join(', ')}`)
  if (m.env?.length) out.push(`环境变量:${m.env.join(', ')}`)
  if (m.os?.length) out.push(`系统:${m.os.join(', ')}`)
  return out
}

function statusTagType(s: Skill): 'success' | 'warning' | 'default' {
  const k = classify(s)
  if (k === 'enabled') return 'success'
  if (k === 'needs-deps') return 'warning'
  return 'default'
}

function statusTagLabel(s: Skill): string {
  const k = classify(s)
  if (k === 'enabled') return s.always ? '常驻' : '已启用'
  if (k === 'needs-deps') return '需依赖'
  return '已禁用'
}

const FILTER_OPTIONS: Array<{ label: string; value: FilterMode }> = [
  { label: '全部', value: 'all' },
  { label: '已启用', value: 'enabled' },
  { label: '需依赖', value: 'needs-deps' },
  { label: '已禁用', value: 'disabled' },
]
</script>

<template>
  <div class="ling-skills">
    <header class="page-head">
      <div>
        <h1 class="page-title">技能广场</h1>
        <p class="page-subtitle">
          浏览 OpenClaw 内置的 AI 技能,启用后助手就能调用对应工具完成任务。
          共 {{ skills.length }} 个 · 已启用 {{ stats.enabled }} · 需装依赖 {{ stats.needsDeps }} · 已禁用 {{ stats.disabled }}
        </p>
      </div>
      <NButton size="medium" :loading="loading" @click="loadSkills">
        <template #icon><NIcon><RefreshOutline /></NIcon></template>
        刷新
      </NButton>
    </header>

    <NTabs v-model:value="tabValue" type="line" animated>
      <NTabPane name="mine" tab="我的技能">
        <div class="toolbar">
          <NInput
            v-model:value="search"
            placeholder="搜索技能名或描述..."
            size="medium"
            clearable
            class="search-input"
          >
            <template #prefix><NIcon><SearchOutline /></NIcon></template>
          </NInput>
          <NRadioGroup v-model:value="filterMode" size="medium">
            <NRadioButton
              v-for="opt in FILTER_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </NRadioGroup>
        </div>

        <NSpin :show="loading">
      <div v-if="!loading && skills.length === 0" class="empty-state">
        <NEmpty :description="lastError || '没有可用技能'">
          <template #extra>
            <NButton size="small" @click="loadSkills">重试</NButton>
          </template>
        </NEmpty>
      </div>

      <div v-else-if="filtered.length === 0" class="empty-state-inline">
        没有匹配的技能
      </div>

      <div v-else class="skills-grid">
        <div
          v-for="s in filtered"
          :key="s.name"
          class="skill-card"
          :class="{
            'is-enabled': classify(s) === 'enabled',
            'is-needs-deps': classify(s) === 'needs-deps',
            'is-disabled': classify(s) === 'disabled',
          }"
          @click="openDetail(s)"
        >
          <div class="skill-icon">{{ s.emoji || '⚙' }}</div>
          <div class="skill-body">
            <div class="skill-name-row">
              <span class="skill-name">{{ s.name }}</span>
              <NTag
                size="small"
                :bordered="false"
                :type="statusTagType(s)"
                round
              >
                {{ statusTagLabel(s) }}
              </NTag>
            </div>
            <p class="skill-desc">{{ s.description || '—' }}</p>
            <div v-if="classify(s) === 'needs-deps'" class="missing-hint">
              <NIcon size="12"><AlertCircleOutline /></NIcon>
              <span>{{ describeMissing(s).join(' · ') || '依赖缺失' }}</span>
            </div>
          </div>
          <div class="skill-actions" @click.stop>
            <NSwitch
              :value="!s.disabled && s.eligible !== false"
              :loading="togglingName === s.name"
              :disabled="togglingName === s.name || !!s.always"
              @update:value="(v: boolean) => handleToggle(s, v)"
            />
          </div>
        </div>
      </div>
        </NSpin>

        <p class="page-footnote">
          {{ skills.length }} 个技能由 OpenClaw 内置提供。安装好对应的命令行工具后,
          技能会自动从「需依赖」转为「已启用」。
        </p>
      </NTabPane>

      <!-- 技能商城 ClawHub -->
      <NTabPane name="mall" tab="技能商城">
        <div class="mall-head">
          <div class="mall-head-info">
            <NIcon size="14" class="mall-head-icon"><StorefrontOutline /></NIcon>
            <span>从 ClawHub 浏览社区技能,一键安装到当前工作区</span>
          </div>
        </div>

        <div class="toolbar">
          <NInput
            v-model:value="mallQuery"
            placeholder="搜索技能(如 github / note / browser)..."
            size="medium"
            clearable
            class="search-input"
            @input="debouncedSearch"
            @keydown.enter="searchMall"
          >
            <template #prefix><NIcon><SearchOutline /></NIcon></template>
          </NInput>
          <NButton size="medium" :loading="mallSearching" @click="searchMall">搜索</NButton>
        </div>

        <div class="hot-row">
          <span class="hot-label">热门:</span>
          <button
            v-for="kw in HOT_KEYWORDS"
            :key="kw"
            class="hot-chip"
            @click="pickHot(kw)"
          >
            {{ kw }}
          </button>
        </div>

        <NSpin :show="mallSearching">
          <div v-if="mallError" class="mall-error">
            <NIcon><AlertCircleOutline /></NIcon>
            <span>{{ mallError }}</span>
            <NButton size="tiny" @click="searchMall">重试</NButton>
          </div>

          <div v-else-if="!mallSearching && mallResults.length === 0" class="empty-state-inline">
            {{ mallQuery ? '没有找到匹配的技能' : '在搜索框输入关键词或点上方"热门"标签开始浏览' }}
          </div>

          <div v-else class="mall-grid">
            <div
              v-for="r in mallResults"
              :key="r.slug"
              class="mall-card"
              :class="{ 'is-installed': installedSlugs.has(r.slug) }"
            >
              <div class="mall-icon">
                <NIcon size="16">
                  <CheckmarkCircle v-if="installedSlugs.has(r.slug)" />
                  <CloudDownloadOutline v-else />
                </NIcon>
              </div>
              <div class="mall-body">
                <div class="mall-name-row">
                  <span class="mall-name">{{ r.displayName }}</span>
                  <span class="mall-slug">{{ r.slug }}</span>
                  <NTag v-if="r.version" size="tiny" :bordered="false" round>v{{ r.version }}</NTag>
                  <NTag
                    v-if="installedSlugs.has(r.slug)"
                    size="tiny"
                    :bordered="false"
                    type="success"
                    round
                  >
                    已安装
                  </NTag>
                </div>
                <p class="mall-summary">{{ r.summary }}</p>
              </div>
              <div class="mall-actions">
                <NButton
                  v-if="!installedSlugs.has(r.slug)"
                  type="primary"
                  size="small"
                  :loading="installingSlug === r.slug"
                  :disabled="installingSlug === r.slug"
                  @click="installFromMall(r)"
                >
                  <template #icon><NIcon><CloudDownloadOutline /></NIcon></template>
                  安装
                </NButton>
                <NButton
                  v-else
                  size="small"
                  quaternary
                  disabled
                >
                  已安装
                </NButton>
              </div>
            </div>
          </div>
        </NSpin>

        <p class="page-footnote">
          技能由 <button class="link-btn" @click="(window as any).lingjing?.openExternal?.('https://clawhub.ai')">ClawHub</button>
          社区维护,遵循 SKILL.md 规范。安装后会写到 <code>~/.openclaw/workspaces/&lt;ws&gt;/skills</code>。
        </p>
      </NTabPane>
    </NTabs>

    <!-- 详情 modal -->
    <NModal
      v-model:show="showDetail"
      preset="card"
      :title="detailSkill ? `${detailSkill.emoji || ''} ${detailSkill.name}` : ''"
      style="width: 540px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div v-if="detailSkill">
        <p class="detail-desc">{{ detailSkill.description || '无描述' }}</p>

        <!-- 状态卡 -->
        <div class="detail-status" :class="`status-${classify(detailSkill)}`">
          <NIcon size="16">
            <CheckmarkCircle v-if="classify(detailSkill) === 'enabled'" />
            <AlertCircleOutline v-else />
          </NIcon>
          <span class="status-label">{{ statusTagLabel(detailSkill) }}</span>
          <span v-if="detailSkill.version" class="status-version">v{{ detailSkill.version }}</span>
        </div>

        <!-- 缺失依赖列表 -->
        <div v-if="classify(detailSkill) === 'needs-deps' && describeMissing(detailSkill).length > 0" class="detail-section">
          <div class="section-label">缺失的依赖</div>
          <ul class="missing-list">
            <li v-for="(m, i) in describeMissing(detailSkill)" :key="i">{{ m }}</li>
          </ul>
        </div>

        <!-- 安装命令 -->
        <div v-if="detailSkill.install && detailSkill.install.length > 0" class="detail-section">
          <div class="section-label">如何安装依赖</div>
          <div
            v-for="(step, i) in detailSkill.install"
            :key="i"
            class="install-step"
          >
            <div class="install-step-label">{{ step.label || step.kind || '安装' }}</div>
            <div v-if="step.command || (step.bins && step.bins.length)" class="install-cmd-row">
              <code class="install-cmd">
                {{ step.command || (step.kind === 'brew' ? `brew install ${step.bins?.join(' ')}` : `${step.kind || '?'}: ${step.bins?.join(', ') || ''}`) }}
              </code>
              <button
                class="copy-btn"
                title="复制命令"
                @click="copyText(step.command || (step.kind === 'brew' ? `brew install ${step.bins?.join(' ')}` : ''))"
              >
                <NIcon size="14"><CopyOutline /></NIcon>
              </button>
            </div>
          </div>
          <p class="install-hint">
            <NIcon size="12"><ConstructOutline /></NIcon>
            <span>装完依赖后回到本页点击「刷新」,技能状态会自动更新。</span>
          </p>
        </div>

        <!-- 文档链接 -->
        <div v-if="detailSkill.homepage" class="detail-section">
          <NButton size="small" quaternary @click="openHomepage(detailSkill.homepage!)">
            <template #icon><NIcon><OpenOutline /></NIcon></template>
            查看官方文档
          </NButton>
        </div>
      </div>

      <template #footer>
        <div class="modal-footer">
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" @click="showDetail = false">关闭</NButton>
            <NButton
              v-if="detailSkill && !detailSkill.always"
              type="primary"
              size="medium"
              :loading="togglingName === detailSkill?.name"
              :disabled="!!detailSkill?.always"
              @click="handleToggle(detailSkill, detailSkill.disabled || classify(detailSkill) !== 'enabled')"
            >
              {{ detailSkill && classify(detailSkill) === 'enabled' ? '停用' : '启用' }}
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.ling-skills {
  max-width: 880px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
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
  max-width: 600px;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  max-width: 360px;
}

.empty-state { margin-top: 60px; text-align: center; }
.empty-state-inline {
  text-align: center;
  padding: 60px 16px;
  color: var(--n-text-color-disabled);
  font-size: 13px;
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 8px;
}

.skill-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.12s ease, background 0.12s ease;
}

.skill-card:hover { border-color: var(--n-text-color-3); }
.skill-card:active { transform: scale(0.99); }

.skill-card.is-enabled {
  border-color: rgba(52, 199, 89, 0.3);
}

.skill-card.is-needs-deps {
  background: rgba(255, 204, 0, 0.04);
  border-color: rgba(255, 204, 0, 0.3);
}

.skill-card.is-disabled {
  opacity: 0.65;
}

:root[data-theme='dark'] .skill-card.is-needs-deps {
  background: rgba(255, 204, 0, 0.06);
}

.skill-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1;
}

.skill-body {
  flex: 1;
  min-width: 0;
}

.skill-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}

.skill-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.skill-desc {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.missing-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11.5px;
  color: rgba(255, 204, 0, 0.95);
}

:root[data-theme='dark'] .missing-hint {
  color: #FFCC00;
}

.skill-actions {
  flex-shrink: 0;
  align-self: center;
}

.page-footnote {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 18px 4px 0;
  line-height: 1.5;
}

.page-footnote code {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  background: var(--n-action-color);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11.5px;
}

.link-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--n-primary-color, #2080f0);
  padding: 0;
  font: inherit;
}

.link-btn:hover { text-decoration: underline; }

/* 技能商城 */
.mall-head {
  margin: 12px 0 10px;
}

.mall-head-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--n-text-color-3);
}

.mall-head-icon { color: var(--n-text-color-disabled); }

.hot-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.hot-label {
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

.hot-chip {
  background: var(--n-action-color);
  border: 1px solid var(--n-border-color);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--n-text-color);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.hot-chip:hover {
  background: var(--n-card-color);
  border-color: var(--n-text-color-3);
}

.mall-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin: 8px 0;
  background: rgba(255, 59, 48, 0.06);
  color: rgba(255, 59, 48, 0.9);
  border-radius: 8px;
  font-size: 12.5px;
}

:root[data-theme='dark'] .mall-error {
  background: rgba(255, 99, 89, 0.08);
  color: #FF6359;
}

.mall-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mall-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.mall-card:hover {
  border-color: var(--n-text-color-3);
}

.mall-card.is-installed {
  background: rgba(52, 199, 89, 0.04);
  border-color: rgba(52, 199, 89, 0.3);
}

:root[data-theme='dark'] .mall-card.is-installed {
  background: rgba(52, 199, 89, 0.06);
}

.mall-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--n-text-color-3);
}

.mall-card.is-installed .mall-icon {
  color: var(--n-success-color, #34C759);
}

.mall-body { flex: 1; min-width: 0; }

.mall-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}

.mall-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
}

.mall-slug {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--n-text-color-disabled);
}

.mall-summary {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mall-actions {
  flex-shrink: 0;
}

/* Modal 详情 */
.detail-desc {
  font-size: 13.5px;
  color: var(--n-text-color);
  line-height: 1.6;
  margin: 0 0 16px;
}

.detail-status {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--n-action-color);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
}

.detail-status.status-enabled {
  background: rgba(52, 199, 89, 0.1);
  color: var(--n-success-color, #18a058);
}

.detail-status.status-needs-deps {
  background: rgba(255, 204, 0, 0.1);
  color: rgba(255, 159, 0, 1);
}

:root[data-theme='dark'] .detail-status.status-needs-deps {
  color: #FFCC00;
}

.status-label { font-weight: 500; flex: 1; }
.status-version {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

.detail-section { margin-bottom: 16px; }

.section-label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.missing-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--n-text-color);
  line-height: 1.7;
}

.install-step {
  background: var(--n-action-color);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.install-step-label {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}

.install-cmd-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.install-cmd {
  flex: 1;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--n-text-color);
  padding: 6px 10px;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  overflow-x: auto;
  white-space: nowrap;
}

.copy-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--n-text-color-disabled);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease, color 0.12s ease;
  flex-shrink: 0;
}

.copy-btn:hover {
  background: var(--n-action-color);
  color: var(--n-text-color);
}

.install-hint {
  margin: 8px 0 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

.modal-footer { display: flex; width: 100%; }
</style>
