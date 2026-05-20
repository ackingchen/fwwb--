# 无人机目标检测系统前端 README

本文件已重构为精简版：删除原文档前半部分的重复内容，仅保留项目使用和页面实现核心信息。

## 1. 项目概览

该项目是基于 `Vue 3 + Pinia + Vue Router + Element Plus + ECharts` 的无人机目标检测前端系统，核心能力是把登录鉴权、任务创建、实时检测、指标分析、历史任务与配置管理打通成一条完整业务链。当前版本支持三种检测输入模式（实时流/本地视频/本地图片），并具备任务前置校验、检测结果可视化叠加、地图联动、登录态持久化、地址历史管理与首次引导等功能，适用于比赛演示和快速联调场景。

## 2. 快速启动

```bash
npm install
npm run dev
```

可选命令：

```bash
npm run build
npm run preview
npm run test
```

## 3. 按页面源码详解

这一章按页面写，结构统一为：页面作用 -> 主流程 -> 核心代码 -> 详细产品流程说明。

## 3.1 登录注册页面（`src/components/AuthView.vue`）

### 页面作用

- 负责用户登录、注册、登录后跳转。
- 自动检测会话，避免用户刷新后重复登录。

### 主流程

1. 进入 `/auth` 页面。
2. `onMounted` 调用 `fetchAuthSession()`。
3. 有会话则直接跳转系统页，无会话则停留登录页。
4. 登录调用 `loginWithBackend`，注册调用 `registerWithBackend`。
5. 登录成功后按 `redirect` 参数跳转目标页面。

### 核心代码

```js
onMounted(async () => {
  const existingSession = await fetchAuthSession();
  if (existingSession) {
    await jumpToSystem();
  }
});

async function submitLogin() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const result = await loginWithBackend(loginForm);
    const displayName = result?.user?.displayName || result?.user?.username || "用户";
    setNotice(`登录成功，欢迎 ${displayName}`, "success");
    await jumpToSystem();
  } catch (error) {
    setNotice(error?.message || "登录失败，请稍后重试", "error");
  } finally {
    submitting.value = false;
  }
}

async function submitRegister() {
  if (submitting.value) return;
  submitting.value = true;

  if (!registerForm.account.trim()) {
    setNotice("请输入账号", "error");
    submitting.value = false;
    return;
  }

  if (registerForm.password !== registerForm.confirmPassword) {
    setNotice("两次输入的密码不一致", "error");
    submitting.value = false;
    return;
  }

  try {
    await registerWithBackend({
      account: registerForm.account,
      password: registerForm.password,
    });
    setNotice("注册成功，请使用账号和密码登录", "success");
    loginForm.account = registerForm.account.trim();
    activeTab.value = "login";
  } finally {
    submitting.value = false;
  }
}
```

### 详细产品流程说明

登录注册页面的产品流程是：用户打开系统后先进入登录页，系统会自动检查本地和后端会话，如果检测到已登录就直接进入业务页面，减少重复操作。新用户点击注册时，页面先校验账号和两次密码，再调用注册接口，注册成功后自动回到登录页并预填账号，方便立刻登录。老用户登录时，页面提交账号密码给后端校验，成功后缓存登录状态并跳转到用户原本要访问的页面（例如大屏或任务页），失败则在当前页给出明确提示。整个流程的产品目标是“低阻力进入系统 + 清晰错误反馈 + 登录态可持续”，保证用户在刷新浏览器或切换页面后不需要频繁重复登录。

---

## 3.2 大屏页面（`src/components/DashboardView.vue`）

### 页面作用

- 主业务页面，负责实时流、视频、图片三种检测模式。
- 负责检测框绘制、结果表更新、地图联动、任务门禁校验。

### 主流程

1. 检测前校验 `dashboard_task_summary` 是否存在。
2. 按模式分发请求：实时流走 WS，视频走上传+WS，图片走上传接口。
3. 接收检测结果后更新画面、表格、全局 store、地图。
4. 任务完成后清空任务摘要，避免新任务误复用旧任务。

### 核心代码 A：实时流启动与参数发送

```js
streamWs = new WebSocket(streamWsAddr.value);
streamWs.onopen = () => {
  streamConnected.value = true;
  const taskPayload = resolveWsTaskPayload("stream");
  streamWs.send(
    JSON.stringify({
      url: streamRtspUrl.value,
      taskName: taskPayload.taskName,
      taskType: taskPayload.taskType,
      taskTypeLabel: taskPayload.taskTypeLabel,
      scene: taskPayload.scene,
      scence: taskPayload.scence,
    }),
  );
};

streamWs.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.image) {
    streamBase64.value = `data:image/jpeg;base64,${data.image}`;
  }
  canvasDetections = Array.isArray(data.detections) ? data.detections : [];
  scheduleDetectionsToStore(canvasDetections, {
    idPrefix: "STREAM",
    timestampFallback: getLogTime(),
  });
};
```

### 核心代码 B：图片检测与 TXT 回退

```js
const txtUploadResult = await ensureReferenceTxtForImageDetection();

const formData = new FormData();
const uploadSummary = resolveWsTaskPayload("image");
formData.append("file", imageFile.value);
formData.append("taskName", uploadSummary.taskName);
formData.append("scene", uploadSummary.scene);
formData.append("taskType", String(uploadSummary.taskType));

const response = await fetch(`${httpBase.value}/detections/image`, {
  method: "POST",
  body: formData,
});

const payload = await response.json();
const normalized = normalizeImageDetections(payload);
canvasDetections = normalized.detections;
imageDetectionDone.value = true;
clearTaskSummaryAfterCompletion("图片任务");
```

### 核心代码 C：画框坐标映射（防错位）

```js
const getContainLayout = (displayWidth, displayHeight, sourceWidth, sourceHeight) => {
  const imageAspect = sourceWidth / sourceHeight;
  const containerAspect = displayWidth / displayHeight;
  let renderWidth;
  let renderHeight;
  let offsetX;
  let offsetY;

  if (imageAspect > containerAspect) {
    renderWidth = displayWidth;
    renderHeight = displayWidth / imageAspect;
    offsetX = 0;
    offsetY = (displayHeight - renderHeight) / 2;
  } else {
    renderHeight = displayHeight;
    renderWidth = displayHeight * imageAspect;
    offsetX = (displayWidth - renderWidth) / 2;
    offsetY = 0;
  }

  return { renderWidth, renderHeight, offsetX, offsetY };
};

const scaleX = renderWidth / sourceWidth;
const scaleY = renderHeight / sourceHeight;
const lx = x1 * scaleX + offsetX;
const ly = y1 * scaleY + offsetY;
const w = (x2 - x1) * scaleX;
const h = (y2 - y1) * scaleY;
ctx.strokeRect(lx, ly, w, h);
```

### 详细产品流程说明

大屏页面的产品流程围绕“开始任务 -> 选择输入源 -> 执行检测 -> 查看结果 -> 完成任务”展开。用户进入大屏后，需要先在快速操作里新建任务，系统会把任务摘要写入本地，作为后续检测的前置条件。然后用户可选择实时流、视频或图片三种模式：实时流模式下输入 WS 地址和 RTSP 地址后点击连接，系统把任务信息和流地址发给后端，后端持续回传图像帧和检测结果；视频模式先上传视频文件，上传成功后再建立检测通道并同步播放进度；图片模式先处理 TXT 参考文件，再上传图片执行检测。检测结果会同步反映到画面框线、结果表、地图定位和统计区域。任务结束时系统自动清空当前任务摘要，并提醒下一轮先新建任务，避免把新结果混入旧任务。

---

## 3.3 指标页面（`src/components/MetricsView.vue`）

### 页面作用

- 展示检测效果指标和实时性能趋势。
- 对多版本后端返回结构做统一适配。

### 主流程

1. 触发 `refreshMetrics`。
2. 拉取 `/data/allData`。
3. `normalizeMetricsPayload` 统一协议结构。
4. 更新 summary、series 并触发图表重绘。

### 核心代码

```js
const normalizeMetricsPayload = (payload) => {
  const container = payload?.data ?? payload?.result ?? payload ?? null;
  return normalizeNewMetrics(container) ?? normalizeLegacyMetrics(container);
};

const refreshMetrics = async () => {
  loading.value = true;
  fetchError.value = "";
  try {
    const response = await fetch(`${httpBase.value}/data/allData`);
    const payload = await response.json();
    const normalized = normalizeMetricsPayload(payload);
    if (!normalized) throw new Error("当前指标数据格式不受支持");

    Object.assign(summary.value, normalized.summaryPatch);
    localSeries.value = { ...emptySeries(), ...normalized.seriesData };
    useBackendData.value = true;
    lastUpdated.value = new Date();
    refreshKey.value += 1;
  } catch (error) {
    fetchError.value = error?.message || "指标拉取失败";
  } finally {
    loading.value = false;
  }
};
```

### 详细产品流程说明

指标页面的产品流程是“请求数据 -> 统一整理 -> 更新卡片与图表 -> 导出分析结果”。用户进入页面或点击刷新后，系统向后端请求指标聚合数据，并把返回内容整理为前端统一结构，然后刷新核心指标卡片、趋势图和分布图。对用户来说，这一页重点是快速回答三个问题：当前检测效果如何（精度、召回、mAP）、系统是否稳定（FPS、时延、吞吐）、不同类别和场景表现是否均衡。页面同时提供导出功能，便于比赛汇报时直接输出图表素材。若后端暂时不可用，页面会保留上一次有效数据并显示错误提示，不会直接白屏，保证用户依然能查看最近一次分析结果。

---

## 3.4 任务页面（`src/components/TasksView.vue`）

### 页面作用

- 管理历史任务，支持搜索、分页、详情、删除。
- 适配后端不统一字段，保证页面稳定展示。

### 主流程

1. 周期拉取 `/data/tasks`。
2. 对任务记录做归一化（字段名、类型、时间、状态）。
3. 查看详情时调用 `/data/detail?taskId&taskType`。
4. 删除时调用 `/data/deleteDetail` 并更新当前页数据。

### 核心代码 A：任务类型推断

```js
function inferTaskTypeFromSource(sourceValue) {
  const source = String(sourceValue ?? "").trim().toLowerCase();
  if (!source) return null;

  if (
    source.startsWith("rtsp://") ||
    source.startsWith("rtmp://") ||
    source.includes("stream") ||
    source.includes("live")
  ) {
    return 2;
  }

  if (source.includes("video") || /\.(mp4|avi|mov|mkv|flv|wmv|mpeg|m4v)(\?|$)/.test(source)) {
    return 1;
  }

  if (source.includes("image") || /\.(jpg|jpeg|png|bmp|webp|gif|tif|tiff)(\?|$)/.test(source)) {
    return 0;
  }

  return null;
}
```

### 核心代码 B：任务详情加载

```js
const detailUrl = new URL(`${httpBase.value}/data/detail`);
detailUrl.searchParams.set("taskId", taskId);
detailUrl.searchParams.set("taskType", String(taskType));
const response = await fetch(detailUrl.toString(), { method: "GET" });
const payload = await response.json();
detailTask.value = normalizeTaskRecord(payload?.data ?? payload, 0, task);
```

### 详细产品流程说明

任务页面的产品流程是“任务列表管理 + 任务详情追踪 + 任务清理”。用户进入任务页后，系统周期性拉取任务列表并展示任务名称、来源、检测时间、状态等关键信息；用户可通过搜索快速定位目标任务。点击“查看详情”后，页面会请求该任务的详细结果（含检测前后图片或视频帧、指标信息），用于复盘效果。点击“删除”时，系统会弹出确认，确认后调用删除接口并刷新当前列表，确保页面和后端数据一致。这个页面在产品层面的价值是沉淀历史任务闭环：用户不仅能做实时检测，还能回看、对比、筛选和清理任务，方便项目演示时展示“可追踪、可复盘、可管理”的完整能力。

---

## 3.5 配置页面（`src/components/SettingsView.vue`）

### 页面作用

- 管理检测参数、账号信息、后端地址、RTSP 地址和系统日志。

### 主流程

1. 基础设置（阈值、标签、语言、通知）写入 store。
2. 地址管理写入历史列表，支持使用与删除。
3. 日志模块按轮询周期请求可用端点并统一展示。

### 核心代码 A：后端/RTSP 地址管理

```js
const saveBackendIp = () => {
  const trimmed = backendIpInput.value.trim();
  if (!trimmed) return;
  configStore.setBackendIp(trimmed);
  backendIpInput.value = backendIp.value;
};

const saveStreamRtsp = () => {
  const trimmed = streamRtspInput.value.trim();
  if (!trimmed) return;
  configStore.setStreamRtspUrl(trimmed, { saveHistory: true });
  streamRtspInput.value = streamRtspUrl.value;
};
```

### 核心代码 B：日志接口轮询

```js
const LOG_ENDPOINT_PATHS = ["/system/logs", "/api/v1/system/logs"];

const startLogPolling = () => {
  if (logTimer) return;
  fetchSystemLogs();
  logTimer = setInterval(() => fetchSystemLogs({ silent: true }), LOG_POLL_INTERVAL);
};

const stopLogPolling = () => {
  if (!logTimer) return;
  clearInterval(logTimer);
  logTimer = null;
};
```

### 详细产品流程说明

配置页面的产品流程分为“基础配置、账号管理、运行维护”三块。基础配置中，用户可调整置信度、IoU、类别开关、语言与通知偏好，修改后立即影响系统行为；地址管理中，用户输入新的后端地址或 RTSP 地址后可一键保存到本地历史，后续可以直接复用或删除，减少重复输入。账号管理部分提供用户名编辑、密码修改入口以及登录历史查看，便于区分不同使用者。运行维护部分会定时拉取系统日志，帮助定位后端不可达、接口异常等问题。该页面的产品价值是把“系统可配置性”和“运维可观察性”集中到一个入口，让用户不需要改代码就能完成日常调整和故障排查。

## 4. 页面级接口对照（汇总）

| 页面 | 主要接口/通道 | 关键入参 |
|---|---|---|
| 登录注册页面 | `/api/auth/register` `/api/auth/login` `/api/auth/session` `/api/auth/logout` | `account` `password` |
| 大屏页面 | `/detections/video` `/detections/image` `/detections/upload` `/detections/latest` `/system/resources` `/map/telemetry` `ws://.../stream-detect` `ws://.../video-detect` | `taskName` `taskType` `scene` `url/videoPath` |
| 指标页面 | `/data/allData` | 无（读取后端聚合数据） |
| 任务页面 | `/data/tasks` `/data/detail` `/data/deleteDetail` | `taskId` `taskType` |
| 配置页面 | `/system/logs` `/api/v1/system/logs` | 分页参数（可选） |

## 5. 排错建议（最常见）

1. 实时流连上无画面：先看后端是否持续返回 `image` 字段，再检查 base64 前缀与画布映射。
2. 框错位：核对源尺寸与显示尺寸，确认 `contain` 映射参数正确。
3. 图片检测失败：确认 TXT 上传是否成功，是否触发默认 TXT 回退。
4. 刷新后仍要登录：检查 `uav_auth_session_v1` 是否写入以及路由守卫是否命中。
