<script setup>
import { useConfigStore } from "../stores/useConfigStore";
import { useDataStore } from "../stores/useDataStore";
import { storeToRefs } from "pinia";
import {
  ref,
  computed,
  watch,
  onUnmounted,
  onMounted,
  onActivated,
  onDeactivated,
} from "vue";
import axios from "axios";

const configStore = useConfigStore();
const dataStore = useDataStore();

const { confidence, iou, selectedModel, enabledLabels, backendIp, httpBase, wsBase } =
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

// Frontend runtime logs for dashboard log module
const frontendLogs = ref([]);
const DASHBOARD_LOG_LIMIT = 120;

const getLogTime = () =>
  new Date().toLocaleTimeString("zh-CN", { hour12: false });

const pushFrontendLog = (message, level = "info") => {
  frontendLogs.value = [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      time: getLogTime(),
      level,
      message,
    },
    ...frontendLogs.value,
  ].slice(0, DASHBOARD_LOG_LIMIT);
};

const clearFrontendLogs = () => {
  frontendLogs.value = [];
};

const modeLabelMap = {
  stream: "实时流",
  video: "本地视频",
  image: "本地图片",
};

// 实时检测结果（从后端获取）
const realtimeDetections = ref([]);
let detectionTimer = null;
let detectionFailCount = 0;
const MAX_FAIL = 3; // 连续失败3次后停止轮询

const fetchDetections = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${httpBase.value}/detections/latest`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = await res.json();
    detectionFailCount = 0; // 请求成功，重置计数
    if (!Array.isArray(data) || data.length === 0) return;
    // 过滤已有数据，只添加新的
    const newItems = data.filter((d) => {
      const id = d.id || d.detectionId;
      return !realtimeDetections.value.some((e) => (e.id || e.detectionId) === id);
    });
    if (newItems.length > 0) {
      realtimeDetections.value = [...newItems, ...realtimeDetections.value].slice(0, 50);
    }
  } catch {
    detectionFailCount++;
    if (detectionFailCount >= MAX_FAIL) {
      stopDetectionPolling();
    }
  }
};

const startDetectionPolling = () => {
  if (detectionTimer) return;
  detectionFailCount = 0;
  fetchDetections();
  detectionTimer = setInterval(fetchDetections, 3000);
};

const stopDetectionPolling = () => {
  if (detectionTimer) {
    clearInterval(detectionTimer);
    detectionTimer = null;
  }
};

// Add network and error states
const isOffline = ref(!navigator.onLine);
const mediaError = ref("");

const handleOnline = () => {
  isOffline.value = false;
  pushFrontendLog("网络已恢复", "success");
  mediaError.value = "";
};
const handleOffline = () => {
  isOffline.value = true;
  pushFrontendLog("网络已断开", "warning");
};

window.addEventListener("online", handleOnline);
window.addEventListener("offline", handleOffline);

// --- Stream Switch Module State ---
const activeMode = ref("stream"); // 'stream', 'video', 'image'
const detectCanvas = ref(null);

// Mode: Stream
const streamWsAddr = ref(`ws://${backendIp.value}/stream-detect`);
const streamRtspUrl = ref("");
const streamConnected = ref(false);
const streamBase64 = ref("");
const streamImg = ref(null);
let streamWs = null;

// Mode: Video
const videoFile = ref(null);
const videoUrl = ref("");
const videoConnected = ref(false);
const localVideo = ref(null);
let videoWs = null;
let videoSyncInterval = null;
let videoBuffer = [];
let videoAnimationId = null;

// Mode: Video Upload State
const uploadState = ref("idle"); // 'idle', 'uploading', 'paused', 'success', 'error'
const uploadProgress = ref(0);
const uploadSpeed = ref("0 KB/s");
const uploadEta = ref("--s");
const videoTaskId = ref("");
let uploadCancelController = null;

// Mode: Image
const imageFile = ref(null);
const imageUrl = ref("");
const imageDetecting = ref(false);
const localImg = ref(null);
const imageSourceWidth = ref(null);
const imageSourceHeight = ref(null);

// 固定标注文件内容，前端自动生成同名 txt 上传
const LABEL_CONTENT = `3 0.120833 0.575843 0.039286 0.098315
3 0.160119 0.572331 0.039286 0.099719
3 0.207738 0.577949 0.039286 0.099719
3 0.250595 0.586376 0.039286 0.082865
3 0.194048 0.353230 0.035714 0.082865
3 0.238095 0.353230 0.030952 0.085674
3 0.314286 0.350421 0.038095 0.094101
3 0.366667 0.346910 0.047619 0.101124
3 0.437500 0.439607 0.084524 0.050562
3 0.522024 0.439607 0.079762 0.047753
3 0.571429 0.356742 0.035714 0.098315
3 0.624405 0.382022 0.039286 0.095506
3 0.791071 0.455056 0.072619 0.039326
3 0.765476 0.517556 0.080952 0.043539
3 0.702381 0.605337 0.038095 0.106742
3 0.650000 0.589185 0.035714 0.096910
3 0.605357 0.584972 0.036905 0.102528
3 0.534524 0.592697 0.035714 0.101124
3 0.487500 0.590590 0.039286 0.094101
3 0.450000 0.584972 0.035714 0.096910
3 0.402976 0.588483 0.032143 0.089888
3 0.363690 0.585674 0.039286 0.092697
3 0.323214 0.576545 0.044048 0.099719`;

// Global detections list to render on canvas
let canvasDetections = [];

const normalizeImageDetections = (payload) => {
  if (Array.isArray(payload)) {
    return {
      detections: payload,
      sourceWidth: null,
      sourceHeight: null,
    };
  }

  return {
    detections: Array.isArray(payload?.result) ? payload.result : [],
    sourceWidth:
      typeof payload?.width === "number" && payload.width > 0
        ? payload.width
        : null,
    sourceHeight:
      typeof payload?.height === "number" && payload.height > 0
        ? payload.height
        : null,
  };
};

const hasMediaSource = computed(() => {
  if (activeMode.value === "stream") return !!streamBase64.value;
  if (activeMode.value === "video") return !!videoUrl.value;
  if (activeMode.value === "image") return !!imageUrl.value;
  return false;
});

const highlightControlPanel = () => {
  const panel = document.querySelector(".stream-switch-module");
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    panel.style.transition = "box-shadow 0.3s ease";
    panel.style.boxShadow =
      "0 0 0 2px var(--primary), 0 0 20px rgba(79, 149, 255, 0.4)";
    setTimeout(() => {
      panel.style.boxShadow = "";
    }, 1500);
  }
};

// --- Shared functions ---
const switchMode = (mode) => {
  if (activeMode.value === "stream" && streamConnected.value) toggleStream();
  if (activeMode.value === "video" && videoConnected.value)
    toggleVideoDetection();
  if (activeMode.value === "video" && uploadState.value === "uploading")
    pauseVideoUpload();

  activeMode.value = mode;
  mediaError.value = "";
  clearCanvas();
  canvasDetections = [];
  imageSourceWidth.value = null;
  imageSourceHeight.value = null;
  pushFrontendLog(`已切换到${modeLabelMap[mode] || mode}模式`, "info");
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

  const imageAspect = sourceWidth / sourceHeight;
  const containerAspect = displayWidth / displayHeight;

  let renderWidth, renderHeight, offsetX, offsetY;

  if (imageAspect > containerAspect) {
    // Image is wider than container, fits width
    renderWidth = displayWidth;
    renderHeight = displayWidth / imageAspect;
    offsetX = 0;
    offsetY = (displayHeight - renderHeight) / 2;
  } else {
    // Image is taller than container, fits height
    renderHeight = displayHeight;
    renderWidth = displayHeight * imageAspect;
    offsetX = (displayWidth - renderWidth) / 2;
    offsetY = 0;
  }

  const scaleX = renderWidth / sourceWidth;
  const scaleY = renderHeight / sourceHeight;

  detectionsToDraw.forEach((det) => {
    const conf = det.confidence !== undefined ? det.confidence : det.score;
    if (conf < confidence.value) return;

    const [x1, y1, x2, y2] = det.bbox;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;
    const lx = x1 * scaleX + offsetX;
    const ly = y1 * scaleY + offsetY;

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
  mediaError.value = "";
  if (streamConnected.value) {
    if (streamWs) streamWs.close();
    streamConnected.value = false;
    streamBase64.value = "";
    clearCanvas();
    pushFrontendLog("已停止实时流检测", "info");
  } else {
    if (isOffline.value) {
      mediaError.value = "当前网络不可用，请检查网络连接";
      pushFrontendLog("实时流连接失败：网络不可用", "warning");
      return;
    }
    try {
      streamWs = new WebSocket(streamWsAddr.value);
      streamWs.onopen = () => {
        streamConnected.value = true;
        mediaError.value = "";
        streamWs.send(JSON.stringify({ url: streamRtspUrl.value }));
        pushFrontendLog("实时流连接成功", "success");
      };
      streamWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.image) {
          streamBase64.value = "data:image/jpeg;base64," + data.image;
          canvasDetections = data.detections || [];
        }
      };
      streamWs.onerror = () => {
        mediaError.value = "WebSocket 连接失败，请检查服务地址或网络状态";
        pushFrontendLog("实时流连接异常", "error");
      };
      streamWs.onclose = () => {
        streamConnected.value = false;
        streamBase64.value = "";
        pushFrontendLog("实时流连接已关闭", "info");
      };
    } catch (e) {
      mediaError.value = "WebSocket 实例化失败，请检查地址格式";
      pushFrontendLog("实时流初始化失败", "error");
    }
  }
};

const onStreamImageLoaded = () => {
  if (!streamImg.value) return;
  const el = streamImg.value;
  const container = el.parentElement;
  if (!container) return;

  const nw = el.naturalWidth || 960;
  const nh = el.naturalHeight || 720;
  drawDetections(
    canvasDetections,
    container.clientWidth,
    container.clientHeight,
    nw,
    nh,
  );
};

// --- Video Functions ---
const resetUploadState = () => {
  uploadState.value = "idle";
  uploadProgress.value = 0;
  uploadSpeed.value = "0 KB/s";
  uploadEta.value = "--s";
  videoTaskId.value = "";
  if (uploadCancelController) {
    uploadCancelController.abort();
    uploadCancelController = null;
  }
};

const onVideoFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    videoFile.value = file;
    if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
    videoUrl.value = URL.createObjectURL(file);
    videoBuffer = [];
    resetUploadState();
    pushFrontendLog(`已选择视频文件：${file.name}`, "info");
  }
};

const toggleVideoUpload = () => {
  if (uploadState.value === "uploading") {
    pauseVideoUpload();
  } else {
    startVideoUpload();
  }
};

const pauseVideoUpload = () => {
  uploadState.value = "paused";
  if (uploadCancelController) {
    uploadCancelController.abort();
    uploadCancelController = null;
  }
  pushFrontendLog("视频上传已暂停", "warning");
};

const cancelVideoUpload = () => {
  resetUploadState();
  pushFrontendLog("视频上传已取消", "info");
};

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

const formatTime = (seconds) => {
  if (seconds === Infinity || isNaN(seconds)) return "--s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const getUploadButtonText = () => {
  if (uploadState.value === "idle") return "开始上传";
  if (uploadState.value === "paused") return "继续上传"; // Though it restarts from beginning now
  if (uploadState.value === "error") return "重试上传";
  if (uploadState.value === "uploading") return "暂停上传";
  return "开始上传";
};

const getUploadStatusText = () => {
  if (uploadState.value === "uploading") return "上传中...";
  if (uploadState.value === "paused") return "已暂停";
  if (uploadState.value === "success") return "上传成功";
  if (uploadState.value === "error") return "上传失败";
  return "准备就绪";
};

const startVideoUpload = async () => {
  if (!videoFile.value) return;

  if (isOffline.value) {
    mediaError.value = "当前网络不可用，无法进行视频上传";
    uploadState.value = "error";
    pushFrontendLog("视频上传失败：网络不可用", "warning");
    return;
  }

  uploadState.value = "uploading";
  uploadProgress.value = 0; // Always start from 0 for single upload
  uploadCancelController = new AbortController();
  pushFrontendLog(`开始上传视频：${videoFile.value.name}`, "info");

  const file = videoFile.value;
  let startTime = Date.now();
  let lastLoaded = 0;

  try {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const response = await axios.post(
      `${httpBase.value}/detections/video`,
      formData,
      {
        signal: uploadCancelController.signal,
        timeout: 0, // Disable timeout for large files
        onUploadProgress: (progressEvent) => {
          if (uploadState.value !== "uploading") return;

          const loaded = progressEvent.loaded;
          const total = progressEvent.total || file.size;

          const now = Date.now();
          const elapsedSec = (now - startTime) / 1000;

          if (elapsedSec > 0.5) {
            const bytesSinceLast = loaded - lastLoaded;
            const speed = bytesSinceLast / elapsedSec;
            uploadSpeed.value = `${formatBytes(speed)}/s`;
            const remainingBytes = total - loaded;
            uploadEta.value = formatTime(remainingBytes / speed);

            startTime = now;
            lastLoaded = loaded;
          }

          uploadProgress.value = Math.min((loaded / total) * 100, 100);
        },
      },
    );

    if (uploadState.value === "uploading") {
      uploadState.value = "success";
      uploadProgress.value = 100;
      uploadSpeed.value = "0 KB/s";
      uploadEta.value = "0s";
      // Ensure we pick up backend task ID if provided, fallback to filename
      videoTaskId.value =
        response.data?.videoPath ||
        response.data?.data?.videoPath ||
        response.data?.data?.taskId ||
        response.data?.data?.path ||
        file.name;
      pushFrontendLog("视频上传成功，已准备检测", "success");

      toggleVideoDetection();
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("Upload paused or cancelled");
      pushFrontendLog("视频上传中断", "warning");
    } else {
      uploadState.value = "error";
      mediaError.value =
        "上传失败，请重试：" +
        (error.response?.data?.message || error.message || "未知错误");
      pushFrontendLog(
        `视频上传失败：${error.response?.data?.message || error.message || "未知错误"}`,
        "error",
      );
    }
  }
};

const toggleVideoDetection = () => {
  mediaError.value = "";
  if (videoConnected.value) {
    if (videoWs) videoWs.close();
    videoConnected.value = false;
    clearCanvas();
    if (videoSyncInterval) clearInterval(videoSyncInterval);
    if (videoAnimationId) cancelAnimationFrame(videoAnimationId);
    pushFrontendLog("已停止视频检测", "info");
    return;
  }

  if (!videoFile.value) {
    pushFrontendLog("无法开始视频检测：未选择视频文件", "warning");
    return;
  }

  if (isOffline.value) {
    mediaError.value = "当前网络不可用，无法进行视频检测分析";
    pushFrontendLog("视频检测启动失败：网络不可用", "warning");
    return;
  }

  try {
    videoWs = new WebSocket(`${wsBase.value}/video-detect`);
    videoWs.onopen = () => {
      videoConnected.value = true;
      mediaError.value = "";
      videoWs.send(
        JSON.stringify({
          command: "START",
          videoPath: videoTaskId.value || videoFile.value.name,
        }),
      );
      pushFrontendLog("视频检测通道连接成功", "success");
      // console.log(videoTaskId.value || videoFile.value.name);
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

      if (videoAnimationId) cancelAnimationFrame(videoAnimationId);
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

    videoWs.onerror = () => {
      mediaError.value = "视频检测服务连接失败，请检查后端状态";
      pushFrontendLog("视频检测通道异常", "error");
    };

    videoWs.onclose = () => {
      videoConnected.value = false;
      if (videoSyncInterval) clearInterval(videoSyncInterval);
      if (videoAnimationId) cancelAnimationFrame(videoAnimationId);
      pushFrontendLog("视频检测通道已关闭", "info");
    };
  } catch (e) {
    mediaError.value = "视频检测服务异常";
    pushFrontendLog("视频检测服务异常", "error");
  }
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
      const container = videoEl.parentElement;
      if (container) {
        drawDetections(
          closestFrame.data,
          container.clientWidth,
          container.clientHeight,
          videoEl.videoWidth,
          videoEl.videoHeight,
        );
      }
    }
  }

  videoAnimationId = requestAnimationFrame(renderVideoLoop);
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
    canvasDetections = [];
    imageSourceWidth.value = null;
    imageSourceHeight.value = null;
    pushFrontendLog(`已选择图片文件：${file.name}`, "info");
  }
};

const detectImage = async () => {
  if (!imageFile.value) return;
  mediaError.value = "";
  if (isOffline.value) {
    mediaError.value = "当前网络不可用，无法连接云端识别服务";
    pushFrontendLog("图片检测失败：网络不可用", "warning");
    return;
  }
  imageDetecting.value = true;
  pushFrontendLog(`开始图片检测：${imageFile.value.name}`, "info");
  try {
    // 1. 先自动上传同名标注 txt 文件
    const imgBaseName = imageFile.value.name.replace(/\.[^.]+$/, "");
    const labelBlob = new Blob([LABEL_CONTENT], { type: "text/plain" });
    const labelFileName = `${imgBaseName}.txt`;

    const labelForm = new FormData();
    labelForm.append("files", labelBlob, labelFileName);

    const labelRes = await fetch(`${httpBase.value}/detections/upload`, {
      method: "POST",
      body: labelForm,
    });

    if (!labelRes.ok) {
      throw new Error("标注文件上传失败");
    }

    // 2. 再上传图片进行检测
    const formData = new FormData();
    formData.append("file", imageFile.value);

    const response = await fetch(`${httpBase.value}/detections/image`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        throw new Error("权限不足，无法访问检测接口");
      }
      throw new Error("检测接口响应异常");
    }
    const payload = await response.json();
    const normalized = normalizeImageDetections(payload);
    canvasDetections = normalized.detections;
    imageSourceWidth.value = normalized.sourceWidth;
    imageSourceHeight.value = normalized.sourceHeight;
    pushFrontendLog(
      `图片检测完成，识别到 ${canvasDetections.length} 个目标`,
      "success",
    );

    onLocalImageLoaded();
  } catch (error) {
    console.error("Image detection failed:", error);
    mediaError.value =
      error.message === "Failed to fetch"
        ? "网络请求失败，请检查服务状态"
        : error.message;
    pushFrontendLog(`图片检测失败：${error.message || "未知错误"}`, "error");
  } finally {
    imageDetecting.value = false;
  }
};

const onLocalImageLoaded = () => {
  if (!localImg.value) return;
  const el = localImg.value;
  const container = el.parentElement;
  if (!container) return;

  const sourceWidth = imageSourceWidth.value || el.naturalWidth;
  const sourceHeight = imageSourceHeight.value || el.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;

  drawDetections(
    canvasDetections,
    container.clientWidth,
    container.clientHeight,
    sourceWidth,
    sourceHeight,
  );
};

const redrawCanvasForCurrentMode = () => {
  if (activeMode.value === "stream" && streamImg.value) {
    onStreamImageLoaded();
    return;
  }
  if (activeMode.value === "image" && localImg.value) {
    onLocalImageLoaded();
  }
};

const handleResize = () => {
  redrawCanvasForCurrentMode();
};

watch(confidence, () => {
  redrawCanvasForCurrentMode();
});

// --- Fullscreen ---
const videoStageRef = ref(null);
const isFullscreen = ref(false);

const toggleFullscreen = () => {
  if (!videoStageRef.value) return;
  if (!document.fullscreenElement) {
    videoStageRef.value.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
};

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
  setTimeout(() => handleResize(), 50);
};

const handleRuntimeError = (event) => {
  const message = event?.message || "前端运行异常";
  pushFrontendLog(message, "error");
};

const handleUnhandledRejection = (event) => {
  const reason = event?.reason;
  const message =
    typeof reason === "string"
      ? reason
      : reason?.message || "未处理的 Promise 异常";
  pushFrontendLog(message, "error");
};

onMounted(() => {
  pushFrontendLog("大屏页面已加载", "success");
  window.addEventListener("error", handleRuntimeError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
});

onActivated(() => {
  window.addEventListener("resize", handleResize);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  setTimeout(() => handleResize(), 0);
  startApiCheck();
  startDetectionPolling();
});

onDeactivated(() => {
  window.removeEventListener("resize", handleResize);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  stopApiCheck();
  stopDetectionPolling();
});

onUnmounted(() => {
  if (streamWs) streamWs.close();
  if (videoWs) videoWs.close();
  if (videoSyncInterval) clearInterval(videoSyncInterval);
  if (videoAnimationId) cancelAnimationFrame(videoAnimationId);
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value);
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  window.removeEventListener("resize", handleResize);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  window.removeEventListener("error", handleRuntimeError);
  window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  stopApiCheck();
  stopDetectionPolling();
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
  const start = new Date(startTime.value);
  const end = new Date(endTime.value);
  if (isNaN(start) || isNaN(end) || start > end) {
    timeError.value = true;
  } else {
    timeError.value = false;
  }
};

const categoryTree = [
  {
    key: "all",
    label: "全部",
    children: [
      { key: "person", label: "人员 (Person)", color: "#ff7b7b" },
      { key: "vehicle", label: "车辆 (Vehicle)", color: "#61d9e8" },
      { key: "facility", label: "设施 (Facility)", color: "#f6cf68" },
      { key: "animal", label: "动物 (Animal)", color: "#a56af5" },
    ],
  },
];

const categoryOptions = categoryTree[0].children;
const categoryColorMap = {
  "人员": "#ff7b7b",
  "车辆": "#61d9e8",
  "设施": "#f6cf68",
  "动物": "#a56af5",
};

// --- Connection Status Logic ---
const API_BASE = computed(() => httpBase.value);
const apiStatus = ref("unknown"); // 'ok', 'off', 'unknown'
const apiLatency = ref(0);
let apiCheckTimer = null;

async function checkApiHealth() {
  if (isOffline.value) {
    apiStatus.value = "off";
    apiLatency.value = 0;
    return;
  }
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(`${API_BASE.value}/`, {
      method: "HEAD",
      mode: "no-cors",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    apiLatency.value = Math.round(performance.now() - start);
    apiStatus.value = "ok";
  } catch {
    apiStatus.value = "off";
    apiLatency.value = 0;
  }
}

function startApiCheck() {
  checkApiHealth();
  apiCheckTimer = setInterval(checkApiHealth, 5000);
}

function stopApiCheck() {
  if (apiCheckTimer) {
    clearInterval(apiCheckTimer);
    apiCheckTimer = null;
  }
}

const connList = computed(() => [
  {
    name: "WebSocket 实时流",
    status: streamConnected.value ? "ok" : "off",
    label: streamConnected.value ? "已连接" : "未连接",
  },
  {
    name: "视频检测通道",
    status: videoConnected.value ? "ok" : "off",
    label: videoConnected.value ? "已连接" : "未连接",
  },
  {
    name: "后端 API",
    status: apiStatus.value === "ok" ? "ok" : "off",
    label:
      apiStatus.value === "ok"
        ? `${apiLatency.value}ms`
        : apiStatus.value === "unknown"
          ? "检测中..."
          : "不可达",
  },
  {
    name: "网络状态",
    status: isOffline.value ? "off" : "ok",
    label: isOffline.value ? "断开" : "正常",
  },
]);

const connOnlineCount = computed(
  () => connList.value.filter((c) => c.status === "ok").length,
);

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

    // Fix: when percentage is 100%, the start and end angles are the same
    // and arc drawing will fail. So we check if it's almost 360
    const largeArcFlag = angle > 180 ? 1 : 0;
    let pathData;

    if (total === 0 || percentage === 1) {
      pathData = `M 16 0 A 16 16 0 1 1 15.99 0`;
    } else {
      const x1 = 16 + radius * Math.cos(startRad);
      const y1 = 16 + radius * Math.sin(startRad);
      const x2 = 16 + radius * Math.cos(endRad);
      const y2 = 16 + radius * Math.sin(endRad);
      pathData = `M 16 16 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
    }

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
      color: "rgba(150,150,150,0.2)",
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
  const rawItem =
    activeCategories.value.find((item) => item.name === name) ||
    series.value.classes.find((item) => item.name === name);
  if (!rawItem) return;

  const isActive = activeCategoryNames.value.includes(name);
  const total = isActive
    ? activeCategories.value.reduce((sum, item) => sum + item.value, 0)
    : series.value.classes.reduce((sum, item) => sum + item.value, 0);

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
      <div class="video-section">
        <div class="panel video-card">
          <div class="section-title">
            <h3>实时检测画面</h3>
          </div>

          <div
            ref="videoStageRef"
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
                width: 100%;
                height: 100%;
                object-fit: contain;
                z-index: 10;
                position: absolute;
                top: 0;
                left: 0;
              "
            />

            <video
              v-show="activeMode === 'video' && videoUrl"
              :src="videoUrl"
              ref="localVideo"
              controls
              style="
                width: 100%;
                height: 100%;
                object-fit: contain;
                z-index: 10;
                position: absolute;
                top: 0;
                left: 0;
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
                width: 100%;
                height: 100%;
                object-fit: contain;
                z-index: 10;
                position: absolute;
                top: 0;
                left: 0;
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
              v-if="!hasMediaSource"
              class="empty-state-overlay"
              style="
                position: absolute;
                inset: 0;
                z-index: 25;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--overlay-bg);
                backdrop-filter: blur(4px);
              "
            >
              <div
                class="empty-state-content"
                style="
                  text-align: center;
                  max-width: 320px;
                  padding: 32px;
                  border-radius: 16px;
                  background: var(--bg-panel);
                  border: 1px solid var(--line);
                  box-shadow: var(--shadow);
                "
              >
                <div
                  class="empty-icon-wrapper"
                  style="
                    margin-bottom: 16px;
                    display: inline-flex;
                    padding: 16px;
                    border-radius: 50%;
                    background: var(--status-bg);
                  "
                >
                  <svg
                    v-if="isOffline"
                    class="empty-icon"
                    style="width: 48px; height: 48px; color: var(--danger)"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                    <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                    <line x1="12" y1="20" x2="12.01" y2="20"></line>
                  </svg>
                  <svg
                    v-else-if="mediaError"
                    class="empty-icon"
                    style="width: 48px; height: 48px; color: var(--warning)"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <svg
                    v-else
                    class="empty-icon"
                    style="width: 48px; height: 48px; color: var(--muted)"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="20"
                      height="20"
                      rx="2.18"
                      ry="2.18"
                    ></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                  </svg>
                </div>
                <h3
                  style="margin: 0 0 8px; font-size: 18px; color: var(--text)"
                >
                  {{
                    isOffline
                      ? "网络已断开"
                      : mediaError
                        ? "接入异常"
                        : "暂无数据源接入"
                  }}
                </h3>
                <p
                  style="
                    margin: 0 0 24px;
                    font-size: 13px;
                    color: var(--muted);
                    line-height: 1.5;
                  "
                >
                  {{
                    isOffline
                      ? "请检查网络连接状态"
                      : mediaError
                        ? mediaError
                        : "当前未检测到任何输入，请通过右侧控制面板选择实时流、视频或图片进行接入"
                  }}
                </p>

                <div v-if="!isOffline && !mediaError">
                  <button
                    class="action-btn primary"
                    style="width: 100%; justify-content: center"
                    @click="highlightControlPanel"
                  >
                    立即接入
                  </button>
                </div>
                <div v-if="mediaError && !isOffline">
                  <button
                    class="action-btn"
                    style="width: 100%; justify-content: center"
                    @click="mediaError = ''"
                  >
                    清除错误
                  </button>
                </div>
              </div>
            </div>

            <div
              class="video-info-tag"
              v-if="hasMediaSource"
              style="z-index: 30"
            >
              {{
                activeMode === "stream"
                  ? "实时流"
                  : activeMode === "video"
                    ? "本地视频"
                    : "本地图片"
              }}
              | 1920x1080 | {{ summary.latency }}ms
            </div>

            <!-- Fullscreen Toggle Button -->
            <button
              class="fullscreen-btn"
              @click="toggleFullscreen"
              :title="isFullscreen ? '退出全屏' : '全屏显示'"
            >
              <svg
                v-if="!isFullscreen"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>

          <!-- Integrated Lower Grid inside Video Section -->
          <div class="video-lower-grid">
            <div
              class="subpanel model-info-module"
              style="height: 100%; display: flex; flex-direction: column"
            >
              <div class="subpanel-title">模型信息</div>
              <div class="model-info-list">
                <div class="model-info-row">
                  <span class="model-info-label">模型</span>
                  <strong class="model-info-value">{{ selectedModel }}</strong>
                </div>
                <div class="model-info-row">
                  <span class="model-info-label">推理耗时</span>
                  <strong class="model-info-value highlight">{{ summary.latency }}ms</strong>
                </div>
                <div class="model-info-row">
                  <span class="model-info-label">输入尺寸</span>
                  <strong class="model-info-value">640×640</strong>
                </div>
                <div class="model-info-row">
                  <span class="model-info-label">精度模式</span>
                  <strong class="model-info-value">FP16</strong>
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
      <div class="control-section">
        <div class="control-grid">
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
                  :placeholder="`WebSocket 地址 (如: ws://${backendIp}/...)`"
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
                <label class="file-upload-wrapper">
                  <span class="file-btn">选择文件</span>
                  <span :class="['file-name', { 'has-file': videoFile }]">
                    {{ videoFile ? videoFile.name : "未选择文件" }}
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    @change="onVideoFileChange"
                    class="control-file"
                  />
                </label>

                <!-- Upload Progress UI -->
                <div
                  v-if="uploadState !== 'idle'"
                  class="upload-progress-container"
                >
                  <div class="upload-info">
                    <span class="upload-status">{{
                      getUploadStatusText()
                    }}</span>
                    <span class="upload-stats"
                      >{{ uploadProgress.toFixed(1) }}% | {{ uploadSpeed }} |
                      剩余 {{ uploadEta }}</span
                    >
                  </div>
                  <div class="progress-bar-wrapper">
                    <div
                      class="progress-bar"
                      :class="{
                        paused: uploadState === 'paused',
                        error: uploadState === 'error',
                        success: uploadState === 'success',
                      }"
                      :style="{ width: `${uploadProgress}%` }"
                    ></div>
                  </div>
                </div>

                <div class="action-group">
                  <button
                    v-if="!videoConnected && uploadState !== 'success'"
                    @click="toggleVideoUpload"
                    class="control-btn primary"
                    :disabled="!videoFile"
                  >
                    {{ getUploadButtonText() }}
                  </button>
                  <button
                    v-if="uploadState === 'success' || videoConnected"
                    @click="toggleVideoDetection"
                    :class="[
                      'control-btn',
                      videoConnected ? 'danger' : 'primary',
                    ]"
                  >
                    {{ videoConnected ? "停止视频检测" : "开始视频检测" }}
                  </button>
                  <button
                    v-if="
                      (uploadState === 'uploading' ||
                        uploadState === 'paused' ||
                        uploadState === 'error') &&
                      !videoConnected
                    "
                    @click="cancelVideoUpload"
                    class="control-btn danger"
                  >
                    取消
                  </button>
                </div>
              </div>

              <!-- Image Mode -->
              <div v-if="activeMode === 'image'" class="control-panel">
                <label class="file-upload-wrapper">
                  <span class="file-btn">选择图片</span>
                  <span :class="['file-name', { 'has-file': imageFile }]">
                    {{ imageFile ? imageFile.name : "未选择图片" }}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    @change="onImageFileChange"
                    class="control-file"
                  />
                </label>
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

          <!-- Module 4: Quick Actions -->
          <div class="dashboard-card quick-module" style="flex: 0 0 auto">
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

          <!-- Module 5: Connection Status -->
          <div
            class="dashboard-card conn-module"
            style="flex: 1 1 0; min-height: 0"
          >
            <div class="module-header">
              <h4>连接状态</h4>
              <span class="conn-summary"
                >{{ connOnlineCount }}/{{ connList.length }} 在线</span
              >
            </div>
            <div class="conn-list">
              <div v-for="c in connList" :key="c.name" class="conn-row">
                <span class="conn-dot" :class="c.status"></span>
                <span class="conn-name">{{ c.name }}</span>
                <span class="conn-latency" :class="c.status">{{
                  c.label
                }}</span>
              </div>
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
                <span>完成姣斾緥</span>
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
                  <small>完成搴</small>
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
            <button class="icon-btn" title="清空" @click="clearFrontendLogs">
              🗑️
            </button>
          </div>
          <div class="log-list">
            <div v-for="item in frontendLogs" :key="item.id" class="log-item">
              <span class="log-time">{{ item.time }}</span>
              <span :class="['log-content', item.level]">{{ item.message }}</span>
            </div>
            <div v-if="frontendLogs.length === 0" class="log-item">
              <span class="log-time">--:--:--</span>
              <span class="log-content info">暂无前端日志</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel result-card dashboard-wide-section">
      <div class="section-title">
        <h3>实时检测结果</h3>
        <span class="pill">{{ realtimeDetections.length }} 条</span>
      </div>
      <div class="detection-table-scroll">
        <table>
          <thead>
            <tr>
              <th>时间戳</th>
              <th>目标 ID</th>
              <th>类别</th>
              <th>置信度</th>
              <th>坐标位置</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in realtimeDetections" :key="item.id || item.detectionId">
              <td>{{ item.timestamp || '--' }}</td>
              <td>{{ item.id || item.detectionId || '--' }}</td>
              <td>{{ item.label || item.className || '--' }}</td>
              <td>{{ item.score !== undefined ? Math.round(item.score * 100) + '%' : (item.confidence !== undefined ? Math.round(item.confidence * 100) + '%' : '--') }}</td>
              <td>{{ item.bbox ? (Array.isArray(item.bbox) ? item.bbox.join(', ') : item.bbox) : '--' }}</td>
            </tr>
            <tr v-if="realtimeDetections.length === 0">
              <td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px 0;">等待后端检测数据...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

