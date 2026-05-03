<script setup lang="ts">
import { h } from 'vue'
import { NSelect, NIcon } from 'naive-ui'
import { ChatboxEllipsesOutline, ConstructOutline } from '@vicons/ionicons5'
import { useHermesConnectionStore } from '@/stores/hermes/connection'

const connStore = useHermesConnectionStore()

const options = [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'Hermes Agent', value: 'hermes' },
]

const iconMap: Record<string, unknown> = {
  openclaw: ChatboxEllipsesOutline,
  hermes: ConstructOutline,
}

function renderLabel(option: { label: string; value: string }) {
  const icon = iconMap[option.value]
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      },
    },
    [
      icon
        ? h(NIcon, { size: 16 }, { default: () => h(icon as any) })
        : null,
      h('span', {}, option.label),
    ],
  )
}

async function handleChange(val: string) {
  await connStore.switchGateway(val as 'openclaw' | 'hermes')
}
</script>

<template>
  <NSelect
    :value="connStore.currentGateway"
    :options="options"
    :render-label="renderLabel"
    size="small"
    style="width: 110px"
    @update:value="handleChange"
  />
</template>
