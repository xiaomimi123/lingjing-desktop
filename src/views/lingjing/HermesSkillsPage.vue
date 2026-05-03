<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NSpin, NButton, NIcon, NInput, NSelect, NTag, NSwitch, useMessage,
} from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import {
  ExtensionPuzzleOutline, RefreshOutline, SearchOutline,
  ChevronDownOutline, ChevronUpOutline,
} from '@vicons/ionicons5'
import { useHermesSkillStore } from '@/stores/hermes/skill'
import SkillFileBrowser from '@/components/hermes/SkillFileBrowser.vue'

const skillStore = useHermesSkillStore()
const message = useMessage()

const searchQuery = ref('')
const categoryFilter = ref<string>('all')
const expandedSkill = ref<string | null>(null)

const stats = computed(() => {
  const all = skillStore.skills
  return {
    total: all.length,
    enabled: all.filter((s) => s.enabled).length,
    categories: new Set(all.map((s) => s.category).filter(Boolean)).size,
  }
})

const categoryOptions = computed<SelectOption[]>(() => {
  const set = new Set(
    skillStore.skills.map((s) => s.category).filter((c): c is string => Boolean(c)),
  )
  return [
    { label: '全部分类', value: 'all' },
    ...Array.from(set).sort((a, b) => a.localeCompare(b)).map((c) => ({ label: c, value: c })),
  ]
})

const filteredSkills = computed(() => {
  let list = skillStore.skills
  if (categoryFilter.value !== 'all') {
    list = list.filter((s) => s.category === categoryFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q),
  )
})

async function refreshAll() {
  try {
    await skillStore.fetchSkills()
  } catch (error) {
    message.error(`加载失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleToggle(name: string, enabled: boolean) {
  try {
    await skillStore.toggleSkill(name, enabled)
    message.success(enabled ? '已启用' : '已停用')
  } catch (error) {
    message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function toggleExpand(name: string) {
  expandedSkill.value = expandedSkill.value === name ? null : name
}

onMounted(() => {
  refreshAll()
})
</script>

<template>
  <div class="ling-skills">
    <header class="page-head">
      <div>
        <h1 class="page-title">技能广场</h1>
        <p class="page-subtitle">Hermes Agent 安装的能力(Skills)。点击技能可浏览源文件,也可一键启停。</p>
      </div>
      <NButton :loading="skillStore.loading" @click="refreshAll">
        <template #icon><NIcon><RefreshOutline /></NIcon></template>
        刷新
      </NButton>
    </header>

    <NSpin :show="skillStore.loading">
      <!-- 工具条 -->
      <section class="toolbar">
        <NInput
          v-model:value="searchQuery"
          clearable
          placeholder="搜索技能名称、描述或分类"
          size="medium"
          class="search-input"
        >
          <template #prefix><NIcon><SearchOutline /></NIcon></template>
        </NInput>
        <NSelect
          v-model:value="categoryFilter"
          :options="categoryOptions"
          size="medium"
          class="category-select"
        />
        <span class="stats-meta">
          {{ stats.total }} 个技能 · {{ stats.enabled }} 启用 · {{ stats.categories }} 分类
        </span>
      </section>

      <div v-if="skillStore.lastError" class="error-bar">
        加载失败: {{ skillStore.lastError }}
      </div>

      <section class="skills-section">
        <div v-if="filteredSkills.length === 0 && !skillStore.loading" class="empty">
          <NIcon size="32"><ExtensionPuzzleOutline /></NIcon>
          <div class="empty-title">{{ skillStore.skills.length === 0 ? '还没有技能' : '没有匹配的技能' }}</div>
          <div class="empty-hint">
            {{ skillStore.skills.length === 0
              ? '通过 Hermes CLI 或社区库安装技能后,会出现在这里'
              : '换个搜索词或切换分类试试' }}
          </div>
        </div>

        <div v-else class="skills-list">
          <div
            v-for="s in filteredSkills"
            :key="s.name"
            class="skill-item"
            :class="{ 'is-enabled': s.enabled, 'is-expanded': expandedSkill === s.name }"
          >
            <div class="skill-row" @click="toggleExpand(s.name)">
              <div class="skill-main">
                <div class="skill-name-wrap">
                  <span class="skill-name">{{ s.name }}</span>
                  <NTag v-if="s.category" size="small" :bordered="false" type="info">{{ s.category }}</NTag>
                  <NTag v-if="s.version" size="small" :bordered="false">v{{ s.version }}</NTag>
                </div>
                <p v-if="s.description" class="skill-desc">{{ s.description }}</p>
                <div class="skill-meta">
                  <span v-if="s.author">作者: {{ s.author }}</span>
                  <span v-if="s.source">来源: {{ s.source }}</span>
                  <span v-if="s.trust_level">信任级别: {{ s.trust_level }}</span>
                </div>
              </div>
              <div class="skill-actions" @click.stop>
                <NSwitch
                  :value="s.enabled"
                  size="small"
                  @update:value="(v: boolean) => handleToggle(s.name, v)"
                />
                <NIcon size="16" class="chevron">
                  <ChevronUpOutline v-if="expandedSkill === s.name" />
                  <ChevronDownOutline v-else />
                </NIcon>
              </div>
            </div>

            <div v-if="expandedSkill === s.name" class="skill-browser">
              <SkillFileBrowser
                :skill-name="s.name"
                :skill-category="s.category"
                :skill-path="s.path"
              />
            </div>
          </div>
        </div>
      </section>
    </NSpin>
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
  margin-bottom: 20px;
}

.page-title {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.2px;
  color: var(--n-text-color);
  margin: 0 0 6px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--n-text-color-3);
  margin: 0;
  max-width: 560px;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 0 4px;
  flex-wrap: wrap;
}

.search-input { flex: 1; min-width: 200px; max-width: 320px; }
.category-select { min-width: 140px; max-width: 180px; }

.stats-meta {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

.error-bar {
  background: rgba(255, 59, 48, 0.08);
  color: #FF3B30;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}

.skills-section { margin-top: 4px; }

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-item {
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.skill-item.is-enabled {
  border-color: rgba(52, 199, 89, 0.35);
  background: rgba(52, 199, 89, 0.02);
}

:root[data-theme='dark'] .skill-item.is-enabled {
  border-color: rgba(48, 209, 88, 0.35);
  background: rgba(48, 209, 88, 0.05);
}

.skill-item.is-expanded {
  border-color: rgba(0, 122, 255, 0.4);
}

.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.skill-row:hover { background: var(--n-action-color); }

.skill-main { flex: 1; min-width: 0; }

.skill-name-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.skill-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--n-text-color);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.skill-desc {
  font-size: 12.5px;
  color: var(--n-text-color-2);
  line-height: 1.5;
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.skill-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--n-text-color-3);
}

.skill-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.chevron { color: var(--n-text-color-3); }

.skill-browser {
  border-top: 1px solid var(--n-border-color);
  padding: 12px 14px;
  background: var(--n-action-color);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 60px 20px;
  color: var(--n-text-color-3);
  text-align: center;
}

.empty-title {
  font-size: 14px;
  color: var(--n-text-color-2);
  margin-top: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--n-text-color-3);
}
</style>
