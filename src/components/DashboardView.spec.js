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
      "请检查网络连接状态",
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
    // 容器: 800x600, ͼƬ: 400x400
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
    // 容器: 400x800, ͼƬ: 400x200
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

  it("captures screenshot with media source size when stage is larger than overlay canvas", async () => {
    const mockDrawImage = vi.fn();
    const mockFillRect = vi.fn();
    const mockContext = {
      drawImage: mockDrawImage,
      fillRect: mockFillRect,
      get fillStyle() {
        return this._fillStyle;
      },
      set fillStyle(value) {
        this._fillStyle = value;
      },
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalCreateElement = document.createElement.bind(document);
    HTMLCanvasElement.prototype.getContext = () => mockContext;
    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue("data:image/png;base64,mock");
    document.createElement = (tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === "a") {
        el.click = vi.fn();
      }
      return el;
    };

    const wrapper = mount(DashboardView);
    wrapper.vm.activeMode = "image";
    wrapper.vm.imageUrl = "blob:mock-image";
    await wrapper.vm.$nextTick();

    const stageEl = wrapper.find(".video-stage").element;
    Object.defineProperty(stageEl, "clientWidth", {
      value: 1920,
      configurable: true,
    });
    Object.defineProperty(stageEl, "clientHeight", {
      value: 1080,
      configurable: true,
    });
    stageEl.getBoundingClientRect = () => ({
      width: 1920,
      height: 1080,
    });

    const overlayCanvas = wrapper.find("canvas").element;
    overlayCanvas.width = 960;
    overlayCanvas.height = 540;

    const imgEl = wrapper.find('img[src="blob:mock-image"]').element;
    Object.defineProperty(imgEl, "complete", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(imgEl, "naturalWidth", {
      value: 1280,
      configurable: true,
    });
    Object.defineProperty(imgEl, "naturalHeight", {
      value: 720,
      configurable: true,
    });

    mockDrawImage.mockClear();
    await wrapper.vm.captureStageScreenshot();

    expect(mockDrawImage).toHaveBeenCalledWith(imgEl, 0, 0, 1280, 720);
    expect(mockDrawImage).toHaveBeenCalledWith(overlayCanvas, 0, 0, 1280, 720);

    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    document.createElement = originalCreateElement;
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

  it("falls back to dv_ir_00001.txt when no txt is uploaded and user confirms", async () => {
    const wrapper = mount(DashboardView);
    const imageFile = new File(["mock-image"], "scene.jpg", {
      type: "image/jpeg",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn((url) => {
      if (String(url).includes("/detections/upload")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      if (String(url).includes("/detections/image")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
    global.fetch = fetchMock;
    wrapper.vm.imageFile = imageFile;
    await wrapper.vm.$nextTick();
    fetchMock.mockClear();

    await wrapper.vm.detectImage();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain("当前文件未上传或者和模板文件重名");

    const uploadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/detections/upload"),
    );
    expect(uploadCall).toBeTruthy();
    const uploadedFile = uploadCall[1].body.get("files");
    expect(uploadedFile.name).toBe("dv_ir_00001.txt");

    const imageCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/detections/image"),
    );
    expect(imageCalls.length).toBe(1);
    confirmSpy.mockRestore();
  });

  it("falls back to dv_ir_00001.txt when uploaded txt has template filename", async () => {
    const wrapper = mount(DashboardView);
    const imageFile = new File(["mock-image"], "scene-2.jpg", {
      type: "image/jpeg",
    });
    const templateNameTxt = new File(["custom"], "模板文件.txt", {
      type: "text/plain",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn((url) => {
      if (String(url).includes("/detections/upload")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      if (String(url).includes("/detections/image")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
    global.fetch = fetchMock;
    wrapper.vm.txtFileEntry = {
      id: "txt-1",
      name: templateNameTxt.name,
      size: templateNameTxt.size,
      lastModified: templateNameTxt.lastModified,
      file: templateNameTxt,
    };
    wrapper.vm.imageFile = imageFile;
    await wrapper.vm.$nextTick();
    fetchMock.mockClear();

    await wrapper.vm.detectImage();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const uploadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/detections/upload"),
    );
    expect(uploadCall).toBeTruthy();
    const uploadedFile = uploadCall[1].body.get("files");
    expect(uploadedFile.name).toBe("dv_ir_00001.txt");
    confirmSpy.mockRestore();
  });

  it("cancels image detection when user rejects fallback confirmation", async () => {
    const wrapper = mount(DashboardView);
    const imageFile = new File(["mock-image"], "scene-3.jpg", {
      type: "image/jpeg",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );
    global.fetch = fetchMock;
    wrapper.vm.imageFile = imageFile;
    await wrapper.vm.$nextTick();
    fetchMock.mockClear();

    await wrapper.vm.detectImage();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.vm.imageDetecting).toBe(false);
    confirmSpy.mockRestore();
  });

  it("debounces map telemetry input and sends latest payload to backend", async () => {
    vi.useFakeTimers();
    const wrapper = mount(DashboardView);
    const fetchMock = vi.fn((url, options = {}) => {
      if (String(url).includes("/map/telemetry")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
    global.fetch = fetchMock;

    wrapper.vm.mapTelemetryDraft = {
      ...wrapper.vm.mapTelemetryDraft,
      lat: "39.90500",
      lng: "116.40800",
      yaw: "38",
    };
    wrapper.vm.onMapTelemetryInput();
    wrapper.vm.mapTelemetryDraft = {
      ...wrapper.vm.mapTelemetryDraft,
      yaw: "42",
    };
    wrapper.vm.onMapTelemetryInput();
    wrapper.vm.mapTelemetryDraft = {
      ...wrapper.vm.mapTelemetryDraft,
      yaw: "45",
    };
    wrapper.vm.onMapTelemetryInput();

    const telemetryCallsBeforeDebounce = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/map/telemetry"),
    );
    expect(telemetryCallsBeforeDebounce.length).toBe(0);

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();

    const telemetryCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/map/telemetry"),
    );
    expect(telemetryCalls.length).toBe(1);
    const sentBody = JSON.parse(telemetryCalls[0][1].body);
    expect(sentBody.lat).toBe(39.905);
    expect(sentBody.lng).toBe(116.408);
    expect(sentBody.yaw).toBe(45);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("sends task payload and periodic snapshot command for stream websocket", async () => {
    vi.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const wsInstances = [];

    class MockWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.OPEN;
        this.send = vi.fn();
        this.close = vi.fn(() => {
          this.readyState = 3;
          if (this.onclose) this.onclose();
        });
        wsInstances.push(this);
      }
    }

    global.WebSocket = MockWebSocket;
    localStorage.setItem(
      "dashboard_task_summary",
      JSON.stringify({ taskName: "WS任务", taskType: "视频", scene: "城区" }),
    );

    const wrapper = mount(DashboardView);
    wrapper.vm.streamRtspUrl = "rtsp://example/live";
    wrapper.vm.toggleStream();

    expect(wsInstances.length).toBe(1);
    wsInstances[0].onopen();

    const streamStartPayload = JSON.parse(wsInstances[0].send.mock.calls[0][0]);
    expect(streamStartPayload.url).toBe("rtsp://example/live");
    expect(streamStartPayload.taskName).toBe("WS任务");
    expect(streamStartPayload.taskType).toBe(2);

    vi.advanceTimersByTime(3000);
    const hasStreamSnapshot = wsInstances[0].send.mock.calls.some(([raw]) => {
      try {
        return JSON.parse(raw).command === "snapshot";
      } catch {
        return false;
      }
    });
    expect(hasStreamSnapshot).toBe(true);

    wrapper.unmount();
    global.WebSocket = originalWebSocket;
    localStorage.removeItem("dashboard_task_summary");
    vi.useRealTimers();
  });

  it("sends task payload and periodic snapshot command for video websocket", async () => {
    vi.useFakeTimers();
    const originalWebSocket = global.WebSocket;
    const wsInstances = [];

    class MockWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.OPEN;
        this.send = vi.fn();
        this.close = vi.fn(() => {
          this.readyState = 3;
          if (this.onclose) this.onclose();
        });
        wsInstances.push(this);
      }
    }

    global.WebSocket = MockWebSocket;
    localStorage.setItem(
      "dashboard_task_summary",
      JSON.stringify({ taskName: "视频任务", taskType: "实时流", scene: "港口" }),
    );

    const wrapper = mount(DashboardView);
    wrapper.vm.videoFile = new File(["x"], "clip.mp4", { type: "video/mp4" });
    wrapper.vm.videoTaskId = "task_clip.mp4";

    wrapper.vm.toggleVideoDetection();

    expect(wsInstances.length).toBe(1);
    wsInstances[0].onopen();

    const videoStartPayload = JSON.parse(wsInstances[0].send.mock.calls[0][0]);
    expect(videoStartPayload.command).toBe("START");
    expect(videoStartPayload.videoPath).toBe("task_clip.mp4");
    expect(videoStartPayload.taskName).toBe("视频任务");
    expect(videoStartPayload.taskType).toBe(1);

    vi.advanceTimersByTime(3000);
    const hasVideoSnapshot = wsInstances[0].send.mock.calls.some(([raw]) => {
      try {
        return JSON.parse(raw).command === "SNAPSHOT";
      } catch {
        return false;
      }
    });
    expect(hasVideoSnapshot).toBe(true);

    wrapper.unmount();
    global.WebSocket = originalWebSocket;
    localStorage.removeItem("dashboard_task_summary");
    vi.useRealTimers();
  });
});
