<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDataStore } from "./stores/useDataStore";
import { storeToRefs } from "pinia";

const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();
const { summary } = storeToRefs(dataStore);

const headerRef = ref(null);
const contentPaddingTop = ref('112px'); // Default fallback

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

onMounted(() => {
  updatePadding();
  
  if (headerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updatePadding();
    });
    resizeObserver.observe(headerRef.value);
  }
  
  window.addEventListener('resize', updatePadding);
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  window.removeEventListener('resize', updatePadding);
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
        <div class="topbar-status">
          <span class="status-dot"></span>
          <span>系统状态: 运行中</span>
          <strong>| 帧率: {{ summary.fps }} FPS</strong>
        </div>
      </div>
    </header>

    <main class="main-content" :style="{ paddingTop: contentPaddingTop }">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>
