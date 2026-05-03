<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NTag, NButton, NIcon, NEmpty, NModal, NInput, NSpace,
  NForm, NFormItem, NSelect, NTabs, NTabPane,
  useMessage, useDialog,
} from 'naive-ui'
import {
  AddOutline, BusinessOutline, PeopleOutline, BriefcaseOutline,
  StatsChartOutline, ChatbubblesOutline, TrashOutline, ChevronForwardOutline,
  RocketOutline, BagHandleOutline, MegaphoneOutline, BrushOutline,
  CodeSlashOutline, NewspaperOutline, HeadsetOutline,
} from '@vicons/ionicons5'
import { useAgentStore } from '@/stores/agent'
import {
  listScenarios, createScenario as apiCreateScenario, deleteScenario as apiDeleteScenario,
  listTasks, createTask as apiCreateTask, listMessages, appendMessage,
  updateScenario as apiUpdateScenario,
  type Scenario, type ScenarioTask, type ScenarioMessage,
} from '@/api/lingjing/scenarios'

// ============ 公司模板:角色定义 ============
interface RoleDef {
  key: string
  title: string         // 角色名(如 "CEO")
  description: string   // 给人看的简短描述
  prompt: string        // 角色的系统提示词
}

interface CompanyTemplate {
  key: string
  name: string
  emoji: string
  icon: any
  description: string
  roles: RoleDef[]
}

const TEMPLATES: CompanyTemplate[] = [
  {
    key: 'startup',
    name: '初创公司',
    emoji: '🚀',
    icon: RocketOutline,
    description: '小而美的创业团队,聚焦产品和增长',
    roles: [
      { key: 'ceo', title: 'CEO', description: '战略决策', prompt: '你是公司 CEO,负责制定战略、决策方向、对外沟通。回答简洁,关注全局。' },
      { key: 'cto', title: 'CTO', description: '技术架构', prompt: '你是 CTO,负责技术方向、架构设计、团队协调。提供技术建议和实现方案。' },
      { key: 'product', title: '产品经理', description: '需求 / 设计', prompt: '你是产品经理,负责需求分析、功能设计、用户体验。提供产品思路和用户价值评估。' },
      { key: 'engineer', title: '工程师', description: '开发实现', prompt: '你是工程师,负责代码实现、技术调研、问题修复。给出代码示例和实现建议。' },
      { key: 'growth', title: '增长', description: '获客 / 留存', prompt: '你是增长负责人,关注用户获取、留存、变现。提供增长策略和数据分析。' },
    ],
  },
  {
    key: 'ecommerce',
    name: '电商公司',
    emoji: '🛍',
    icon: BagHandleOutline,
    description: '从选品到客服的完整电商团队',
    roles: [
      { key: 'ceo', title: '老板', description: '总体方向', prompt: '你是电商老板,统筹运营,关注 GMV 和利润。' },
      { key: 'buying', title: '采购选品', description: '选品 / 供应链', prompt: '你是采购负责人,负责选品、议价、供应链管理。' },
      { key: 'operation', title: '运营', description: '店铺 / 活动', prompt: '你是电商运营,负责店铺装修、商品上架、促销活动策划。' },
      { key: 'marketing', title: '营销', description: '推广 / 流量', prompt: '你是营销负责人,负责广告投放、内容营销、流量获取。' },
      { key: 'cs', title: '客服', description: '售前 / 售后', prompt: '你是客服主管,负责处理客户咨询和售后问题。' },
      { key: 'finance', title: '财务', description: '账务 / 利润', prompt: '你是财务,负责对账、利润核算、风险评估。' },
      { key: 'logistics', title: '物流', description: '发货 / 仓储', prompt: '你是物流负责人,负责仓储管理和发货效率。' },
    ],
  },
  {
    key: 'consulting',
    name: '咨询公司',
    emoji: '💼',
    icon: BriefcaseOutline,
    description: '为客户提供专业咨询的精英团队',
    roles: [
      { key: 'partner', title: '合伙人', description: '客户关系', prompt: '你是咨询公司合伙人,负责高端客户关系和方案审定。' },
      { key: 'consultant', title: '顾问', description: '研究分析', prompt: '你是资深咨询师,擅长行业分析、数据挖掘、方案设计。' },
      { key: 'researcher', title: '研究员', description: '资料 / 报告', prompt: '你是研究员,负责案头研究、信息收集、报告撰写。' },
      { key: 'analyst', title: '分析师', description: '数据 / 建模', prompt: '你是分析师,擅长数据建模、量化分析、可视化呈现。' },
    ],
  },
  {
    key: 'media',
    name: '自媒体团队',
    emoji: '📺',
    icon: NewspaperOutline,
    description: '内容生产到发行的完整链路',
    roles: [
      { key: 'editor', title: '主编', description: '选题 / 把关', prompt: '你是主编,负责选题策划、内容把关、风格定调。' },
      { key: 'writer', title: '撰稿', description: '深度文案', prompt: '你是撰稿人,擅长深度长文、故事化叙事。' },
      { key: 'shortform', title: '短视频编辑', description: '剧本 / 剪辑', prompt: '你是短视频编辑,负责脚本撰写、剪辑节奏、爆款分析。' },
      { key: 'designer', title: '设计', description: '封面 / 排版', prompt: '你是设计师,负责视觉设计、配图、版式美化。' },
      { key: 'distribution', title: '分发', description: '多平台运营', prompt: '你是分发运营,负责跨平台发布、互动维护、数据分析。' },
      { key: 'fans', title: '社群', description: '粉丝 / 私域', prompt: '你是社群运营,负责粉丝维护、私域转化、活动策划。' },
    ],
  },
  {
    key: 'software',
    name: '软件公司',
    emoji: '💻',
    icon: CodeSlashOutline,
    description: '产品 / 设计 / 研发 / 测试 全链路',
    roles: [
      { key: 'pm', title: '产品经理', description: '需求 / 节奏', prompt: '你是产品经理,负责需求评审、原型设计、迭代规划。' },
      { key: 'designer', title: 'UI/UX 设计师', description: '交互 / 视觉', prompt: '你是设计师,负责交互设计、视觉规范、用户调研。' },
      { key: 'frontend', title: '前端工程师', description: '页面 / 体验', prompt: '你是前端工程师,擅长 Web 应用、性能优化、可访问性。' },
      { key: 'backend', title: '后端工程师', description: '服务 / 数据', prompt: '你是后端工程师,擅长 API 设计、数据建模、性能调优。' },
      { key: 'qa', title: 'QA / 测试', description: '质量 / 自动化', prompt: '你是测试工程师,负责测试用例、自动化、回归验证。' },
      { key: 'devops', title: '运维 / 基建', description: '部署 / 监控', prompt: '你是 DevOps,负责 CI/CD、监控告警、生产环境稳定性。' },
    ],
  },
  {
    key: 'design',
    name: '设计工作室',
    emoji: '🎨',
    icon: BrushOutline,
    description: '从品牌到产品视觉的设计驱动型团队',
    roles: [
      { key: 'cd', title: '创意总监', description: '风格 / 创意', prompt: '你是创意总监,负责整体风格、创意方向。' },
      { key: 'brand', title: '品牌设计', description: 'Logo / VI', prompt: '你是品牌设计师,擅长 Logo、VI 系统、品牌指南。' },
      { key: 'ux', title: 'UX 设计师', description: '交互 / 体验', prompt: '你是 UX 设计师,聚焦用户旅程、易用性。' },
      { key: 'illustrator', title: '插画师', description: '插画 / 配图', prompt: '你是插画师,擅长风格化插画、配图设计。' },
      { key: 'motion', title: '动效设计师', description: '动效 / 视频', prompt: '你是动效设计师,负责动效、转场、短视频。' },
    ],
  },
  {
    key: 'marketing',
    name: '营销机构',
    emoji: '📣',
    icon: MegaphoneOutline,
    description: '为客户做整合营销和品牌传播',
    roles: [
      { key: 'strategy', title: '策略总监', description: '品牌 / 定位', prompt: '你是策略总监,负责品牌定位、营销策略制定。' },
      { key: 'planner', title: '策划', description: '活动 / Campaign', prompt: '你是策划,擅长活动策划、Campaign 执行。' },
      { key: 'copy', title: '文案', description: '广告 / 文案', prompt: '你是广告文案,擅长爆款标题、长尾文案。' },
      { key: 'media', title: '媒介', description: '投放 / 资源', prompt: '你是媒介,负责广告投放、媒体合作、资源对接。' },
      { key: 'data', title: '数据分析', description: '效果 / 优化', prompt: '你是数据分析师,负责广告效果分析、ROI 优化。' },
    ],
  },
  {
    key: 'support',
    name: '客户支持',
    emoji: '☎',
    icon: HeadsetOutline,
    description: '售前 / 售中 / 售后全链路客户服务',
    roles: [
      { key: 'lead', title: '客服主管', description: '调度 / 督导', prompt: '你是客服主管,负责调度、培训、质检。' },
      { key: 'l1', title: '一线客服', description: '常规咨询', prompt: '你是一线客服,擅长常规问题快速响应。' },
      { key: 'l2', title: '二线技术', description: '复杂问题', prompt: '你是二线技术支持,处理复杂技术问题。' },
      { key: 'success', title: '客户成功', description: '回访 / 续约', prompt: '你是客户成功经理,负责老客户回访、续约。' },
    ],
  },
]

// ============ Stores ============
const message = useMessage()
const dialog = useDialog()
const agentStore = useAgentStore()

// 公司列表(从 server SQLite 拉)
const scenarios = ref<Scenario[]>([])
const loading = ref(false)
const lastError = ref('')

async function loadCompanies() {
  loading.value = true
  lastError.value = ''
  try {
    scenarios.value = await listScenarios('company')
  } catch (err: any) {
    lastError.value = err?.message || '加载公司列表失败'
  } finally {
    loading.value = false
  }
}

const companies = computed(() => {
  return scenarios.value
    .map((scenario) => {
      const template = TEMPLATES.find((t) => t.key === scenario.templateKey)
      if (!template) return null
      return { scenario, template }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
})

// localStorage 一次性迁移到 SQLite(老用户首次升级时把数据搬过来)
const MIGRATED_KEY = 'lingjing_companies_migrated_v1'
async function migrateLocalStorageOnce() {
  if (localStorage.getItem(MIGRATED_KEY) === '1') return
  try {
    const raw = localStorage.getItem('lingjing_companies')
    if (raw) {
      const metas = JSON.parse(raw) as Record<string, {
        scenarioId: string
        templateKey: string
        roleAssignments: Record<string, string>
        createdAt: number
      }>
      for (const meta of Object.values(metas)) {
        try {
          await apiCreateScenario({
            id: meta.scenarioId,
            name: '迁移自旧数据',
            description: '',
            scenarioType: 'company',
            templateKey: meta.templateKey,
            roleAssignments: meta.roleAssignments,
            agents: Object.values(meta.roleAssignments).filter(Boolean),
          })
        } catch {
          // 重复 id 等错误,跳过
        }
      }
    }
  } catch {
    // ignore
  } finally {
    localStorage.setItem(MIGRATED_KEY, '1')
    localStorage.removeItem('lingjing_companies')
  }
}

const allAgents = computed(() => agentStore.agents)
const allAgentOptions = computed(() =>
  allAgents.value.map((a) => ({
    label: a.identity?.name || a.name || a.id,
    value: a.id,
  })),
)

function agentName(id: string): string {
  if (id === 'user') return '用户'
  if (id === 'system') return '系统'
  if (id === 'all') return '所有人'
  const a = allAgents.value.find((x) => x.id === id)
  return a?.identity?.name || a?.name || id
}

// ============ 创建向导 ============
const showWizard = ref(false)
const wizardStep = ref<1 | 2 | 3>(1)
const wizardTemplate = ref<CompanyTemplate | null>(null)
const wizardCompanyName = ref('')
const wizardAssignments = ref<Record<string, string>>({})
const wizardSubmitting = ref(false)

function openWizard(tpl?: CompanyTemplate) {
  wizardTemplate.value = tpl || null
  wizardCompanyName.value = tpl ? `我的${tpl.name}` : ''
  wizardAssignments.value = {}
  wizardStep.value = tpl ? 2 : 1 // 选了模板直接跳到 step 2
  showWizard.value = true
}

function pickWizardTemplate(tpl: CompanyTemplate) {
  wizardTemplate.value = tpl
  wizardCompanyName.value = `我的${tpl.name}`
  wizardAssignments.value = {}
  wizardStep.value = 2
}

function wizardNext() {
  if (wizardStep.value === 1 && !wizardTemplate.value) {
    message.warning('请选一个公司类型')
    return
  }
  if (wizardStep.value === 2 && !wizardCompanyName.value.trim()) {
    message.warning('请填写公司名')
    return
  }
  if (wizardStep.value < 3) wizardStep.value = (wizardStep.value + 1) as 1 | 2 | 3
}

function wizardPrev() {
  if (wizardStep.value > 1) wizardStep.value = (wizardStep.value - 1) as 1 | 2 | 3
}

async function wizardFinish() {
  if (!wizardTemplate.value) return
  const tpl = wizardTemplate.value
  const assignedAgentIds = Object.values(wizardAssignments.value).filter(Boolean)
  if (assignedAgentIds.length === 0) {
    message.warning('请至少给 1 个角色分配智能体')
    return
  }

  wizardSubmitting.value = true
  try {
    const scenario = await apiCreateScenario({
      name: wizardCompanyName.value.trim(),
      description: tpl.description,
      scenarioType: 'company',
      templateKey: tpl.key,
      roleAssignments: { ...wizardAssignments.value },
      agents: Array.from(new Set(assignedAgentIds)),
      status: 'active',
    })
    message.success(`公司 "${scenario.name}" 已创建`)
    showWizard.value = false
    await loadCompanies()
  } catch (err: any) {
    message.error(err?.message || '创建失败')
  } finally {
    wizardSubmitting.value = false
  }
}

// ============ 公司详情 ============
const showDetail = ref(false)
const detailScenarioId = ref<string>('')
const detailTab = ref<'org' | 'tasks' | 'comm'>('org')
const detailTasksList = ref<ScenarioTask[]>([])
const detailMessagesList = ref<ScenarioMessage[]>([])

async function openDetail(scenarioId: string) {
  detailScenarioId.value = scenarioId
  detailTab.value = 'org'
  showDetail.value = true
  await Promise.all([refreshDetailTasks(), refreshDetailMessages()])
}

async function refreshDetailTasks() {
  if (!detailScenarioId.value) return
  try {
    detailTasksList.value = await listTasks(detailScenarioId.value)
  } catch {
    detailTasksList.value = []
  }
}

async function refreshDetailMessages() {
  if (!detailScenarioId.value) return
  try {
    detailMessagesList.value = await listMessages(detailScenarioId.value)
  } catch {
    detailMessagesList.value = []
  }
}

const detailCompany = computed(() => {
  const scenario = scenarios.value.find((s) => s.id === detailScenarioId.value)
  if (!scenario) return null
  const template = TEMPLATES.find((t) => t.key === scenario.templateKey)
  if (!template) return null
  return { scenario, template }
})

const detailTasks = computed(() => detailTasksList.value)
const detailMessages = computed(() => detailMessagesList.value)

// 仪表盘指标
const dashboard = computed(() => {
  const co = detailCompany.value
  if (!co) return null
  const tasks = detailTasksList.value
  return {
    members: co.scenario.agents.length,
    totalRoles: co.template.roles.length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    pending: tasks.filter((t) => t.status === 'pending').length,
  }
})

// 给某个角色 dispatch 任务(单击角色卡 → 给那个 agent 派发任务)
const showDispatch = ref(false)
const dispatchRoleKey = ref<string>('')
const dispatchTaskTitle = ref('')
const dispatchTaskDesc = ref('')

const dispatchTitle = computed(() => {
  const co = detailCompany.value
  if (!co) return '派发任务'
  const role = co.template.roles.find((r) => r.key === dispatchRoleKey.value)
  return role ? `给 ${role.title} 派发任务` : '派发任务'
})

function openDispatch(roleKey: string) {
  dispatchRoleKey.value = roleKey
  dispatchTaskTitle.value = ''
  dispatchTaskDesc.value = ''
  showDispatch.value = true
}

async function handleDispatch() {
  const co = detailCompany.value
  if (!co) return
  const agentId = co.scenario.roleAssignments[dispatchRoleKey.value]
  if (!agentId) {
    message.warning('该角色未分配智能体')
    return
  }
  if (!dispatchTaskTitle.value.trim()) {
    message.warning('请填写任务标题')
    return
  }
  try {
    await apiCreateTask(co.scenario.id, {
      title: dispatchTaskTitle.value.trim(),
      description: dispatchTaskDesc.value.trim() || dispatchTaskTitle.value.trim(),
      assignedAgents: [agentId],
      priority: 'medium',
    })
    await appendMessage(co.scenario.id, {
      fromAgent: 'user',
      toAgent: agentId,
      content: `新任务派发:${dispatchTaskTitle.value.trim()}`,
      type: 'task',
    })
    message.success(`任务已派发给 ${agentName(agentId)}`)
    showDispatch.value = false
    await Promise.all([refreshDetailTasks(), refreshDetailMessages()])
  } catch (err: any) {
    message.error(err?.message || '派发失败')
  }
}

function deleteCompany(scenarioId: string) {
  const co = companies.value.find((c) => c.scenario.id === scenarioId)
  if (!co) return
  dialog.warning({
    title: '解散公司',
    content: `解散 "${co.scenario.name}"?关联的任务和消息将清空,但智能体本身保留。`,
    positiveText: '解散',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await apiDeleteScenario(scenarioId)
        if (detailScenarioId.value === scenarioId) showDetail.value = false
        message.success('已解散')
        await loadCompanies()
      } catch (err: any) {
        message.error(err?.message || '解散失败')
      }
    },
  })
}

function formatRelTime(ts: number): string {
  const diffMs = Date.now() - ts
  if (diffMs < 60_000) return '刚刚'
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)} 小时前`
  return new Date(ts).toLocaleString('zh-CN')
}

onMounted(async () => {
  if (allAgents.value.length === 0) {
    await agentStore.fetchAgents().catch(() => {})
  }
  await migrateLocalStorageOnce()
  await loadCompanies()
})
</script>

<template>
  <div class="ling-myworld">
    <header class="page-head">
      <div>
        <h1 class="page-title">虚拟公司</h1>
        <p class="page-subtitle">
          模拟一家公司,让 AI 智能体扮演 CEO / CTO / 运营 等角色围绕项目协作。
          已创建 {{ companies.length }} 家公司
        </p>
      </div>
      <NButton type="primary" size="medium" @click="openWizard()">
        <template #icon><NIcon><AddOutline /></NIcon></template>
        新建公司
      </NButton>
    </header>

    <!-- 已有公司的列表 -->
    <div v-if="companies.length > 0" class="companies-list">
      <div
        v-for="co in companies"
        :key="co.scenario.id"
        class="company-card"
        @click="openDetail(co.scenario.id)"
      >
        <div class="company-icon">{{ co.template.emoji }}</div>
        <div class="company-body">
          <div class="company-name-row">
            <span class="company-name">{{ co.scenario.name }}</span>
            <NTag size="small" :bordered="false" round>{{ co.template.name }}</NTag>
          </div>
          <p class="company-desc">{{ co.scenario.description }}</p>
          <div class="company-meta">
            <span>{{ co.scenario.agents.length }} 名员工</span>
            <span class="meta-sep">·</span>
            <span>{{ co.template.roles.length }} 个角色</span>
            <span class="meta-sep">·</span>
            <span>{{ formatRelTime(co.scenario.createdAt) }}创建</span>
          </div>
        </div>
        <button
          class="company-delete-btn"
          title="解散"
          @click.stop="deleteCompany(co.scenario.id)"
        >
          <NIcon size="14"><TrashOutline /></NIcon>
        </button>
      </div>
    </div>

    <!-- 模板选择(空态 + 已有公司下面也展示,方便快速建另一家) -->
    <div class="templates-section">
      <p class="section-label">{{ companies.length === 0 ? '快速创建一家公司' : '再建一家' }}</p>
      <div class="templates-grid">
        <button
          v-for="tpl in TEMPLATES"
          :key="tpl.key"
          class="template-card"
          @click="openWizard(tpl)"
        >
          <div class="template-emoji">{{ tpl.emoji }}</div>
          <div class="template-body">
            <div class="template-name">{{ tpl.name }}</div>
            <p class="template-desc">{{ tpl.description }}</p>
            <span class="template-roles">{{ tpl.roles.length }} 个角色</span>
          </div>
        </button>
      </div>
    </div>

    <!-- 创建向导 -->
    <NModal
      v-model:show="showWizard"
      preset="card"
      title="新建公司"
      style="width: 600px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="wizard-steps">
        <span class="step" :class="{ active: wizardStep === 1, done: wizardStep > 1 }">1 选公司类型</span>
        <span class="step-arrow">›</span>
        <span class="step" :class="{ active: wizardStep === 2, done: wizardStep > 2 }">2 公司名</span>
        <span class="step-arrow">›</span>
        <span class="step" :class="{ active: wizardStep === 3 }">3 角色分配</span>
      </div>

      <!-- Step 1: 选公司类型 -->
      <div v-if="wizardStep === 1" class="wizard-templates-grid">
        <button
          v-for="tpl in TEMPLATES"
          :key="tpl.key"
          class="wizard-template-card"
          :class="{ 'is-selected': wizardTemplate?.key === tpl.key }"
          @click="pickWizardTemplate(tpl)"
        >
          <div class="wizard-template-emoji">{{ tpl.emoji }}</div>
          <div class="wizard-template-name">{{ tpl.name }}</div>
          <div class="wizard-template-roles">{{ tpl.roles.length }} 个角色</div>
        </button>
      </div>

      <!-- Step 2: 公司名 -->
      <div v-if="wizardStep === 2 && wizardTemplate">
        <div class="wizard-template-preview">
          <span class="preview-emoji">{{ wizardTemplate.emoji }}</span>
          <div>
            <div class="preview-name">{{ wizardTemplate.name }}</div>
            <div class="preview-desc">{{ wizardTemplate.description }}</div>
          </div>
        </div>
        <NForm label-placement="left" label-width="78" :show-feedback="false">
          <NFormItem label="公司名" required>
            <NInput v-model:value="wizardCompanyName" placeholder="如:我的初创公司" maxlength="40" show-count />
          </NFormItem>
        </NForm>
      </div>

      <!-- Step 3: 角色分配 -->
      <div v-if="wizardStep === 3 && wizardTemplate">
        <p class="wizard-tip">从你的智能体里给每个角色挑一位扮演者。同一个智能体可同时扮演多个角色。</p>
        <p v-if="allAgents.length === 0" class="wizard-empty-hint">
          还没有智能体?
          <button class="link-btn" @click="$router.push('/agents')">去多智能体页新建 →</button>
        </p>
        <div class="role-assign-list">
          <div
            v-for="role in wizardTemplate.roles"
            :key="role.key"
            class="role-assign-row"
          >
            <div class="role-info">
              <span class="role-title">{{ role.title }}</span>
              <span class="role-desc">{{ role.description }}</span>
            </div>
            <NSelect
              v-model:value="wizardAssignments[role.key]"
              :options="allAgentOptions"
              placeholder="选 智能体..."
              size="small"
              style="width: 200px"
              clearable
            />
          </div>
        </div>
      </div>

      <template #footer>
        <div class="wizard-footer">
          <NButton v-if="wizardStep > 1" size="medium" @click="wizardPrev">上一步</NButton>
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" :disabled="wizardSubmitting" @click="showWizard = false">取消</NButton>
            <NButton
              v-if="wizardStep < 3"
              type="primary"
              size="medium"
              @click="wizardNext"
            >
              下一步
            </NButton>
            <NButton
              v-else
              type="primary"
              size="medium"
              :loading="wizardSubmitting"
              @click="wizardFinish"
            >
              <template #icon><NIcon><RocketOutline /></NIcon></template>
              成立公司
            </NButton>
          </NSpace>
        </div>
      </template>
    </NModal>

    <!-- 公司详情 -->
    <NModal
      v-model:show="showDetail"
      preset="card"
      :title="detailCompany ? `${detailCompany.template.emoji} ${detailCompany.scenario.name}` : ''"
      style="width: 760px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div v-if="detailCompany">
        <p class="detail-desc">
          <NTag size="small" :bordered="false" round>{{ detailCompany.template.name }}</NTag>
          {{ detailCompany.template.description }}
        </p>

        <!-- 仪表盘 -->
        <div v-if="dashboard" class="dashboard-grid">
          <div class="dash-card">
            <div class="dash-label">成员</div>
            <div class="dash-value">{{ dashboard.members }} / {{ dashboard.totalRoles }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-label">进行中</div>
            <div class="dash-value">{{ dashboard.inProgress }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-label">待处理</div>
            <div class="dash-value">{{ dashboard.pending }}</div>
          </div>
          <div class="dash-card">
            <div class="dash-label">已完成</div>
            <div class="dash-value dash-value--green">{{ dashboard.completed }}</div>
          </div>
        </div>

        <NTabs v-model:value="detailTab" type="line" animated>
          <!-- 组织架构 tab -->
          <NTabPane name="org" tab="组织架构">
            <p class="tab-tip">每个角色由一位智能体扮演。点击角色卡片可直接派发任务给该角色。</p>
            <div class="roles-grid">
              <div
                v-for="role in detailCompany.template.roles"
                :key="role.key"
                class="role-card"
                :class="{ 'is-vacant': !detailCompany.scenario.roleAssignments[role.key] }"
                @click="openDispatch(role.key)"
              >
                <div class="role-card-header">
                  <span class="role-card-title">{{ role.title }}</span>
                  <span class="role-card-desc">{{ role.description }}</span>
                </div>
                <div class="role-card-agent">
                  <template v-if="detailCompany.scenario.roleAssignments[role.key]">
                    <div class="role-avatar">
                      {{ agentName(detailCompany.scenario.roleAssignments[role.key]).slice(0, 1).toUpperCase() }}
                    </div>
                    <span class="role-agent-name">{{ agentName(detailCompany.scenario.roleAssignments[role.key]) }}</span>
                  </template>
                  <span v-else class="role-vacant-text">虚位以待</span>
                </div>
                <p class="role-card-prompt">{{ role.prompt }}</p>
              </div>
            </div>
          </NTabPane>

          <!-- 项目看板 tab -->
          <NTabPane name="tasks" tab="项目看板">
            <div v-if="detailTasks.length === 0" class="empty-state-inline">
              暂无任务。点「组织架构」里任意角色卡片即可派发任务。
            </div>
            <div v-else class="task-list">
              <div
                v-for="task in detailTasks"
                :key="task.id"
                class="task-item"
                :class="`status-${task.status}`"
              >
                <div class="task-body">
                  <div class="task-title">{{ task.title }}</div>
                  <p class="task-desc">{{ task.description }}</p>
                  <div class="task-meta">
                    分配给:{{ task.assignedAgents.map((id: string) => agentName(id)).join(', ') }} · {{ task.status }}
                  </div>
                </div>
              </div>
            </div>
          </NTabPane>

          <!-- 团队动态 tab -->
          <NTabPane name="comm" tab="团队动态">
            <div v-if="detailMessages.length === 0" class="empty-state-inline">
              还没有动态。任务派发、智能体反馈会在这里实时出现。
            </div>
            <div v-else class="msg-log">
              <div
                v-for="m in detailMessages"
                :key="m.id"
                class="msg-item"
              >
                <span class="msg-from">{{ agentName(m.fromAgent) }}</span>
                <span class="msg-arrow">→</span>
                <span class="msg-to">{{ agentName(m.toAgent) }}</span>
                <span class="msg-content">{{ m.content }}</span>
                <span class="msg-ts">{{ formatRelTime(m.timestamp) }}</span>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </div>

      <template #footer>
        <div class="modal-footer">
          <NButton size="medium" @click="showDetail = false">关闭</NButton>
        </div>
      </template>
    </NModal>

    <!-- 派发任务 modal -->
    <NModal
      v-model:show="showDispatch"
      preset="card"
      :title="dispatchTitle"
      style="width: 480px;"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <NForm label-placement="left" label-width="78" :show-feedback="false">
        <NFormItem label="任务标题" required>
          <NInput v-model:value="dispatchTaskTitle" placeholder="如:整理本周销售数据" />
        </NFormItem>
        <NFormItem label="详细要求">
          <NInput
            v-model:value="dispatchTaskDesc"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="说明任务目标和约束(可选)"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="modal-footer">
          <NSpace :size="8" style="margin-left: auto;">
            <NButton size="medium" @click="showDispatch = false">取消</NButton>
            <NButton type="primary" size="medium" @click="handleDispatch">派发</NButton>
          </NSpace>
        </div>
      </template>
    </NModal>

    <p class="page-footnote">
      虚拟公司基于 OpenClaw 多智能体协作能力。每个角色保留独立人设和记忆,
      派发任务时调用真实智能体执行。配置/任务/通信记录持久化在本地数据库
      (<code>data/wizard.db</code>),刷新或重启不丢。
    </p>
  </div>
</template>

<style scoped>
.ling-myworld {
  max-width: 800px;
  margin: 0 auto;
  padding: 16px 8px 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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
  max-width: 540px;
  line-height: 1.5;
}

/* 公司列表 */
.companies-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}

.company-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.12s ease;
}

.company-card:hover { border-color: var(--n-text-color-3); }
.company-card:active { transform: scale(0.99); }

.company-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--n-action-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 22px;
}

.company-body { flex: 1; min-width: 0; }

.company-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.company-name { font-size: 15px; font-weight: 500; color: var(--n-text-color); }

.company-desc {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0 0 4px;
  line-height: 1.45;
}

.company-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--n-text-color-disabled);
}

.meta-sep { opacity: 0.5; }

.company-delete-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--n-text-color-disabled);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.company-card:hover .company-delete-btn { opacity: 1; }
.company-delete-btn:hover { background: rgba(255, 59, 48, 0.08); color: #FF3B30; }

:root[data-theme='dark'] .company-delete-btn:hover {
  background: rgba(255, 99, 89, 0.12); color: #FF6359;
}

/* 模板区 */
.templates-section { margin-top: 14px; }

.section-label {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  margin: 0 4px 10px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.template-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.15s ease, transform 0.12s ease;
}

.template-card:hover { border-color: var(--n-text-color-3); }
.template-card:active { transform: scale(0.99); }

.template-emoji {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.template-body { flex: 1; min-width: 0; }
.template-name { font-size: 13.5px; font-weight: 500; color: var(--n-text-color); margin-bottom: 4px; }
.template-desc {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  margin: 0 0 4px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.template-roles { font-size: 11px; color: var(--n-text-color-disabled); }

/* 向导 */
.wizard-steps {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--n-text-color-disabled);
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--n-divider-color);
}

.step { padding: 4px 8px; border-radius: 4px; }
.step.active { background: var(--n-primary-color, #2080f0); color: #fff; }
.step.done { color: var(--n-text-color); }
.step-arrow { color: var(--n-text-color-disabled); }

.wizard-templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.wizard-template-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 14px 12px;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.wizard-template-card:hover { border-color: var(--n-text-color-3); }
.wizard-template-card.is-selected {
  border-color: var(--n-primary-color, #2080f0);
  background: rgba(32, 128, 240, 0.06);
}

.wizard-template-emoji { font-size: 24px; margin-bottom: 4px; }
.wizard-template-name { font-size: 13px; font-weight: 500; color: var(--n-text-color); }
.wizard-template-roles { font-size: 11px; color: var(--n-text-color-disabled); margin-top: 2px; }

.wizard-template-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--n-action-color);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.preview-emoji { font-size: 28px; }
.preview-name { font-size: 14px; font-weight: 500; color: var(--n-text-color); }
.preview-desc { font-size: 12px; color: var(--n-text-color-3); margin-top: 2px; }

.wizard-tip {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0 0 12px;
  line-height: 1.55;
}

.wizard-empty-hint {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--n-text-color-3);
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

.role-assign-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.role-assign-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--n-action-color);
  border-radius: 8px;
}

.role-info { flex: 1; min-width: 0; }
.role-title { font-size: 13px; font-weight: 500; color: var(--n-text-color); }
.role-desc { font-size: 11.5px; color: var(--n-text-color-3); margin-left: 8px; }

.wizard-footer { display: flex; align-items: center; width: 100%; }

/* 详情 */
.detail-desc {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0 0 16px;
  line-height: 1.55;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}

.dash-card {
  background: var(--n-action-color);
  border-radius: 8px;
  padding: 10px 14px;
}

.dash-label {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  margin-bottom: 4px;
}

.dash-value {
  font-size: 18px;
  font-weight: 500;
  color: var(--n-text-color);
  font-variant-numeric: tabular-nums;
}

.dash-value--green { color: var(--n-success-color, #34C759); }

.tab-tip {
  font-size: 12.5px;
  color: var(--n-text-color-3);
  margin: 0 0 12px;
  line-height: 1.55;
}

.empty-state-inline {
  text-align: center;
  padding: 36px 16px;
  color: var(--n-text-color-disabled);
  font-size: 13px;
}

/* 角色卡片(组织架构) */
.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.role-card {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.role-card:hover { border-color: var(--n-text-color-3); }

.role-card.is-vacant {
  border-style: dashed;
  opacity: 0.65;
}

.role-card-header { margin-bottom: 8px; }
.role-card-title { font-size: 13.5px; font-weight: 500; color: var(--n-text-color); margin-right: 6px; }
.role-card-desc { font-size: 11.5px; color: var(--n-text-color-3); }

.role-card-agent {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--n-action-color);
  border-radius: 6px;
  margin-bottom: 8px;
  min-height: 28px;
}

.role-avatar {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--n-card-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--n-text-color);
}

.role-agent-name {
  font-size: 12.5px;
  color: var(--n-text-color);
}

.role-vacant-text {
  font-size: 11.5px;
  color: var(--n-text-color-disabled);
  font-style: italic;
}

.role-card-prompt {
  font-size: 11.5px;
  color: var(--n-text-color-3);
  margin: 0;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 项目看板 */
.task-list { display: flex; flex-direction: column; gap: 6px; }

.task-item {
  background: var(--n-action-color);
  border-radius: 6px;
  padding: 10px 12px;
}

.task-title { font-size: 13px; font-weight: 500; color: var(--n-text-color); margin-bottom: 4px; }
.task-desc { font-size: 12px; color: var(--n-text-color-3); margin: 0 0 4px; line-height: 1.45; }
.task-meta { font-size: 11.5px; color: var(--n-text-color-disabled); }

.task-item.status-completed { background: rgba(52, 199, 89, 0.08); }
.task-item.status-failed { background: rgba(255, 59, 48, 0.08); }

/* 通信 */
.msg-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 360px;
  overflow-y: auto;
}

.msg-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--n-text-color);
  transition: background 0.12s ease;
}

.msg-item:hover { background: var(--n-action-color); }

.msg-from { font-weight: 500; min-width: 60px; }
.msg-arrow { color: var(--n-text-color-disabled); }
.msg-to { color: var(--n-text-color-3); min-width: 60px; }
.msg-content { flex: 1; color: var(--n-text-color-2, var(--n-text-color)); }
.msg-ts { color: var(--n-text-color-disabled); font-size: 11px; flex-shrink: 0; }

.modal-footer {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.page-footnote {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin: 18px 4px 0;
  line-height: 1.5;
}
</style>
