<script setup>
import { computed, ref, watch, onMounted, onUnmounted, onErrorCaptured } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDataStore } from "./stores/useDataStore";
import { useConfigStore } from "./stores/useConfigStore";
import { storeToRefs } from "pinia";
import AiAssistant from "./components/AiAssistant.vue";

const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();
const configStore = useConfigStore();
const { summary } = storeToRefs(dataStore);
const { theme } = storeToRefs(configStore);

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}

function applyTheme(val) {
  document.documentElement.setAttribute("data-theme", val);
}

watch(theme, applyTheme, { immediate: true });

const headerRef = ref(null);
const contentPaddingTop = ref("112px"); // Default fallback

const tabs = [
  { key: "dashboard", label: "大屏", icon: "screen", path: "/dashboard" },
  { key: "metrics", label: "指标", icon: "chart", path: "/metrics" },
  { key: "tasks", label: "任务", icon: "list", path: "/tasks" },
  { key: "settings", label: "配置", icon: "gear", path: "/settings" },
];

const activeTab = computed(() => route.name || "dashboard");

function navigate(key) {
  router.push({ name: key });
}

let resizeObserver = null;

function updatePadding() {
  if (headerRef.value) {
    // Get exact header height + 24px buffer
    const height = headerRef.value.offsetHeight;
    contentPaddingTop.value = `${height + 24}px`;
  }
}

// Error Boundary & Loading State
const hasError = ref(false);
const errorMessage = ref("");
const isNavigating = ref(false);

router.beforeEach((to, from, next) => {
  hasError.value = false;
  isNavigating.value = true;
  next();
});

router.afterEach(() => {
  isNavigating.value = false;
});

onErrorCaptured((err, instance, info) => {
  console.error("Module rendering error:", err, info);
  hasError.value = true;
  errorMessage.value = err.message || "模块渲染异常，请刷新重试";
  return false; // stop propagation
});

onMounted(() => {
  updatePadding();

  if (headerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updatePadding();
    });
    resizeObserver.observe(headerRef.value);
  }

  window.addEventListener("resize", updatePadding);
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  window.removeEventListener("resize", updatePadding);
});
</script>

<template>
  <div class="app-shell">
    <header class="fixed-header" ref="headerRef">
      <div class="header-left">
        <div class="brand-block">
          <div class="brand-mark">UAV</div>
          <div>
            <p class="eyebrow"></p>
            <h1>无人机目标检测系统</h1>
          </div>
        </div>
      </div>

      <nav class="header-center">
        <div class="nav-list">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :class="['nav-item', { active: activeTab === tab.key }]"
            @click="navigate(tab.key)"
          >
            <span :class="['nav-icon', `nav-icon-${tab.icon}`]"></span>
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </nav>

      <div class="header-right">
        <button class="theme-toggle" @click="toggleTheme" :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'">
          <span v-if="theme === 'dark'">&#9790;</span>
          <span v-else>&#9728;</span>
        </button>
        <div class="topbar-status">
          <span class="status-dot"></span>
          <span>系统状态: 运行中</span>
          <strong>| 帧率: {{ summary.fps }} FPS</strong>
        </div>
      </div>
    </header>

    <main class="main-content" :style="{ paddingTop: contentPaddingTop }">
      <div v-if="hasError" class="error-boundary">
        <div class="empty-state-content">
          <div class="icon">⚠️</div>
          <h3>模块加载失败</h3>
          <p>{{ errorMessage }}</p>
          <button
            class="action-btn primary"
            @click="
              hasError = false;
              navigate(activeTab);
            "
          >
            重试
          </button>
        </div>
      </div>
      <div v-else-if="isNavigating" class="loading-state">
        <div class="empty-state-content">
          <div class="icon spinner">⏳</div>
          <p>模块加载中...</p>
        </div>
      </div>
      <router-view v-else v-slot="{ Component, route }">
        <transition name="fade" mode="out-in">
          <keep-alive>
            <component :is="Component" :key="route.fullPath" />
          </keep-alive>
        </transition>
      </router-view>
    </main>

    <AiAssistant />
  </div>
</template>

<style scoped>
.error-boundary,
.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 50vh;
  text-align: center;
  color: var(--muted);
}
.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.icon {
  font-size: 48px;
}
.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
