<template>
  <div class="welcome-screen">
    <div class="brand-mark">灵境</div>
    <div class="spinner" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.welcome-screen {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  background: #FFFFFF;
  color: #1F1F1F;
  user-select: none;
  -webkit-app-region: drag;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.brand-mark {
  font-size: 38px;
  font-weight: 200;
  letter-spacing: 0.4em;
  padding-left: 0.4em;
  color: #1F1F1F;
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.08);
  border-top-color: rgba(0, 0, 0, 0.55);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

:root[data-theme='dark'] .welcome-screen {
  background: #1C1C1E;
  color: #F2F2F7;
}
:root[data-theme='dark'] .brand-mark { color: #F2F2F7; }
:root[data-theme='dark'] .spinner {
  border-color: rgba(255, 255, 255, 0.12);
  border-top-color: rgba(255, 255, 255, 0.7);
}
</style>
