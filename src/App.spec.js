import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, vi } from "vitest";
import App from "./App.vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Create a mock router
const routes = [
  { path: "/dashboard", name: "dashboard", component: { template: '<div class="dashboard">Dashboard Content</div>' } },
  { path: "/metrics", name: "metrics", component: { template: '<div class="metrics">Metrics Content</div>' } },
  { path: "/tasks", name: "tasks", component: { template: '<div class="tasks">Tasks Content</div>' } },
  { path: "/settings", name: "settings", component: { template: '<div class="settings">Settings Content</div>' } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

describe("App.vue Module Switching", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    router.push("/dashboard");
    await router.isReady();
  });

  it("renders dashboard initially", async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [router]
      }
    });

    expect(wrapper.html()).toContain("无人机目标检测系统");
    expect(wrapper.find(".dashboard").exists()).toBe(true);
  });

  it("switches to metrics when navigating", async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [router]
      }
    });

    await router.push("/metrics");
    expect(wrapper.find(".metrics").exists()).toBe(true);
  });

  it("handles navigation clicks properly", async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [router]
      }
    });

    const buttons = wrapper.findAll(".nav-item");
    const metricsBtn = buttons.find(b => b.text() === "指标");
    
    await metricsBtn.trigger("click");
    await router.isReady();
    
    expect(router.currentRoute.value.name).toBe("metrics");
    expect(wrapper.find(".metrics").exists()).toBe(true);
  });
});
