import { ref } from 'vue'
import { defineStore } from 'pinia'
import { i18n } from '@/i18n'
import type { AppLocale } from '@/i18n/locale'

const FIXED_LOCALE: AppLocale = 'zh-CN'

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('lang', FIXED_LOCALE)
}
i18n.global.locale.value = FIXED_LOCALE

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<AppLocale>(FIXED_LOCALE)

  function setLocale(_next: AppLocale, _persist = true) {
    // v1.0 锁定为 zh-CN,保留方法签名以免上游调用方报错
  }

  function toggle() {
    // v1.0 锁定为 zh-CN,保留方法签名以免上游调用方报错
  }

  return { locale, setLocale, toggle }
})
