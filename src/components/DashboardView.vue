<script setup>
import { useConfigStore } from "../stores/useConfigStore";
import { useDataStore } from "../stores/useDataStore";
import { storeToRefs } from "pinia";
import { ref, computed, onUnmounted } from "vue";

const configStore = useConfigStore();
const dataStore = useDataStore();

const { confidence, iou, selectedModel, enabledLabels } =
  storeToRefs(configStore);
const {
  filteredDetections: detections,
  summary,
  activeTask: task,
  series,
  resources,
} = storeToRefs(dataStore);

// Mock state for new controls
const systemStatus = ref("running"); // running, stopped

// --- Stream Switch Module State ---
const activeMode = ref("stream"); // 'stream', 'video', 'image'
const detectCanvas = ref(null);

// Mode: Stream
const streamWsAddr = ref("ws://localhost:8080/stream-detect");
const streamRtspUrl = ref("rtsp://192.168.191.60:8080/h264.sdp");
const streamConnected = ref(false);
const streamBase64 = ref("");
const streamImg = ref(null);
let streamWs = null;

// Mode: Video
const videoFile = ref(null);
const videoUrl = ref("");
const videoBackendPath = ref("E:\\edge下载\\1489368329-1-100026.mp4");
const videoConnected = ref(false);
const localVideo = ref(null);
let videoWs = null;
let videoSyncInterval = null;
let videoBuffer = [];

// Mode: Image
const imageFile = ref(null);
const imageUrl = ref("");
const imageDetecting = ref(false);
const localImg = ref(null);

// Global detections list to render on canvas
let canvasDetections = [];

// --- Shared functions ---
const switchMode = (mode) => {
  if (activeMode.value === "stream" && streamConnected.value) toggleStream();
  if (activeMode.value === "video" && videoConnected.value) connectVideo();

  activeMode.value = mode;
  clearCanvas();
  canvasDetections = [];
};

const clearCanvas = () => {
  if (detectCanvas.value) {
    const ctx = detectCanvas.value.getContext("2d");
    ctx.clearRect(0, 0, detectCanvas.value.width, detectCanvas.value.height);
  }
};

const drawDetections = (
  detectionsToDraw,
  displayWidth,
  displayHeight,
  sourceWidth,
  sourceHeight,
) => {
  if (!detectCanvas.value) return;
  const canvas = detectCanvas.value;
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!detectionsToDraw || detectionsToDraw.length === 0) return;

  const scaleX = displayWidth / sourceWidth;
  const scaleY = displayHeight / sourceHeight;

  detectionsToDraw.forEach((det) => {
    const conf = det.confidence !== undefined ? det.confidence : det.score;
    if (conf < confidence.value) return;

    const [x1, y1, x2, y2] = det.bbox;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;
    const lx = x1 * scaleX;
    const ly = y1 * scaleY;

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.strokeRect(lx, ly, w, h);

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lx, ly + 15);
    ctx.lineTo(lx, ly);
    ctx.lineTo(lx + 15, ly);
    ctx.moveTo(lx + w - 15, ly);
    ctx.lineTo(lx + w, ly);
    ctx.lineTo(lx + w, ly + 15);
    ctx.moveTo(lx + w, ly + h - 15);
    ctx.lineTo(lx + w, ly + h);
    ctx.lineTo(lx + w - 15, ly + h);
    ctx.moveTo(lx + 15, ly + h);
    ctx.lineTo(lx, ly + h);
    ctx.lineTo(lx, ly + h - 15);
    ctx.stroke();

    const label = `${det.label} ${(conf * 100).toFixed(0)}%`;
    ctx.font = "bold 14px Arial";
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(0, 255, 136, 0.85)";
    ctx.fillRect(lx, ly - 22, textWidth + 10, 22);

    ctx.fillStyle = "#000";
    ctx.fillText(label, lx + 5, ly - 6);
  });
};

// --- Stream Functions ---
const toggleStream = () => {
  if (streamConnected.value) {
    if (streamWs) streamWs.close();
    streamConnected.value = false;
    streamBase64.value = "";
    clearCanvas();
  } else {
    streamWs = new WebSocket(streamWsAddr.value);
    streamWs.onopen = () => {
      streamConnected.value = true;
      streamWs.send(JSON.stringify({ url: streamRtspUrl.value }));
    };
    streamWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.image) {
        streamBase64.value = "data:image/jpeg;base64," + data.image;
        canvasDetections = data.detections || [];
      }
    };
    streamWs.onclose = () => {
      streamConnected.value = false;
      streamBase64.value = "";
    };
  }
};

const onStreamImageLoaded = () => {
  if (!streamImg.value) return;
  const el = streamImg.value;
  const nw = el.naturalWidth || 960;
  const nh = el.naturalHeight || 720;
  drawDetections(canvasDetections, el.clientWidth, el.clientHeight, nw, nh);
};

// --- Video Functions ---
const onVideoFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    videoFile.value = file;
    if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
    videoUrl.value = URL.createObjectURL(file);
    videoBuffer = [];
  }
};

const connectVideo = () => {
  if (videoConnected.value) {
    if (videoWs) videoWs.close();
    videoConnected.value = false;
    clearCanvas();
    if (videoSyncInterval) clearInterval(videoSyncInterval);
    return;
  }

  if (!videoFile.value) return;

  videoWs = new WebSocket("ws://localhost:8080/video-detect");
  videoWs.onopen = () => {
    videoConnected.value = true;
    videoWs.send(
      JSON.stringify({
        command: "START",
        videoPath: videoBackendPath.value,
      }),
    );

    videoSyncInterval = setInterval(() => {
      if (
        videoWs &&
        videoWs.readyState === WebSocket.OPEN &&
        localVideo.value &&
        !localVideo.value.paused
      ) {
        videoWs.send(
          JSON.stringify({
            command: "SYNC_TIME",
            currentTime: localVideo.value.currentTime,
          }),
        );
      }
    }, 200);

    renderVideoLoop();
  };

  videoWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.detections) {
      videoBuffer.push({
        ts: data.timestamp,
        data: data.detections,
      });
      if (videoBuffer.length > 150) videoBuffer.shift();
    }
  };

  videoWs.onclose = () => {
    videoConnected.value = false;
    if (videoSyncInterval) clearInterval(videoSyncInterval);
  };
};

const renderVideoLoop = () => {
  if (!videoConnected.value) return;

  const videoEl = localVideo.value;
  if (videoEl && videoEl.videoWidth && videoBuffer.length > 0) {
    const currentTime = videoEl.currentTime;
    let closestFrame = null;
    let minDiff = 999;

    for (let i = 0; i < videoBuffer.length; i++) {
      let diff = Math.abs(videoBuffer[i].ts - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = videoBuffer[i];
      }
    }

    if (closestFrame && minDiff < 0.5) {
      drawDetections(
        closestFrame.data,
        videoEl.clientWidth,
        videoEl.clientHeight,
        videoEl.videoWidth,
        videoEl.videoHeight,
      );
    }
  }

  requestAnimationFrame(renderVideoLoop);
};

const onVideoPlay = () =>
  videoWs &&
  videoWs.readyState === WebSocket.OPEN &&
  videoWs.send(JSON.stringify({ command: "RESUME" }));
const onVideoPause = () =>
  videoWs &&
  videoWs.readyState === WebSocket.OPEN &&
  videoWs.send(JSON.stringify({ command: "PAUSE" }));
const onVideoSeeking = () => {
  videoBuffer = [];
  if (videoWs && videoWs.readyState === WebSocket.OPEN && localVideo.value) {
    videoWs.send(
      JSON.stringify({
        command: "SEEK",
        seekTime: localVideo.value.currentTime,
      }),
    );
  }
};

// --- Image Functions ---
const onImageFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    imageFile.value = file;
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
    imageUrl.value = URL.createObjectURL(file);
    clearCanvas();
  }
};

const detectImage = async () => {
  if (!imageFile.value) return;
  imageDetecting.value = true;
  try {
    const formData = new FormData();
    formData.append("file", imageFile.value);

    const response = await fetch("http://localhost:8080/detection/detect", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("API Error");
    canvasDetections = await response.json();

    onLocalImageLoaded();
  } catch (error) {
    console.error("Image detection failed:", error);
  } finally {
    imageDetecting.value = false;
  }
};

const onLocalImageLoaded = () => {
  if (!localImg.value || !canvasDetections.length) return;
  const el = localImg.value;
  drawDetections(
    canvasDetections,
    el.clientWidth,
    el.clientHeight,
    el.naturalWidth,
    el.naturalHeight,
  );
};

const handleResize = () => {
  if (activeMode.value === "stream" && streamImg.value) onStreamImageLoaded();
  if (activeMode.value === "image" && localImg.value) onLocalImageLoaded();
};

window.addEventListener("resize", handleResize);

onUnmounted(() => {
  if (streamWs) streamWs.close();
  if (videoWs) videoWs.close();
  if (videoSyncInterval) clearInterval(videoSyncInterval);
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  window.removeEventListener("resize", handleResize);
});

// Time Range State (Upgraded to datetime-local)
const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

const formatDateTime = (date) => {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const startTime = ref(formatDateTime(oneHourAgo));
const endTime = ref(formatDateTime(now));
const timeError = ref(false);

const setTimeShortcut = (hours) => {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  startTime.value = formatDateTime(start);
  endTime.value = formatDateTime(end);
  validateTime();
};

const validateTime = () => {
  if (new Date(startTime.value) > new Date(endTime.value)) {
    timeError.value = true;
  } else {
    timeError.value = false;
  }
};

const levelText = {
  normal: "正常",
  warning: "预警",
  danger: "高危",
};

const categoryTree = [
  {
    key: "all",
    label: "全选",
    children: [
      { key: "person", label: "行人 (Person)", color: "#ff7b7b" },
      { key: "vehicle", label: "车辆 (Vehicle)", color: "#61d9e8" },
      { key: "facility", label: "建筑 (Building)", color: "#f6cf68" },
      { key: "animal", label: "动物 (Animal)", color: "#a56af5" },
    ],
  },
];

const categoryOptions = categoryTree[0].children;
const categoryColorMap = {
  人员: "#ff7b7b",
  车辆: "#61d9e8",
  设施: "#f6cf68",
  动物: "#a56af5",
};

function toggleLabel(key) {
  const next = enabledLabels.value.includes(key)
    ? enabledLabels.value.filter((item) => item !== key)
    : [...enabledLabels.value, key];
  enabledLabels.value = next;
}

const completionRate = computed(() =>
  Math.max(
    0,
    Math.min(
      100,
      Math.round((summary.value.map50 + summary.value.precision) / 2),
    ),
  ),
);

const hoveredCompletion = ref(null);
const hoveredCategory = ref(null);
const activeCategoryNames = ref(series.value.classes.map((item) => item.name));

const buildPieSegments = (items) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let startAngle = 0;
  const radius = 16;

  return items.map((item) => {
    const percentage = total === 0 ? 0 : item.value / total;
    const angle = percentage * 360;
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((startAngle + angle - 90) * Math.PI) / 180;
    const x1 = 16 + radius * Math.cos(startRad);
    const y1 = 16 + radius * Math.sin(startRad);
    const x2 = 16 + radius * Math.cos(endRad);
    const y2 = 16 + radius * Math.sin(endRad);
    const largeArcFlag = angle > 180 ? 1 : 0;
    const pathData =
      total === 0
        ? `M 16 0 A 16 16 0 1 1 15.99 0`
        : `M 16 16 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    startAngle += angle;
    return {
      ...item,
      path: pathData,
      percentage: Math.round(percentage * 100),
    };
  });
};

const completionSegments = computed(() =>
  buildPieSegments([
    { name: "完成", value: completionRate.value, color: "#41d98f" },
    {
      name: "未完成",
      value: 100 - completionRate.value,
      color: "rgba(255,255,255,0.18)",
    },
  ]),
);

const activeCategories = computed(() =>
  series.value.classes.filter((item) =>
    activeCategoryNames.value.includes(item.name),
  ),
);

const categorySegments = computed(() =>
  buildPieSegments(
    activeCategories.value.map((item) => ({
      ...item,
      color: categoryColorMap[item.name] || "#9cb6db",
    })),
  ),
);

const categoryDetailList = computed(() =>
  series.value.classes.map((item) => ({
    name: item.name,
    value: item.value,
    precision: item.precision,
    recall: item.recall,
    f1: item.f1,
    color: categoryColorMap[item.name] || "#9cb6db",
  })),
);

const toggleCategoryLegend = (name) => {
  if (activeCategoryNames.value.includes(name)) {
    if (activeCategoryNames.value.length === 1) return;
    activeCategoryNames.value = activeCategoryNames.value.filter(
      (item) => item !== name,
    );
  } else {
    activeCategoryNames.value = [...activeCategoryNames.value, name];
  }
};

const setCategoryHover = (name) => {
  const total = activeCategories.value.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const rawItem =
    activeCategories.value.find((item) => item.name === name) ||
    series.value.classes.find((item) => item.name === name);
  if (!rawItem) return;
  const percentage =
    total === 0 ? 0 : Math.round((rawItem.value / total) * 100);
  hoveredCategory.value = {
    name: rawItem.name,
    value: rawItem.value,
    percentage,
    color: categoryColorMap[rawItem.name] || "#9cb6db",
  };
};
</script>

<template>
  <div class="dashboard-screen">
    <div class="hero-layout">
      <!-- Left Column: Video Monitoring Area (65%) -->
      <div
        class="video-section"
        style="display: flex; flex-direction: column; height: 100%"
      >
        <div
          class="panel video-card"
          style="
            flex: 1 1 0;
            display: flex;
            flex-direction: column;
            min-height: 0;
          "
        >
          <div class="section-title">
            <h3>实时检测画面</h3>
          </div>

          <div
            class="video-stage board-style"
            style="
              flex: 1 1 0;
              min-height: 400px;
              position: relative;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <div class="grid-overlay" style="z-index: 1"></div>
            <div class="scanline" style="z-index: 2"></div>
            <div class="corner corner-tl" style="z-index: 3"></div>
            <div class="corner corner-tr" style="z-index: 3"></div>
            <div class="corner corner-bl" style="z-index: 3"></div>
            <div class="corner corner-br" style="z-index: 3"></div>

            <!-- Real display elements -->
            <img
              v-show="activeMode === 'stream' && streamBase64"
              :src="streamBase64"
              ref="streamImg"
              @load="onStreamImageLoaded"
              style="
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                z-index: 10;
                position: absolute;
              "
            />

            <video
              v-show="activeMode === 'video' && videoUrl"
              :src="videoUrl"
              ref="localVideo"
              controls
              style="
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                z-index: 10;
                position: absolute;
              "
              @play="onVideoPlay"
              @pause="onVideoPause"
              @seeking="onVideoSeeking"
            ></video>

            <img
              v-show="activeMode === 'image' && imageUrl"
              :src="imageUrl"
              ref="localImg"
              @load="onLocalImageLoaded"
              style="
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                z-index: 10;
                position: absolute;
              "
            />

            <canvas
              ref="detectCanvas"
              style="
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 20;
              "
            ></canvas>

            <div
              v-if="!streamBase64 && !videoUrl && !imageUrl"
              v-for="item in detections"
              :key="item.id"
              :class="['bbox', item.level]"
              :style="{
                left: `${item.bbox[0]}%`,
                top: `${item.bbox[1]}%`,
                width: `${item.bbox[2]}%`,
                height: `${item.bbox[3]}%`,
                zIndex: 4,
              }"
            >
              <span>{{ item.label }} {{ Math.round(item.score * 100) }}%</span>
            </div>

            <div class="video-info-tag" style="z-index: 30">
              {{
                activeMode === "stream"
                  ? "实时流"
                  : activeMode === "video"
                    ? "本地视频"
                    : "本地图片"
              }}
              | 1920x1080 | {{ summary.latency }}ms
            </div>
          </div>

          <!-- Integrated Lower Grid (Alerts/Stats) inside Video Section -->
          <div class="video-lower-grid">
            <div
              class="subpanel"
              style="height: 100%; display: flex; flex-direction: column"
            >
              <div class="subpanel-title">实时告警</div>
              <div class="alert-list">
                <div
                  v-for="item in detections.slice(0, 3)"
                  :key="`${item.id}-alert`"
                  class="alert-item"
                >
                  <span :class="['alert-mark', item.level]"></span>
                  <div>
                    <strong>{{ item.label }}</strong>
                    <p>
                      {{ item.timestamp }} / {{ Math.round(item.score * 100) }}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              class="subpanel"
              style="height: 100%; display: flex; flex-direction: column"
            >
              <div class="subpanel-title">任务摘要</div>
              <div class="summary-pairs">
                <div class="summary-pair">
                  <span>当前任务</span>
                  <strong>{{ task.name }}</strong>
                </div>
                <div class="summary-pair">
                  <span>场景</span>
                  <strong>{{ task.scene }}</strong>
                </div>
                <div class="summary-pair">
                  <span>输入源</span>
                  <strong>{{ task.source }}</strong>
                </div>
                <div class="summary-pair">
                  <span>在线目标</span>
                  <strong>{{ detections.length }}</strong>
                </div>
              </div>
            </div>

            <!-- Module 7: System Resource Monitor (Moved Here) -->
            <div class="subpanel resource-module-mini">
              <div class="subpanel-title">
                系统资源
                <span class="temp-badge-mini">{{ resources.temp }}°C</span>
              </div>
              <div class="resource-grid-mini">
                <div class="res-row-mini">
                  <span>CPU</span>
                  <div class="res-track-mini">
                    <div
                      class="res-fill cpu"
                      :style="{ width: `${resources.cpu}%` }"
                    ></div>
                  </div>
                  <strong>{{ resources.cpu }}%</strong>
                </div>
                <div class="res-row-mini">
                  <span>GPU</span>
                  <div class="res-track-mini">
                    <div
                      class="res-fill gpu"
                      :style="{ width: `${resources.gpu}%` }"
                    ></div>
                  </div>
                  <strong>{{ resources.gpu }}%</strong>
                </div>
                <div class="res-row-mini">
                  <span>MEM</span>
                  <div class="res-track-mini">
                    <div
                      class="res-fill mem"
                      :style="{ width: `${resources.memory}%` }"
                    ></div>
                  </div>
                  <strong>{{ resources.memory }}%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Functional Control Area (35%) -->
      <div
        class="control-section"
        style="display: flex; flex-direction: column; height: 100%"
      >
        <div
          class="control-grid"
          style="
            flex: 1 1 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 0;
          "
        >
          <!-- Module 1: System Control & Status -->
          <div class="dashboard-card control-module" style="flex: 0 0 auto">
            <div class="module-header">
              <h4>系统控制</h4>
              <div class="status-indicator">
                <span :class="['led', systemStatus]"></span>
                {{ systemStatus === "running" ? "运行中" : "已停止" }}
              </div>
            </div>
            <div class="control-actions">
              <button
                :class="[
                  'action-btn',
                  systemStatus === 'running' ? 'danger' : 'success',
                ]"
                @click="
                  systemStatus =
                    systemStatus === 'running' ? 'stopped' : 'running'
                "
              >
                {{ systemStatus === "running" ? "停止检测" : "开始检测" }}
              </button>
              <button class="action-btn">重启服务</button>
            </div>
            <div class="slider-group">
              <label class="slider-field compact">
                <div class="slider-head">
                  <span>置信度</span>
                  <strong>{{ confidence.toFixed(2) }}</strong>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="0.95"
                  step="0.01"
                  v-model.number="confidence"
                />
              </label>
              <label class="slider-field compact">
                <div class="slider-head">
                  <span>IoU 阈值</span>
                  <strong>{{ iou.toFixed(2) }}</strong>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.01"
                  v-model.number="iou"
                />
              </label>
            </div>
          </div>

          <!-- Module 2: Category Filter (Tree) -->
          <div class="dashboard-card filter-module" style="flex: 0 0 auto">
            <div class="module-header">
              <h4>目标类别筛选</h4>
            </div>
            <div class="tree-filter">
              <div class="tree-node root">
                <div class="node-content">
                  <span class="folder-icon">📂</span>
                  <span>全选类别</span>
                </div>
                <div class="tree-children">
                  <label
                    v-for="opt in categoryOptions"
                    :key="opt.key"
                    class="tree-item"
                  >
                    <input
                      type="checkbox"
                      :checked="enabledLabels.includes(opt.key)"
                      @change="toggleLabel(opt.key)"
                    />
                    <span
                      class="color-dot"
                      :style="{ background: opt.color }"
                    ></span>
                    {{ opt.label }}
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Module 3: Stream Switch Module -->
          <div
            class="dashboard-card stream-switch-module"
            style="flex: 0 0 auto"
          >
            <div class="module-header">
              <h4>视频流切换</h4>
              <div class="mode-tabs">
                <button
                  :class="['tab-btn', { active: activeMode === 'stream' }]"
                  @click="switchMode('stream')"
                >
                  实时流
                </button>
                <button
                  :class="['tab-btn', { active: activeMode === 'video' }]"
                  @click="switchMode('video')"
                >
                  本地视频
                </button>
                <button
                  :class="['tab-btn', { active: activeMode === 'image' }]"
                  @click="switchMode('image')"
                >
                  本地图片
                </button>
              </div>
            </div>
            <div class="stream-controls">
              <!-- Stream Mode -->
              <div v-if="activeMode === 'stream'" class="control-panel">
                <input
                  v-model="streamWsAddr"
                  class="control-input"
                  placeholder="WebSocket 地址 (如: ws://localhost:8080/...)"
                />
                <input
                  v-model="streamRtspUrl"
                  class="control-input"
                  placeholder="RTSP 源"
                />
                <button
                  @click="toggleStream"
                  :class="[
                    'control-btn',
                    streamConnected ? 'danger' : 'primary',
                  ]"
                >
                  {{ streamConnected ? "停止实时流" : "连接实时流" }}
                </button>
              </div>

              <!-- Video Mode -->
              <div v-if="activeMode === 'video'" class="control-panel">
                <input
                  type="file"
                  accept="video/*"
                  @change="onVideoFileChange"
                  class="control-file"
                />
                <input
                  v-model="videoBackendPath"
                  class="control-input"
                  placeholder="后端处理路径 (绝对路径)"
                />
                <button
                  @click="connectVideo"
                  :class="[
                    'control-btn',
                    videoConnected ? 'danger' : 'primary',
                  ]"
                  :disabled="!videoFile"
                >
                  {{ videoConnected ? "断开视频检测" : "开始视频检测" }}
                </button>
              </div>

              <!-- Image Mode -->
              <div v-if="activeMode === 'image'" class="control-panel">
                <input
                  type="file"
                  accept="image/*"
                  @change="onImageFileChange"
                  class="control-file"
                />
                <button
                  @click="detectImage"
                  class="control-btn primary"
                  :disabled="!imageFile || imageDetecting"
                >
                  {{ imageDetecting ? "处理中..." : "开始图片检测" }}
                </button>
              </div>
            </div>
          </div>

          <!-- Module 4: Time Range -->
          <div class="dashboard-card time-module" style="flex: 0 0 auto">
            <div class="module-header">
              <h4>时间范围</h4>
              <div class="shortcut-row">
                <button class="shortcut-btn" @click="setTimeShortcut(1)">
                  1h
                </button>
                <button class="shortcut-btn" @click="setTimeShortcut(24)">
                  24h
                </button>
                <button class="shortcut-btn" @click="setTimeShortcut(168)">
                  7d
                </button>
              </div>
            </div>
            <div class="time-inputs" :class="{ error: timeError }">
              <div class="time-field">
                <span>开始</span>
                <input
                  type="datetime-local"
                  step="1"
                  v-model="startTime"
                  @change="validateTime"
                />
              </div>
              <div class="time-field">
                <span>结束</span>
                <input
                  type="datetime-local"
                  step="1"
                  v-model="endTime"
                  @change="validateTime"
                />
              </div>
            </div>
            <div v-if="timeError" class="time-error-msg">
              开始时间不能晚于结束时间
            </div>
          </div>

          <!-- Module 5: Quick Actions -->
          <div
            class="dashboard-card quick-module"
            style="
              flex: 1 1 0;
              min-height: 0;
              display: flex;
              flex-direction: column;
            "
          >
            <div class="module-header">
              <h4>快速操作</h4>
            </div>
            <div class="tool-grid">
              <button class="tool-btn" title="导出报告">📄 导出</button>
              <button class="tool-btn" title="截图">📷 截图</button>
              <button class="tool-btn" title="录屏">🎥 录屏</button>
              <button class="tool-btn" title="设置">⚙️ 设置</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Auxiliary Section -->
      <div class="auxiliary-section">
        <div class="dashboard-card stats-module-large" style="flex: 0 0 auto">
          <div class="module-header">
            <h4>目标统计分布</h4>
          </div>
          <div class="stats-top">
            <div class="stats-chart-card">
              <div class="stats-chart-title">
                <span>完成比例</span>
                <strong>{{ completionRate }}%</strong>
              </div>
              <div
                class="pie-chart-wrapper"
                @mouseleave="hoveredCompletion = null"
              >
                <svg viewBox="0 0 32 32" class="pie-svg">
                  <path
                    v-for="segment in completionSegments"
                    :key="segment.name"
                    :d="segment.path"
                    :fill="segment.color"
                    stroke="var(--bg-panel)"
                    stroke-width="0.6"
                    @mouseenter="hoveredCompletion = segment"
                  />
                  <circle cx="16" cy="16" r="10" fill="var(--bg-panel)" />
                </svg>
                <div class="pie-center-text">
                  <strong>{{ completionRate }}%</strong>
                  <small>完成度</small>
                </div>
                <div v-if="hoveredCompletion" class="pie-tooltip">
                  <strong>{{ hoveredCompletion.name }}</strong>
                  <span>{{ hoveredCompletion.percentage }}%</span>
                </div>
              </div>
            </div>

            <div class="stats-chart-card">
              <div class="stats-chart-title">
                <span>分类占比</span>
                <strong>{{ detections.length }}个</strong>
              </div>
              <div
                class="pie-chart-wrapper"
                @mouseleave="hoveredCategory = null"
              >
                <svg viewBox="0 0 32 32" class="pie-svg">
                  <path
                    v-for="segment in categorySegments"
                    :key="segment.name"
                    :d="segment.path"
                    :fill="segment.color"
                    stroke="var(--bg-panel)"
                    stroke-width="0.6"
                    @mouseenter="hoveredCategory = segment"
                  />
                  <circle cx="16" cy="16" r="10" fill="var(--bg-panel)" />
                </svg>
                <div class="pie-center-text">
                  <strong>{{ detections.length }}</strong>
                  <small>目标数</small>
                </div>
                <div v-if="hoveredCategory" class="pie-tooltip">
                  <strong>{{ hoveredCategory.name }}</strong>
                  <span
                    >{{ hoveredCategory.value }} /
                    {{ hoveredCategory.percentage }}%</span
                  >
                </div>
              </div>
              <div class="stats-legend">
                <button
                  v-for="item in categoryDetailList"
                  :key="item.name"
                  class="legend-row"
                  :class="{ muted: !activeCategoryNames.includes(item.name) }"
                  @click="toggleCategoryLegend(item.name)"
                  @mouseenter="setCategoryHover(item.name)"
                  @mouseleave="hoveredCategory = null"
                >
                  <span
                    class="legend-dot"
                    :style="{ background: item.color }"
                  ></span>
                  <span class="legend-name">{{ item.name }}</span>
                  <span class="legend-val">{{ item.value }}</span>
                  <span class="legend-pct">切换</span>
                </button>
              </div>
            </div>
          </div>

          <div class="stats-detail-list">
            <div
              v-for="item in categoryDetailList"
              :key="item.name"
              class="stats-detail-row"
            >
              <div class="stats-detail-head">
                <span
                  class="legend-dot"
                  :style="{ background: item.color }"
                ></span>
                <strong>{{ item.name }}</strong>
              </div>
              <div class="stats-detail-meta">
                <span>目标 {{ item.value }}</span>
                <span>P {{ item.precision }}%</span>
                <span>R {{ item.recall }}%</span>
                <span>F1 {{ item.f1 }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Log Module Moved to Auxiliary Section -->
        <div
          class="dashboard-card log-module-mini"
          style="flex: 1 1 0; min-height: 0"
        >
          <div class="module-header">
            <h4>系统日志</h4>
            <button class="icon-btn" title="清空">🗑️</button>
          </div>
          <div class="log-list">
            <div class="log-item">
              <span class="log-time">14:32:05</span>
              <span class="log-content info">系统自检完成</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:31:08</span>
              <span class="log-content warning">检测到异常车辆</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:30:45</span>
              <span class="log-content success">无人机连接建立成功</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:30:10</span>
              <span class="log-content info">加载模型: YOLOv8</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel result-card dashboard-wide-section">
      <div class="section-title">
        <h3>检测结果</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间戳</th>
              <th>目标 ID</th>
              <th>类别</th>
              <th>置信度</th>
              <th>坐标位置</th>
              <th>风险等级</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in detections" :key="item.id">
              <td>{{ item.timestamp }}</td>
              <td>{{ item.id }}</td>
              <td>{{ item.label }}</td>
              <td>{{ Math.round(item.score * 100) }}%</td>
              <td>{{ item.bbox.join(", ") }}</td>
              <td>
                <span :class="['pill', item.level]">{{
                  levelText[item.level]
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
