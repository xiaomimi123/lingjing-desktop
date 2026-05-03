<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  zhCN,
  enUS,
  dateZhCN,
  dateEnUS,
} from "naive-ui";
import { useI18n } from "vue-i18n";
import { useTheme } from "@/composables/useTheme";
import { useLingjingTheme } from "@/composables/useLingjingTheme";
import { useLocaleStore } from "@/stores/locale";

const { theme } = useTheme();
const { themeOverrides } = useLingjingTheme();
const route = useRoute();
const router = useRouter();
const localeStore = useLocaleStore();
const { t } = useI18n();

// Mac 习惯快捷键 ⌘+, → 设置
function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    if (router.currentRoute.value.name !== 'Settings') {
      router.push({ name: 'Settings' });
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

const naiveLocale = computed(() =>
  localeStore.locale === "zh-CN" ? zhCN : enUS,
);
const naiveDateLocale = computed(() =>
  localeStore.locale === "zh-CN" ? dateZhCN : dateEnUS,
);

watch(
  () =>
    [route.meta.titleKey as string | undefined, localeStore.locale] as const,
  ([titleKey]) => {
    if (typeof document === "undefined") return;
    if (!titleKey) {
      document.title = "灵境";
      return;
    }
    const title = t(titleKey);
    document.title = `${title} - 灵境`;
  },
  { immediate: true },
);
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
  >
    <NNotificationProvider>
      <NMessageProvider>
        <NDialogProvider>
          <RouterView />
        </NDialogProvider>
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>
