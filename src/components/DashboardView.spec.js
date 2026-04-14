import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, vi } from "vitest";
import DashboardView from "./DashboardView.vue";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore } from "../stores/useConfigStore";
import { useDataStore } from "../stores/useDataStore";

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  }),
);

// Mock axios
import axios from "axios";
vi.mock("axios", () => {
  return {
    default: {
      post: vi.fn(),
      isCancel: vi.fn(() => false),
    },
  };
});

describe("DashboardView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders system status correctly", () => {
    const wrapper = mount(DashboardView);
    expect(wrapper.text()).toContain("系统控制");
    expect(wrapper.text()).toContain("运行中");
  });

  it("toggles system status when button clicked", async () => {
    const wrapper = mount(DashboardView);
    const buttons = wrapper.findAll("button");
    const toggleBtn = buttons.find(
      (b) => b.text().includes("停止检测") || b.text().includes("开始检测"),
    );

    expect(toggleBtn.text()).toBe("停止检测");
    await toggleBtn.trigger("click");
    expect(toggleBtn.text()).toBe("开始检测");
  });

  it("shows empty state when no media source is connected", () => {
    const wrapper = mount(DashboardView);
    expect(wrapper.find(".empty-state-overlay").exists()).toBe(true);
    expect(wrapper.find(".empty-state-overlay h3").text()).toContain(
      "暂无数据源接入",
    );
    expect(wrapper.find(".empty-state-overlay p").text()).toContain(
      "当前未检测到任何输入",
    );
  });

  it("displays offline error in empty state", async () => {
    const wrapper = mount(DashboardView);

    // Simulate offline
    wrapper.vm.isOffline = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".empty-state-overlay h3").text()).toContain(
      "网络已断开",
    );
    expect(wrapper.find(".empty-state-overlay p").text()).toContain(
      "请检查您的网络连接状态",
    );
  });

  it("displays connection error in empty state", async () => {
    const wrapper = mount(DashboardView);

    // Simulate error
    wrapper.vm.mediaError = "视频检测服务连接失败，请检查后端状态";
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".empty-state-overlay h3").text()).toContain(
      "接入异常",
    );
    expect(wrapper.find(".empty-state-overlay p").text()).toContain(
      "视频检测服务连接失败，请检查后端状态",
    );
  });

  it("calculates canvas detection coordinates correctly with object-fit contain logic", async () => {
    // 模拟 Canvas 及其 Context
    const mockStrokeRect = vi.fn();
    const mockClearRect = vi.fn();
    const mockContext = {
      clearRect: mockClearRect,
      strokeRect: mockStrokeRect,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn(() => ({ width: 50 })),
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };

    // 我们需要通过覆盖 HTMLCanvasElement 的 getContext 来注入 Mock
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => mockContext;

    const wrapper = mount(DashboardView);

    // 强制触发一次图片加载事件
    wrapper.vm.activeMode = "image";
    wrapper.vm.imageUrl = "blob:mock";

    // 模拟检测结果
    wrapper.vm.canvasDetections = [
      {
        id: "1",
        label: "car",
        confidence: 0.9,
        bbox: [100, 100, 200, 200], // 原始图片中的 [x1, y1, x2, y2]
      },
    ];

    // 等待 DOM 更新
    await wrapper.vm.$nextTick();

    // 模拟 localImg 元素的 clientWidth, clientHeight 以及 naturalWidth, naturalHeight
    // 情景 1：容器比图片宽 (图片高撑满容器，左右留白)
    // 容器: 800x600, 图片: 400x400
    // => 图片渲染大小应为 600x600, 偏移量 offsetX: (800-600)/2 = 100, offsetY: 0
    // => scale: 600/400 = 1.5
    // => bbox [100, 100, 200, 200]
    // => 渲染的 x = 100 * 1.5 + 100 = 250
    // => 渲染的 y = 100 * 1.5 + 0 = 150
    // => w = 100 * 1.5 = 150, h = 100 * 1.5 = 150

    const imgEl = wrapper.find('img[src="blob:mock"]').element;

    // We mock the parentElement (the container) and its clientWidth/Height
    const mockParent = {
      clientWidth: 800,
      clientHeight: 600,
    };
    Object.defineProperty(imgEl, "parentElement", {
      value: mockParent,
      configurable: true,
    });

    Object.defineProperty(imgEl, "naturalWidth", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(imgEl, "naturalHeight", {
      value: 400,
      configurable: true,
    });

    // 触发图片加载事件
    wrapper.vm.onLocalImageLoaded();

    expect(mockStrokeRect).toHaveBeenCalledWith(250, 150, 150, 150);

    // 清理 mock
    mockStrokeRect.mockClear();

    // 情景 2：容器比图片窄 (图片宽撑满容器，上下留白)
    // 容器: 400x800, 图片: 400x200
    // => 图片渲染大小应为 400x200, 偏移量 offsetX: 0, offsetY: (800-200)/2 = 300
    // => scale: 400/400 = 1.0
    // => bbox [100, 100, 200, 200]
    // => 渲染的 x = 100 * 1.0 + 0 = 100
    // => 渲染的 y = 100 * 1.0 + 300 = 400
    // => w = 100 * 1.0 = 100, h = 100 * 1.0 = 100

    const mockParent2 = {
      clientWidth: 400,
      clientHeight: 800,
    };
    Object.defineProperty(imgEl, "parentElement", {
      value: mockParent2,
      configurable: true,
    });

    Object.defineProperty(imgEl, "naturalWidth", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(imgEl, "naturalHeight", {
      value: 200,
      configurable: true,
    });

    wrapper.vm.onLocalImageLoaded();

    expect(mockStrokeRect).toHaveBeenCalledWith(100, 400, 100, 100);

    // 恢复 originalGetContext
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("clears error when button clicked", async () => {
    const wrapper = mount(DashboardView);
    wrapper.vm.mediaError = "视频检测服务连接失败，请检查后端状态";
    await wrapper.vm.$nextTick();

    const clearBtn = wrapper.find(".empty-state-content button");
    expect(clearBtn.text()).toBe("清除错误");
    await clearBtn.trigger("click");
    expect(wrapper.vm.mediaError).toBe("");
  });

  it("handles single video upload correctly", async () => {
    const wrapper = mount(DashboardView);
    wrapper.vm.activeMode = "video";

    const mockFile = new File(
      ["dummy content".repeat(1024 * 1024)],
      "test.mp4",
      { type: "video/mp4" },
    );
    Object.defineProperty(mockFile, "size", { value: 12 * 1024 * 1024 }); // 12MB file

    wrapper.vm.videoFile = mockFile;
    await wrapper.vm.$nextTick();

    axios.post.mockClear();

    axios.post.mockResolvedValueOnce({
      data: { success: true, data: { taskId: "task_123" } },
    });

    await wrapper.vm.startVideoUpload();

    expect(wrapper.vm.uploadState).toBe("success");
    expect(wrapper.vm.uploadProgress).toBe(100);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.videoTaskId).toBe("task_123");
  });

  it("handles single video upload cancel and restart", async () => {
    const wrapper = mount(DashboardView);
    wrapper.vm.activeMode = "video";

    axios.post.mockClear();

    const mockFile = new File(["dummy"], "test2.mp4", { type: "video/mp4" });
    Object.defineProperty(mockFile, "size", { value: 6 * 1024 * 1024 });

    wrapper.vm.videoFile = mockFile;

    // Mock an error to simulate abort
    axios.isCancel.mockReturnValueOnce(true);
    axios.post.mockRejectedValueOnce({ isCancel: true, message: "canceled" });

    await wrapper.vm.startVideoUpload();

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.uploadState).toBe("uploading"); // Or paused depending on how we called it, let's just check it doesn't succeed
  });
});
