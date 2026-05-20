<script setup>
import { useConfigStore } from "../stores/useConfigStore";
import { storeToRefs } from "pinia";
import {
  reactive,
  ref,
  watch,
  onActivated,
  onDeactivated,
  onUnmounted,
  onMounted,
} from "vue";
import { getAuthSession, getLoginHistory, updateAuthProfile } from "../utils/auth";

const configStore = useConfigStore();
const {
  confidence,
  iou,
  selectedModel,
  enabledLabels,
  language,
  autoUpdate,
  notifications,
  backendIp,
  backendIpHistory,
  streamRtspUrl,
  streamRtspHistory,
  httpBase,
} = storeToRefs(configStore);

// Address management
const backendIpInput = ref(backendIp.value);
const streamRtspInput = ref(streamRtspUrl.value || "");
const ipSaved = ref(false);
const streamSaved = ref(false);

const showSavedFlag = (targetRef) => {
  targetRef.value = true;
  setTimeout(() => {
    targetRef.value = false;
  }, 1500);
};

const saveBackendIp = () => {
  const trimmed = backendIpInput.value.trim();
  if (!trimmed) return;
  configStore.setBackendIp(trimmed);
  backendIpInput.value = backendIp.value;
  showSavedFlag(ipSaved);
};

const useBackendIpFromHistory = (value) => {
  configStore.useBackendIp(value);
  backendIpInput.value = backendIp.value;
  showSavedFlag(ipSaved);
};

const removeBackendIpFromHistory = (value) => {
  configStore.removeBackendIp(value);
  backendIpInput.value = backendIp.value;
};

const saveStreamRtsp = () => {
  const trimmed = streamRtspInput.value.trim();
  if (!trimmed) return;
  configStore.setStreamRtspUrl(trimmed, { saveHistory: true });
  streamRtspInput.value = streamRtspUrl.value;
  showSavedFlag(streamSaved);
};

const useStreamRtspFromHistory = (value) => {
  configStore.useStreamRtspUrl(value);
  streamRtspInput.value = streamRtspUrl.value;
  showSavedFlag(streamSaved);
};

const removeStreamRtspFromHistory = (value) => {
  configStore.removeStreamRtspUrl(value);
  streamRtspInput.value = streamRtspUrl.value || "";
};

// 系统信息（未接后端前使用占位）
const systemInfo = {
  version: "--",
  build: "--",
  os: "--",
  kernel: "--",
  uptime: "--",
};

// UI State
const activeTab = ref("basic");
const isSaving = ref(false);
const showSaveSuccess = ref(false);
const showSaveError = ref(false);

const loginHistory = ref([]);
const systemLogs = ref([]);
const accountForm = reactive({
  username: "",
});
const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});
const accountMessage = ref("");
const accountMessageType = ref("success");
const passwordMessage = ref("");
const passwordMessageType = ref("success");

const LOG_POLL_INTERVAL = 5000;
const LOG_PAGE_SIZE = 50;
const LOG_ENDPOINT_PATHS = ["/system/logs", "/api/v1/system/logs"];
let logTimer = null;
let resolvedLogPath = "";
let logFetching = false;
const logsLoading = ref(false);
const logsError = ref("");
const logsUpdatedAt = ref("");

const formatLogTime = (value) => {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("zh-CN", { hour12: false });
    }
  }
  return String(value);
};

const normalizeLogLevel = (value) => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["warning", "warn", "w"].includes(raw)) return "warning";
  if (["error", "err", "e", "fatal"].includes(raw)) return "error";
  if (["success", "ok", "done"].includes(raw)) return "success";
  return "info";
};

const normalizeLogsPayload = (payload) => {
  let list = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (Array.isArray(payload?.data)) {
    list = payload.data;
  } else if (Array.isArray(payload?.result)) {
    list = payload.result;
  } else if (Array.isArray(payload?.list)) {
    list = payload.list;
  } else if (Array.isArray(payload?.data?.list)) {
    list = payload.data.list;
  } else if (Array.isArray(payload?.data?.records)) {
    list = payload.data.records;
  } else if (Array.isArray(payload?.records)) {
    list = payload.records;
  }

  return list.map((item, index) => ({
    id: String(item.id ?? item.logId ?? item.log_id ?? `${Date.now()}-${index}`),
    time: formatLogTime(
      item.time ?? item.timestamp ?? item.createdAt ?? item.createTime ?? item.created_at,
    ),
    level: normalizeLogLevel(item.level ?? item.severity ?? item.type ?? item.logLevel),
    message:
      item.message ??
      item.msg ??
      item.content ??
      item.description ??
      JSON.stringify(item),
  }));
};

const parseErrorMessage = async (response) => {
  try {
    const text = await response.text();
    if (!text) return `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      return parsed?.message || parsed?.msg || text;
    } catch {
      return text;
    }
  } catch {
    return `HTTP ${response.status}`;
  }
};

const requestLogsByPath = async (path) => {
  const withQuery = `${httpBase.value}${path}?page=1&size=${LOG_PAGE_SIZE}`;
  const withoutQuery = `${httpBase.value}${path}`;
  const urls = [withQuery, withoutQuery];

  let lastErr = null;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const message = await parseErrorMessage(response);
        throw new Error(message);
      }
      return await response.json();
    } catch (error) {
      lastErr = error;
    }
  }
  throw lastErr || new Error("日志接口请求失败");
};

const fetchSystemLogs = async ({ silent = false } = {}) => {
  if (logFetching) return;
  logFetching = true;
  if (!silent) logsLoading.value = true;
  logsError.value = "";

  try {
    let payload = null;
    if (resolvedLogPath) {
      payload = await requestLogsByPath(resolvedLogPath);
    } else {
      let lastError = null;
      for (const path of LOG_ENDPOINT_PATHS) {
        try {
          payload = await requestLogsByPath(path);
          resolvedLogPath = path;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!payload) throw lastError || new Error("No available log endpoint");
    }

    systemLogs.value = normalizeLogsPayload(payload);
    logsUpdatedAt.value = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  } catch (error) {
    logsError.value =
      error.message === "Failed to fetch"
        ? "Log service unreachable, please check backend connectivity"
        : `Failed to fetch logs: ${error.message}`;
  } finally {
    logFetching = false;
    logsLoading.value = false;
  }
};

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

const tabs = [
  { key: "account", label: "个人账号信息", icon: "账" },
  { key: "basic", label: "基础设置", icon: "基" },
  { key: "advanced", label: "高级设置", icon: "高" },
  { key: "help", label: "帮助中心", icon: "助" },
];

const GUIDE_REPLAY_EVENT = "uav-guide:replay";
const helpActionMessage = ref("");
const helpUsageSteps = [
  {
    title: "第一步：登录并创建任务",
    detail:
      "进入系统后先完成登录。在大屏页面点击“新建任务”，填写任务名称、场景和来源。未创建任务时系统会阻止检测启动。",
  },
  {
    title: "第二步：选择检测模式",
    detail:
      "根据实际场景选择实时流、本地视频或本地图片。实时流需填写 WebSocket 与 RTSP 地址；视频需先上传；图片需先选择图片文件。",
  },
  {
    title: "第三步：启动检测并观察结果",
    detail:
      "检测启动后，画面会叠加目标框，结果表会持续刷新类别、置信度和坐标，地图模块会同步更新目标位置态势。",
  },
  {
    title: "第四步：查看指标与历史任务",
    detail:
      "在指标页面查看 mAP、Precision、Recall、FPS、时延等数据，在任务页面回看任务详情、图片前后对比和历史记录。",
  },
  {
    title: "第五步：在配置页完成维护",
    detail:
      "在基础设置中维护阈值与类别，在地址管理中保存常用后端和 RTSP 地址，在高级设置中查看系统日志并排查问题。",
  },
];

const helpFeatureCards = [
  {
    name: "多源检测接入",
    description:
      "支持实时流、视频、图片三类输入。用户可按业务场景快速切换，不需要切换页面即可完成全流程检测。",
  },
  {
    name: "任务闭环管理",
    description:
      "系统通过任务摘要控制检测执行，确保每次检测都有任务上下文，并可在任务页面完成详情复盘与历史管理。",
  },
  {
    name: "可视化分析",
    description:
      "检测画面、结果表、地图和指标图表联动展示，帮助用户快速判断识别效果、系统状态和整体运行质量。",
  },
  {
    name: "配置与运维能力",
    description:
      "支持阈值调节、类别开关、地址历史、日志查看和缓存清理，便于比赛现场快速调参和故障排查。",
  },
];

const helpFaqs = [
  {
    question: "为什么点开始检测后提示要先新建任务？",
    answer:
      "系统设计上要求检测前必须先创建任务，用于绑定任务名称、场景和检测来源。这样可以保证后续结果可追溯、可复盘。任务完成后系统会自动清空任务摘要，下一轮检测需要重新新建任务。",
  },
  {
    question: "实时流显示已连接，但画面一直不出来怎么办？",
    answer:
      "请按顺序排查：1）后端是否持续返回 image 帧；2）RTSP 地址是否可拉流；3）WebSocket 地址与后端端口是否一致；4）浏览器控制台是否出现跨域或网络错误。通常是地址或后端推流侧问题。",
  },
  {
    question: "图片检测前为什么要上传 TXT 文件？",
    answer:
      "图片检测流程会先处理参考 TXT。若未上传或文件异常，系统会自动回退默认参考文件继续检测，确保流程可走通。建议在正式检测前上传当前任务对应的 TXT 参考文件，结果更可控。",
  },
  {
    question: "刷新页面后还要不要重新设置后端地址？",
    answer:
      "不需要。配置页会把后端地址和 RTSP 地址保存在本地历史中。刷新后可直接从历史列表点击“使用”，也可删除不再使用的地址，避免重复输入。",
  },
  {
    question: "我跳过了新手指引，还能再看一遍吗？",
    answer:
      "可以。在帮助中心点击“回顾新手指引”即可再次打开指引流程。你可以按步骤重新浏览大屏、指标、任务和配置页面的关键功能。",
  },
];

const detectionOptions = [
  { key: "pedestrian", label: "行人 (Pedestrian)" },
  { key: "people", label: "人群 (People)" },
  { key: "bicycle", label: "自行车 (Bicycle)" },
  { key: "car", label: "汽车 (Car)" },
  { key: "van", label: "面包车 (Van)" },
  { key: "truck", label: "卡车 (Truck)" },
  { key: "tricycle", label: "三轮车 (Tricycle)" },
  { key: "awning-tricycle", label: "棚式三轮车 (Awning-tricycle)" },
  { key: "bus", label: "公交车 (Bus)" },
  { key: "motor", label: "摩托车 (Motor)" },
];

// Helper Functions
function toggleLabel(key) {
  const next = enabledLabels.value.includes(key)
    ? enabledLabels.value.filter((item) => item !== key)
    : [...enabledLabels.value, key];
  enabledLabels.value = next;
  triggerSave();
}

function handleReset() {
  if (confirm("确定要恢复所有设置到默认状态吗？")) {
    configStore.resetSettings();
    triggerSave();
  }
}

function triggerSave() {
  isSaving.value = true;
  showSaveSuccess.value = false;

  // Mock API delay
  setTimeout(() => {
    isSaving.value = false;
    showSaveSuccess.value = true;
    setTimeout(() => {
      showSaveSuccess.value = false;
    }, 2000);
  }, 600);
}

function saveAccountProfile() {
  const nextUsername = accountForm.username.trim();
  accountMessage.value = "";

  if (!nextUsername) {
    accountMessageType.value = "error";
    accountMessage.value = "请输入用户名";
    return;
  }

  if (nextUsername.length < 2 || nextUsername.length > 20) {
    accountMessageType.value = "error";
    accountMessage.value = "用户名长度需为 2-20 个字符";
    return;
  }

  const updated = updateAuthProfile({
    displayName: nextUsername,
    username: nextUsername,
  });
  if (!updated) {
    accountMessageType.value = "error";
    accountMessage.value = "当前未检测到登录会话";
    return;
  }

  triggerSave();
  accountMessageType.value = "success";
  accountMessage.value = "用户名已更新";
}

function submitPasswordChange() {
  passwordMessage.value = "";
  const currentPassword = String(passwordForm.currentPassword || "");
  const newPassword = String(passwordForm.newPassword || "");
  const confirmPassword = String(passwordForm.confirmPassword || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    passwordMessageType.value = "error";
    passwordMessage.value = "请完整填写密码信息";
    return;
  }

  if (newPassword.length < 6) {
    passwordMessageType.value = "error";
    passwordMessage.value = "新密码至少需要 6 位";
    return;
  }

  if (newPassword !== confirmPassword) {
    passwordMessageType.value = "error";
    passwordMessage.value = "两次输入的新密码不一致";
    return;
  }

  if (newPassword === currentPassword) {
    passwordMessageType.value = "error";
    passwordMessage.value = "新密码不能与旧密码相同";
    return;
  }

  triggerSave();
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
  passwordMessageType.value = "success";
  passwordMessage.value = "密码修改请求已提交（待后端接入）";
}

function clearCache() {
  if (confirm("确定要清理系统缓存吗？这将重新加载应用。")) {
    alert("缓存清理完成");
    window.location.reload();
  }
}

function replayOnboardingGuide() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GUIDE_REPLAY_EVENT, {
      detail: {
        source: "settings-help",
        openIntroFirst: true,
      },
    }),
  );
  helpActionMessage.value = "已打开引导入口，可按步骤重新回顾系统使用流程。";
  setTimeout(() => {
    helpActionMessage.value = "";
  }, 2600);
}

watch(activeTab, (tab) => {
  if (tab === "advanced") {
    startLogPolling();
  } else {
    stopLogPolling();
  }
});

watch(httpBase, () => {
  resolvedLogPath = "";
  if (activeTab.value === "advanced") {
    fetchSystemLogs();
  }
});

watch(backendIp, (next) => {
  backendIpInput.value = String(next ?? "").trim();
});

watch(streamRtspUrl, (next) => {
  streamRtspInput.value = String(next ?? "").trim();
});

onActivated(() => {
  if (activeTab.value === "advanced") {
    startLogPolling();
  }
});

onDeactivated(() => {
  stopLogPolling();
});

onMounted(() => {
  const session = getAuthSession();
  accountForm.username = session?.displayName || session?.username || "";
  loginHistory.value = getLoginHistory();
});

onUnmounted(() => {
  stopLogPolling();
});
</script>

<template>
  <div class="settings-layout">
    <!-- Sidebar Navigation -->
    <aside class="settings-sidebar">
      <div class="sidebar-title">设置中心</div>
      <nav class="settings-nav" data-guide="settings.nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['nav-btn', { active: activeTab === tab.key }]"
          :data-guide="`settings.nav.${tab.key}`"
          @click="activeTab = tab.key"
        >
          <span class="nav-icon">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="version-tag">v{{ systemInfo.version }}</div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="settings-content">
      <!-- Header -->
      <header class="settings-header">
        <h2>{{ tabs.find((t) => t.key === activeTab)?.label }}</h2>
        <div class="header-actions">
          <transition name="fade">
            <span v-if="showSaveSuccess" class="status-msg success">已保存</span>
          </transition>
          <transition name="fade">
            <span v-if="isSaving" class="status-msg saving">保存中...</span>
          </transition>
          <button class="reset-btn" @click="handleReset">重置默认</button>
        </div>
      </header>

      <!-- Tab: Detection -->
      <section
        v-if="activeTab === 'basic'"
        class="settings-section fade-in basic-unified-grid"
      >
        <div class="panel basic-model-card">
          <div class="panel-header"><h3>推理模型</h3></div>
          <div class="form-grid">
            <label class="form-item">
              <span>模型版本</span>
              <select v-model="selectedModel" @change="triggerSave">
                <option>YOLOv11-lite</option>
                <option>RT-DETR-mini</option>
                <option>Edge-Transformer</option>
              </select>
              <small>建议使用 YOLOv11-lite 以获得更好的实时性能</small>
            </label>

            <label class="form-item">
              <div class="slider-head">
                <span>置信度阈值</span>
                <strong>{{ confidence.toFixed(2) }}</strong>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.01"
                v-model.number="confidence"
                @change="triggerSave"
              />
            </label>

            <label class="form-item">
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
                @change="triggerSave"
              />
            </label>
          </div>
        </div>

        <div class="panel basic-label-card">
          <div class="panel-header"><h3>检测类别</h3></div>
          <div class="checkbox-grid">
            <button
              v-for="option in detectionOptions"
              :key="option.key"
              :class="[
                'toggle-card',
                { active: enabledLabels.includes(option.key) },
              ]"
              @click="toggleLabel(option.key)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="panel basic-preferences-card">
          <div class="panel-header"><h3>常规设置</h3></div>
          <div class="form-grid">
            <label class="form-item">
              <span>界面语言</span>
              <select v-model="language" @change="triggerSave">
                <option value="zh-CN">简体中文</option>
                <option value="en-US">English</option>
              </select>
            </label>

            <div class="switch-row">
              <div class="switch-info">
                <span>自动更新</span>
                <small>自动下载并安装最新的模型权重和系统补丁</small>
              </div>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="autoUpdate"
                  @change="triggerSave"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="panel basic-notify-card">
          <div class="panel-header"><h3>通知设置</h3></div>
          <div class="switch-list">
            <div class="switch-row">
              <span>系统提示音</span>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="notifications.sound"
                  @change="triggerSave"
                />
                <span class="slider"></span>
              </label>
            </div>
            <div class="switch-row">
              <span>桌面弹窗</span>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="notifications.popup"
                  @change="triggerSave"
                />
                <span class="slider"></span>
              </label>
            </div>
            <div class="switch-row">
              <span>邮件报告</span>
              <label class="switch">
                <input
                  type="checkbox"
                  v-model="notifications.email"
                  @change="triggerSave"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="panel basic-api-card" data-guide="settings.backend-api">
          <div class="panel-header">
            <h3>后端和实时流地址管理</h3>
          </div>
          <div class="address-manager-grid">
            <div class="address-manager">
              <h4>后端 API 地址</h4>
              <div class="ip-input-row">
                <input
                  type="text"
                  v-model="backendIpInput"
                  placeholder="如: 10.21.204.210:8080"
                  @keyup.enter="saveBackendIp"
                />
                <button class="action-btn primary" @click="saveBackendIp" style="white-space: nowrap;">
                  保存
                </button>
              </div>
              <transition name="fade">
                <span v-if="ipSaved" class="status-msg success">已保存并加入历史</span>
              </transition>
              <div class="address-list">
                <div
                  v-for="item in backendIpHistory"
                  :key="`backend-${item}`"
                  class="address-item"
                >
                  <span class="address-value" :title="item">{{ item }}</span>
                  <div class="address-item-actions">
                    <span v-if="item === backendIp" class="pill success">当前使用</span>
                    <button class="action-btn sm" @click="useBackendIpFromHistory(item)">使用</button>
                    <button class="action-btn sm danger" @click="removeBackendIpFromHistory(item)">
                      删除
                    </button>
                  </div>
                </div>
                <div v-if="backendIpHistory.length === 0" class="sys-log-empty">暂无历史地址</div>
              </div>
            </div>

            <div class="address-manager">
              <h4>实时流地址 (RTSP)</h4>
              <div class="ip-input-row">
                <input
                  type="text"
                  v-model="streamRtspInput"
                  placeholder="如: rtsp://192.168.1.20/live"
                  @keyup.enter="saveStreamRtsp"
                />
                <button class="action-btn primary" @click="saveStreamRtsp" style="white-space: nowrap;">
                  保存
                </button>
              </div>
              <transition name="fade">
                <span v-if="streamSaved" class="status-msg success">已保存并加入历史</span>
              </transition>
              <div class="address-list">
                <div
                  v-for="item in streamRtspHistory"
                  :key="`stream-${item}`"
                  class="address-item"
                >
                  <span class="address-value" :title="item">{{ item }}</span>
                  <div class="address-item-actions">
                    <span v-if="item === streamRtspUrl" class="pill success">当前使用</span>
                    <button class="action-btn sm" @click="useStreamRtspFromHistory(item)">使用</button>
                    <button class="action-btn sm danger" @click="removeStreamRtspFromHistory(item)">
                      删除
                    </button>
                  </div>
                </div>
                <div v-if="streamRtspHistory.length === 0" class="sys-log-empty">暂无历史地址</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <!-- Tab: Security -->
      <section v-if="activeTab === 'account'" class="settings-section fade-in">
        <div class="split-row">
          <div class="panel">
            <div class="panel-header"><h3>编辑个人用户名</h3></div>
            <div class="form-grid">
              <label class="form-item">
                <span>用户名</span>
                <input
                  type="text"
                  v-model="accountForm.username"
                  maxlength="20"
                  placeholder="请输入新用户名"
                />
                <small>用于页面右上角显示，长度 2-20 个字符</small>
              </label>
            </div>
            <div class="account-actions">
              <button class="action-btn primary" @click="saveAccountProfile">
                保存用户名
              </button>
              <span
                v-if="accountMessage"
                :class="['status-msg', accountMessageType === 'error' ? 'error' : 'success']"
              >
                {{ accountMessage }}
              </span>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h3>修改密码</h3></div>
            <div class="form-grid">
              <label class="form-item">
                <span>当前密码</span>
                <input
                  type="password"
                  v-model="passwordForm.currentPassword"
                  autocomplete="current-password"
                  placeholder="请输入当前密码"
                />
              </label>
              <label class="form-item">
                <span>新密码</span>
                <input
                  type="password"
                  v-model="passwordForm.newPassword"
                  autocomplete="new-password"
                  placeholder="请输入新密码（至少 6 位）"
                />
              </label>
              <label class="form-item">
                <span>确认新密码</span>
                <input
                  type="password"
                  v-model="passwordForm.confirmPassword"
                  autocomplete="new-password"
                  placeholder="请再次输入新密码"
                />
              </label>
            </div>
            <div class="account-actions">
              <button class="action-btn primary" @click="submitPasswordChange">
                提交修改
              </button>
              <span
                v-if="passwordMessage"
                :class="['status-msg', passwordMessageType === 'error' ? 'error' : 'success']"
              >
                {{ passwordMessage }}
              </span>
            </div>
          </div>
        </div>

        <div class="panel full-width-panel">
          <div class="panel-header"><h3>登录历史</h3></div>
          <div class="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>IP 地址</th>
                  <th>地点</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="log in loginHistory" :key="log.id">
                  <td>{{ log.time }}</td>
                  <td>{{ log.ip }}</td>
                  <td>{{ log.location }}</td>
                  <td>
                    <span
                      :class="[
                        'pill',
                        log.status === 'success' ? 'success' : 'danger',
                      ]"
                    >
                      {{ log.status === "success" ? "成功" : "失败" }}
                    </span>
                  </td>
                </tr>
                <tr v-if="loginHistory.length === 0">
                  <td colspan="4" class="sys-log-empty">--</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </section>

      <!-- Tab: Help -->
      <section v-if="activeTab === 'help'" class="settings-section fade-in">
        <div class="panel full-width-panel help-panel">
          <div class="panel-header help-header">
            <h3>系统使用指南</h3>
            <button class="action-btn primary" @click="replayOnboardingGuide">
              回顾新手指引
            </button>
          </div>
          <p class="help-intro">
            本系统提供从任务创建、数据接入、实时检测、指标分析到任务复盘的完整操作链路。建议首次使用时按照下方步骤依次操作，可最快完成一次完整检测流程。
          </p>
          <div v-if="helpActionMessage" class="status-msg success help-status-tip">
            {{ helpActionMessage }}
          </div>
          <ol class="help-step-list">
            <li v-for="item in helpUsageSteps" :key="item.title" class="help-step-item">
              <h4>{{ item.title }}</h4>
              <p>{{ item.detail }}</p>
            </li>
          </ol>
        </div>

        <div class="panel full-width-panel help-panel">
          <div class="panel-header"><h3>核心功能介绍</h3></div>
          <div class="help-feature-grid">
            <article
              v-for="feature in helpFeatureCards"
              :key="feature.name"
              class="help-feature-card"
            >
              <h4>{{ feature.name }}</h4>
              <p>{{ feature.description }}</p>
            </article>
          </div>
        </div>

        <div class="panel full-width-panel help-panel">
          <div class="panel-header"><h3>常见问题与解答</h3></div>
          <div class="help-faq-list">
            <details v-for="faq in helpFaqs" :key="faq.question" class="help-faq-item">
              <summary>{{ faq.question }}</summary>
              <p>{{ faq.answer }}</p>
            </details>
          </div>
        </div>
      </section>

      <!-- Tab: Advanced -->
      <section v-if="activeTab === 'advanced'" class="settings-section fade-in">
        <div class="panel full-width-panel">
          <div class="panel-header"><h3>系统信息</h3></div>
          <div class="info-grid">
            <div class="info-card">
              <span>版本</span>
              <strong>{{ systemInfo.version }}</strong>
            </div>
            <div class="info-card">
              <span>Build</span>
              <strong>{{ systemInfo.build }}</strong>
            </div>
            <div class="info-card">
              <span>OS</span>
              <strong>{{ systemInfo.os }}</strong>
            </div>
            <div class="info-card">
              <span>内核</span>
              <strong>{{ systemInfo.kernel }}</strong>
            </div>
            <div class="info-card">
              <span>运行时间</span>
              <strong>{{ systemInfo.uptime }}</strong>
            </div>
          </div>
        </div>

        <div class="panel full-width-panel">
          <div class="panel-header">
            <h3>系统日志</h3>
            <div class="log-header-actions">
              <span v-if="logsLoading" class="status-msg saving">同步中...</span>
              <span v-else-if="logsUpdatedAt" class="status-msg saving"
                >更新时间: {{ logsUpdatedAt }}</span
              >
              <button class="action-btn sm" @click="fetchSystemLogs()">
                刷新
              </button>
            </div>
          </div>
          <div class="log-viewer">
            <div v-if="logsError" class="sys-log-empty" style="color: var(--danger)">
              {{ logsError }}
            </div>
            <div v-for="log in systemLogs" :key="log.id" class="sys-log-row">
              <span class="log-ts">{{ log.time }}</span>
              <span :class="['log-lvl', log.level]">{{
                log.level.toUpperCase()
              }}</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
            <div v-if="!logsLoading && !logsError && systemLogs.length === 0" class="sys-log-empty">
              --
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header"><h3>维护操作</h3></div>
          <div class="maintenance-row">
            <div class="m-info">
              <strong>清理系统缓存</strong>
              <small>清除本地临时文件、模型缓存和缩略图</small>
            </div>
            <button class="action-btn warning" @click="clearCache">
              立即清理
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  height: calc(100vh - 140px); /* Adjust based on header/padding */
  overflow: hidden;
}

/* Sidebar */
.settings-sidebar {
  background: rgba(11, 35, 72, 0.4);
  border-right: 1px solid rgba(79, 149, 255, 0.1);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 16px;
  padding-left: 12px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: none;
  background: transparent;
  color: var(--text);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  font-size: 14px;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.nav-btn.active {
  background: rgba(79, 149, 255, 0.15);
  color: var(--cyan);
  font-weight: 500;
}

.nav-icon {
  font-size: 18px;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  text-align: center;
}

.version-tag {
  font-size: 12px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
}

/* Main Content */
.settings-content {
  overflow-y: auto;
  padding-right: 8px; /* Scrollbar space */
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.settings-header h2 {
  margin: 0;
  font-size: 20px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.log-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.status-msg {
  font-size: 13px;
}

.status-msg.success {
  color: var(--success);
}
.status-msg.saving {
  color: var(--muted);
}
.status-msg.error {
  color: var(--danger);
}

.reset-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--muted);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.reset-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}

/* Section Common */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%; /* Ensure full width */
}

.help-panel {
  position: relative;
  overflow: hidden;
}

.help-header {
  gap: 10px;
}

.help-intro {
  margin: 4px 0 14px;
  color: var(--text);
  line-height: 1.7;
  font-size: 14px;
}

.help-status-tip {
  margin-bottom: 10px;
}

.help-step-list {
  margin: 0;
  padding: 0 0 0 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.help-step-item h4 {
  margin: 0 0 6px;
  font-size: 14px;
}

.help-step-item p {
  margin: 0;
  color: var(--muted);
  line-height: 1.65;
  font-size: 13px;
}

.help-feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.help-feature-card {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(117, 182, 255, 0.24);
  background: linear-gradient(145deg, rgba(26, 55, 95, 0.42), rgba(12, 28, 53, 0.4));
}

.help-feature-card h4 {
  margin: 0 0 6px;
  font-size: 14px;
  color: var(--text);
}

.help-feature-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.help-faq-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.help-faq-item {
  border: 1px solid rgba(130, 189, 255, 0.24);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  padding: 10px 12px;
}

.help-faq-item summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text);
  outline: none;
  list-style: none;
}

.help-faq-item summary::-webkit-details-marker {
  display: none;
}

.help-faq-item summary::before {
  content: "▶";
  display: inline-block;
  margin-right: 8px;
  font-size: 10px;
  transform-origin: 50% 50%;
  transition: transform 0.2s ease;
}

.help-faq-item[open] summary::before {
  transform: rotate(90deg);
}

.help-faq-item p {
  margin: 10px 0 0 18px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

/* Full Width Grid Layout for Sections */
.full-width-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 18px;
}

.basic-unified-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: stretch;
}

.basic-unified-grid > .panel {
  height: 320px;
  display: flex;
  flex-direction: column;
}

.basic-model-card,
.basic-api-card,
.basic-label-card,
.basic-preferences-card,
.basic-notify-card {
  position: relative;
  overflow: hidden;
  border-color: rgba(79, 149, 255, 0.24);
  box-shadow:
    0 14px 32px rgba(4, 15, 34, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.basic-model-card::before,
.basic-api-card::before,
.basic-label-card::before,
.basic-preferences-card::before,
.basic-notify-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 14px;
  right: 14px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(95, 170, 255, 0.7), transparent);
}

.basic-model-card .form-grid,
.basic-api-card .form-grid,
.basic-preferences-card .form-grid {
  gap: 14px;
}

.basic-model-card {
  order: 1;
}

.basic-label-card {
  order: 2;
}

.basic-preferences-card {
  order: 3;
}

.basic-notify-card {
  order: 4;
}

/* 这两个模块不使用固定高度，按内容撑开；同一行通过 grid stretch 保持底部对齐 */
.basic-unified-grid > .basic-preferences-card,
.basic-unified-grid > .basic-notify-card {
  height: auto;
  min-height: 0;
  align-self: stretch;
}

.basic-api-card {
  order: 5;
  grid-column: 1 / -1;
}

.basic-model-card .slider-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.basic-model-card .slider-head strong {
  font-size: 12px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(79, 149, 255, 0.2);
  border: 1px solid rgba(79, 149, 255, 0.35);
  color: var(--text);
}

.basic-api-card .ip-input-row input {
  min-width: 0;
}

.basic-api-card .action-btn.primary {
  min-width: 100px;
}

.basic-label-card .checkbox-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 4px;
  overflow: auto;
  padding-right: 4px;
  align-content: start;
  flex: 1;
}

.basic-label-card .toggle-card {
  min-height: 46px;
  border-radius: 12px;
  border: 1px solid rgba(163, 205, 255, 0.28);
  background: linear-gradient(135deg, rgba(25, 54, 94, 0.45), rgba(13, 32, 61, 0.55));
  font-weight: 600;
  font-size: 14px;
  line-height: 1.25;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px 10px;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  transition: transform 0.16s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.basic-label-card .toggle-card:hover {
  transform: translateY(-1px);
  border-color: rgba(124, 191, 255, 0.5);
  box-shadow: 0 8px 18px rgba(11, 30, 58, 0.35);
}

.basic-label-card .toggle-card.active {
  border-color: rgba(112, 187, 255, 0.8);
  background: linear-gradient(135deg, rgba(50, 105, 185, 0.45), rgba(32, 78, 150, 0.45));
  box-shadow: 0 0 0 1px rgba(112, 187, 255, 0.2), 0 10px 22px rgba(16, 46, 86, 0.42);
}

.basic-notify-card .switch-list {
  margin-top: 4px;
  flex: 1;
}

.panel {
  background: rgba(255, 255, 255, 0.03); /* Slightly lighter background */
  border-radius: 12px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.full-width-panel {
  width: 100%;
}

.split-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-item small {
  color: var(--muted);
  font-size: 12px;
}

.ip-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ip-input-row input {
  flex: 1;
  min-width: 0;
}

.address-manager-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.address-manager {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 8px;
}

.address-manager h4 {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  font-weight: 600;
}

.address-list {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.address-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.address-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Switches */
.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.switch-row:last-child {
  border-bottom: none;
}

.switch-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.switch-info small {
  color: var(--muted);
  font-size: 12px;
}

/* Custom Switch */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.1);
  transition: 0.4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--primary);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

/* Device List */
.device-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-bottom: 8px;
}

.dev-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.dev-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.dev-info small {
  color: var(--muted);
  font-size: 12px;
}

/* Action Buttons */
.action-btn.sm {
  padding: 6px 12px;
  font-size: 12px;
}
.action-btn.danger {
  background: rgba(255, 123, 123, 0.15);
  color: var(--danger);
}
.action-btn.danger:hover {
  background: rgba(255, 123, 123, 0.25);
}
.action-btn.warning {
  background: rgba(246, 207, 104, 0.15);
  color: var(--warning);
}
.action-btn.warning:hover {
  background: rgba(246, 207, 104, 0.25);
}

/* Export Actions */
.export-actions {
  display: flex;
  gap: 12px;
}

.account-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.info-card {
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-card span {
  color: var(--muted);
  font-size: 12px;
}

/* Maintenance */
.maintenance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.m-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.m-info small {
  color: var(--muted);
  font-size: 12px;
}

/* Log Viewer */
.log-viewer {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sys-log-row {
  display: flex;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  padding-bottom: 4px;
}

.sys-log-empty {
  color: var(--muted);
  padding: 6px 0;
}

.log-ts {
  color: var(--muted);
}
.log-lvl {
  font-weight: bold;
  width: 60px;
}
.log-lvl.info {
  color: var(--text);
}
.log-lvl.warning {
  color: var(--warning);
}
.log-lvl.error {
  color: var(--danger);
}
.log-lvl.success {
  color: var(--success);
}

/* Animation */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-in {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1320px) {
  .basic-unified-grid {
    grid-template-columns: 1fr;
  }

  .basic-unified-grid > .panel {
    height: auto;
    min-height: 280px;
  }

  .basic-label-card .checkbox-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .address-manager-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .basic-unified-grid > .panel {
    min-height: 260px;
  }

  .basic-label-card .checkbox-grid {
    grid-template-columns: 1fr;
  }

  .help-feature-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .settings-layout {
    grid-template-columns: 1fr; /* Stack */
    height: auto;
    overflow: visible;
  }

  .settings-sidebar {
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
  }

  .nav-btn {
    width: auto;
    white-space: nowrap;
  }

  .sidebar-footer {
    display: none;
  }
}

/* Light theme overrides */
[data-theme="light"] .settings-sidebar {
  background: rgba(0, 0, 0, 0.02);
  border-right-color: var(--line);
}
[data-theme="light"] .nav-btn:hover {
  background: rgba(0, 0, 0, 0.04);
}
[data-theme="light"] .nav-btn.active {
  background: rgba(59, 125, 224, 0.1);
}
[data-theme="light"] .sidebar-footer {
  border-top-color: rgba(0, 0, 0, 0.06);
}
[data-theme="light"] .version-tag {
  background: rgba(0, 0, 0, 0.04);
}
[data-theme="light"] .settings-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}
[data-theme="light"] .reset-btn {
  border-color: rgba(0, 0, 0, 0.15);
}
[data-theme="light"] .panel {
  background: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.06);
}
[data-theme="light"] .switch-row {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}
[data-theme="light"] .slider {
  background-color: rgba(0, 0, 0, 0.12);
}
[data-theme="light"] .device-item,
[data-theme="light"] .info-card {
  background: rgba(0, 0, 0, 0.02);
}
[data-theme="light"] .dev-icon {
  background: rgba(0, 0, 0, 0.04);
}
[data-theme="light"] .log-viewer {
  background: rgba(0, 0, 0, 0.03);
}
[data-theme="light"] .sys-log-row {
  border-bottom-color: rgba(0, 0, 0, 0.04);
}
</style>
