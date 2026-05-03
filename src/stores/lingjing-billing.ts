import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getBalance, formatBalance } from '@/api/lingjing/billing'

export const useLingjingBillingStore = defineStore('lingjing-billing', () => {
  const quota = ref<number>(0)
  const usedQuota = ref<number>(0)
  const lastUpdatedAt = ref<number>(0)
  const fetching = ref(false)
  const lastError = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const balanceCny = computed(() => formatBalance(quota.value, 'CNY'))
  const balanceUsd = computed(() => formatBalance(quota.value, 'USD'))

  async function fetchBalance() {
    if (fetching.value) return
    fetching.value = true
    lastError.value = null
    try {
      const resp = await getBalance()
      if (resp.success && resp.data) {
        const q = resp.data.quota
        const u = resp.data.used_quota
        quota.value = typeof q === 'number' ? q : Number(q ?? 0)
        usedQuota.value = typeof u === 'number' ? u : Number(u ?? 0)
        lastUpdatedAt.value = Date.now()
      } else {
        lastError.value = resp.message || 'Failed to fetch balance'
      }
    } catch (err: any) {
      console.error('[billing] fetchBalance failed:', err)
      lastError.value = err?.message || 'Network error'
    } finally {
      fetching.value = false
    }
  }

  function startPolling(intervalMs = 30_000) {
    stopPolling()
    fetchBalance()
    pollTimer = setInterval(fetchBalance, intervalMs)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function reset() {
    stopPolling()
    quota.value = 0
    usedQuota.value = 0
    lastUpdatedAt.value = 0
    lastError.value = null
  }

  return {
    quota,
    usedQuota,
    lastUpdatedAt,
    fetching,
    lastError,
    balanceCny,
    balanceUsd,
    fetchBalance,
    startPolling,
    stopPolling,
    reset,
  }
})
