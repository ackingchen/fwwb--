<script setup>
import {
  computed,
  nextTick,
  ref,
  watch,
  onMounted,
  onUnmounted,
  onErrorCaptured,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDataStore } from "./stores/useDataStore";
import { useConfigStore } from "./stores/useConfigStore";
import { storeToRefs } from "pinia";
import AiAssistant from "./components/AiAssistant.vue";
import AppGuideIntro from "./components/AppGuideIntro.vue";
import AppGuideOverlay from "./components/AppGuideOverlay.vue";
import { useOnboardingGuide } from "./guide/useOnboardingGuide";
import {
  fetchAuthSession,
  getAuthSession,
  logoutFromBackend,
} from "./utils/auth";

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
const contentPaddingTop = ref("112px");

const tabs = [
  { key: "dashboard", label: "大屏", icon: "screen", path: "/dashboard" },
  { key: "metrics", label: "指标", icon: "chart", path: "/metrics" },
  { key: "tasks", label: "任务", icon: "list", path: "/tasks" },
  { key: "settings", label: "配置", icon: "gear", path: "/settings" },
];

const isAuthRoute = computed(() => route.name === "auth");
const activeTab = computed(() => route.name || "dashboard");
const authUsername = ref("");
const {
  isGuideIntroVisible,
  isGuideVisible,
  currentGuideStep,
  currentGuideStepIndex,
  totalGuideSteps,
  currentGuideTargetRect,
  startGuideFromIntro,
  skipGuideFromIntro,
  nextGuideStep,
  skipGuide,
} = useOnboardingGuide({
  route,
  router,
  isAuthRoute,
});

function navigate(key) {
  router.push({ name: key });
}

let resizeObserver = null;

function updatePadding() {
  if (!headerRef.value) return;
  const height = headerRef.value.offsetHeight;
  contentPaddingTop.value = `${height + 24}px`;
}

function refreshAuthUser() {
  const currentSession = getAuthSession();
  authUsername.value =
    currentSession?.displayName ||
    currentSession?.username ||
    currentSession?.email ||
    "";
}

function startObserveHeader() {
  if (!headerRef.value || resizeObserver) return;
  resizeObserver = new ResizeObserver(() => {
    updatePadding();
  });
  resizeObserver.observe(headerRef.value);
}

function stopObserveHeader() {
  if (!resizeObserver) return;
  resizeObserver.disconnect();
  resizeObserver = null;
}

function setupHeaderLayout() {
  updatePadding();
  stopObserveHeader();
  startObserveHeader();
}

async function logout() {
  await logoutFromBackend();
  refreshAuthUser();
  router.replace({ name: "auth" });
}

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
  return false;
});

onMounted(async () => {
  await fetchAuthSession();
  refreshAuthUser();
  if (!isAuthRoute.value) {
    setupHeaderLayout();
  }
  window.addEventListener("resize", updatePadding);
});

onUnmounted(() => {
  stopObserveHeader();
  window.removeEventListener("resize", updatePadding);
});

watch(
  () => route.fullPath,
  () => {
    refreshAuthUser();
  },
  { immediate: true },
);

watch(
  isAuthRoute,
  (authRoute) => {
    if (authRoute) {
      stopObserveHeader();
      return;
    }
    nextTick(() => {
      setupHeaderLayout();
    });
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="isAuthRoute" class="auth-route-shell">
    <router-view />
  </div>

  <div v-else class="app-shell">
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
        <div class="nav-list" data-guide="app.nav">
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
        <button
          class="theme-toggle"
          data-guide="app.theme-toggle"
          @click="toggleTheme"
          :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
        >
          <span v-if="theme === 'dark'">&#9790;</span>
          <span v-else>&#9728;</span>
        </button>
        <div class="header-user-block">
          <span class="user-chip">{{ authUsername || "已登录用户" }}</span>
          <button class="logout-btn" data-guide="app.logout" @click="logout">退出登录</button>
        </div>
        <div class="topbar-status" data-guide="app.status">
          <span class="status-dot"></span>
          <span>系统状态: 运行中</span>
          <strong>| 帧率: {{ summary.fps ?? '--' }} FPS</strong>
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
      <div v-else class="route-container">
        <div v-if="isNavigating" class="loading-overlay">
          <div class="empty-state-content">
            <div class="icon spinner">⏳</div>
            <p>模块加载中...</p>
          </div>
        </div>
        <router-view v-slot="{ Component, route }">
          <transition name="fade" mode="out-in">
            <keep-alive>
              <component :is="Component" :key="route.fullPath" />
            </keep-alive>
          </transition>
        </router-view>
      </div>
    </main>

    <AiAssistant />
    <AppGuideIntro
      :visible="isGuideIntroVisible"
      @start="startGuideFromIntro"
      @skip="skipGuideFromIntro"
    />
    <AppGuideOverlay
      v-if="isGuideVisible && currentGuideStep"
      :step="currentGuideStep"
      :step-index="currentGuideStepIndex"
      :total-steps="totalGuideSteps"
      :target-rect="currentGuideTargetRect"
      @next="nextGuideStep"
      @skip="skipGuide"
    />
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
.route-container {
  position: relative;
  min-height: 50vh;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  justify-content: center;
  align-items: center;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  pointer-events: none;
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

.auth-route-shell {
  min-height: 100vh;
}

.header-user-block {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: 10px;
}

.user-chip {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--status-border);
  background: var(--status-bg);
  color: var(--text);
  font-size: 12px;
}

.logout-btn {
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--danger) 48%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  padding: 0 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background: color-mix(in srgb, var(--danger) 20%, transparent);
}

@media (max-width: 768px) {
  .header-user-block {
    margin-right: 0;
    width: 100%;
    justify-content: space-between;
  }
}
</style>
