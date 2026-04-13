import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach } from "vitest";
import MetricsView from "./MetricsView.vue";
import { createPinia, setActivePinia } from "pinia";

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("MetricsView.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders correctly", () => {
    const wrapper = mount(MetricsView);
    expect(wrapper.exists()).toBe(true);
  });
});
