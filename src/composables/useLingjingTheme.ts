import { computed } from 'vue'
import type { GlobalThemeOverrides } from 'naive-ui'
import { useTheme } from './useTheme'

// 参考 LastAi (shadcn/ui neutral theme) —— 完全灰度,产品级 Apple 风
// 没有彩色品牌色,主色 = 黑/白,只在 destructive / 链接处出红/蓝

const fontFamilySystem =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", sans-serif'
const fontFamilyMonoSystem =
  'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

// HSL → hex helper(避免运行时计算,直接给值)
const TOKENS = {
  light: {
    background: '#FFFFFF',
    foreground: '#0A0A0A',          // hsl(0 0% 3.9%)
    card: '#FFFFFF',
    cardForeground: '#0A0A0A',
    primary: '#171717',              // hsl(0 0% 9%)
    primaryHover: '#262626',
    primaryPressed: '#000000',
    primaryForeground: '#FAFAFA',
    muted: '#F5F5F5',                // hsl(0 0% 96.1%)
    mutedForeground: '#737373',      // hsl(0 0% 45.1%)
    accent: '#F5F5F5',
    accentHover: '#EBEBEB',
    border: '#E5E5E5',               // hsl(0 0% 89.8%)
    input: '#E5E5E5',
    ring: '#A3A3A3',
    destructive: '#E5484D',
  },
  dark: {
    background: '#0A0A0A',           // hsl(0 0% 3.9%)
    foreground: '#FAFAFA',
    card: '#0E0E0E',                 // hsl(0 0% 5.5%) 略亮一点
    cardForeground: '#FAFAFA',
    primary: '#FAFAFA',
    primaryHover: '#E5E5E5',
    primaryPressed: '#D4D4D4',
    primaryForeground: '#171717',
    muted: '#262626',                // hsl(0 0% 14.9%)
    mutedForeground: '#A3A3A3',      // hsl(0 0% 63.9%)
    accent: '#262626',
    accentHover: '#333333',
    border: '#262626',
    input: '#262626',
    ring: '#525252',
    destructive: '#E5484D',
  },
}

const baseSharedCommon = {
  fontFamily: fontFamilySystem,
  fontFamilyMono: fontFamilyMonoSystem,
  borderRadius: '6px',
  borderRadiusSmall: '4px',
}

const baseSharedComponents: GlobalThemeOverrides = {
  Button: {
    borderRadiusMedium: '6px',
    borderRadiusLarge: '8px',
    fontWeight: '500',
  },
  Card: {
    borderRadius: '8px',
    paddingMedium: '16px',
  },
  Input: {
    borderRadius: '6px',
    heightMedium: '36px',
  },
  Drawer: {
    borderRadius: '12px',
  },
  Modal: {
    peers: {
      Card: {
        borderRadius: '10px',
      },
    },
  },
}

export const lightOverrides: GlobalThemeOverrides = {
  common: {
    ...baseSharedCommon,
    primaryColor: TOKENS.light.primary,
    primaryColorHover: TOKENS.light.primaryHover,
    primaryColorPressed: TOKENS.light.primaryPressed,
    primaryColorSuppl: TOKENS.light.primary,
    infoColor: TOKENS.light.primary,
    infoColorHover: TOKENS.light.primaryHover,
    infoColorPressed: TOKENS.light.primaryPressed,
    infoColorSuppl: TOKENS.light.primary,
    bodyColor: TOKENS.light.background,
    cardColor: TOKENS.light.card,
    textColorBase: TOKENS.light.foreground,
    textColor1: TOKENS.light.foreground,
    textColor2: TOKENS.light.foreground,
    textColor3: TOKENS.light.mutedForeground,
    textColorDisabled: TOKENS.light.mutedForeground,
    borderColor: TOKENS.light.border,
    dividerColor: TOKENS.light.border,
    inputColor: TOKENS.light.background,
    actionColor: TOKENS.light.muted,
    hoverColor: TOKENS.light.accentHover,
    pressedColor: TOKENS.light.accent,
  },
  ...baseSharedComponents,
  Layout: {
    color: TOKENS.light.background,
    siderColor: TOKENS.light.background,
    headerColor: TOKENS.light.background,
  },
  Menu: {
    borderRadius: '6px',
    itemHeight: '36px',
    itemTextColor: TOKENS.light.mutedForeground,
    itemTextColorHover: TOKENS.light.foreground,
    itemTextColorActive: TOKENS.light.foreground,
    itemTextColorChildActive: TOKENS.light.foreground,
    itemIconColor: TOKENS.light.mutedForeground,
    itemIconColorHover: TOKENS.light.foreground,
    itemIconColorActive: TOKENS.light.foreground,
    itemIconColorChildActive: TOKENS.light.foreground,
    itemColorActive: TOKENS.light.muted,
    itemColorActiveHover: TOKENS.light.accentHover,
    itemColorActiveCollapsed: TOKENS.light.muted,
  },
}

export const darkOverrides: GlobalThemeOverrides = {
  common: {
    ...baseSharedCommon,
    primaryColor: TOKENS.dark.primary,
    primaryColorHover: TOKENS.dark.primaryHover,
    primaryColorPressed: TOKENS.dark.primaryPressed,
    primaryColorSuppl: TOKENS.dark.primary,
    infoColor: TOKENS.dark.primary,
    infoColorHover: TOKENS.dark.primaryHover,
    infoColorPressed: TOKENS.dark.primaryPressed,
    infoColorSuppl: TOKENS.dark.primary,
    bodyColor: TOKENS.dark.background,
    cardColor: TOKENS.dark.card,
    textColorBase: TOKENS.dark.foreground,
    textColor1: TOKENS.dark.foreground,
    textColor2: TOKENS.dark.foreground,
    textColor3: TOKENS.dark.mutedForeground,
    textColorDisabled: TOKENS.dark.mutedForeground,
    borderColor: TOKENS.dark.border,
    dividerColor: TOKENS.dark.border,
    inputColor: TOKENS.dark.muted,
    actionColor: TOKENS.dark.muted,
    hoverColor: TOKENS.dark.accentHover,
    pressedColor: TOKENS.dark.accent,
  },
  ...baseSharedComponents,
  Layout: {
    color: TOKENS.dark.background,
    siderColor: TOKENS.dark.card,
    headerColor: TOKENS.dark.card,
  },
  Menu: {
    borderRadius: '6px',
    itemHeight: '36px',
    itemTextColor: TOKENS.dark.mutedForeground,
    itemTextColorHover: TOKENS.dark.foreground,
    itemTextColorActive: TOKENS.dark.foreground,
    itemTextColorChildActive: TOKENS.dark.foreground,
    itemIconColor: TOKENS.dark.mutedForeground,
    itemIconColorHover: TOKENS.dark.foreground,
    itemIconColorActive: TOKENS.dark.foreground,
    itemIconColorChildActive: TOKENS.dark.foreground,
    itemColorActive: TOKENS.dark.muted,
    itemColorActiveHover: TOKENS.dark.accentHover,
    itemColorActiveCollapsed: TOKENS.dark.muted,
  },
}

export function useLingjingTheme() {
  const { isDark } = useTheme()
  const themeOverrides = computed(() => (isDark.value ? darkOverrides : lightOverrides))
  return { themeOverrides }
}
