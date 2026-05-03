import { createI18n } from 'vue-i18n'
import zhCN from './messages/zh-CN'
import enUS from './messages/en-US'

const FIXED_LOCALE = 'zh-CN' as const

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: FIXED_LOCALE,
  fallbackLocale: FIXED_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})
