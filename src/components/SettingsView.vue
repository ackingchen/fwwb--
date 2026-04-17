<script setup>
import { useConfigStore } from "../stores/useConfigStore";
import { storeToRefs } from "pinia";
import { ref, watch, onActivated, onDeactivated, onUnmounted } from "vue";

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
  httpBase,
} = storeToRefs(configStore);

// Backend IP editing
const ipInput = ref(backendIp.value);
const ipSaved = ref(false);
const saveBackendIp = () => {
  const trimmed = ipInput.value.trim();
  if (!trimmed) return;
  configStore.setBackendIp(trimmed);
  ipSaved.value = true;
  setTimeout(() => { ipSaved.value = false; }, 1500);
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
const activeTab = ref("detection");
const isSaving = ref(false);
const showSaveSuccess = ref(false);
const showSaveError = ref(false);

const loginHistory = ref([]);
const deviceList = ref([]);
const systemLogs = ref([]);

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
  { key: "detection", label: "模型与检测", icon: "模" },
  { key: "preferences", label: "系统偏好", icon: "偏" },
  { key: "security", label: "安全与隐私", icon: "安" },
  { key: "advanced", label: "高级选项", icon: "高" },
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

// Security Actions
function revokeDevice(id) {
  if (confirm("确定要强制下线该设备吗？")) {
    deviceList.value = deviceList.value.filter((dev) => dev.id !== id);
    alert("设备已下线");
  }
}

function exportData(type) {
  triggerSave(); // Just to show interaction
  alert(`正在导出 ${type === "config" ? "系统配置" : "运行日志"}...`);
}

function clearCache() {
  if (confirm("确定要清理系统缓存吗？这将重新加载应用。")) {
    alert("缓存清理完成");
    window.location.reload();
  }
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

onActivated(() => {
  if (activeTab.value === "advanced") {
    startLogPolling();
  }
});

onDeactivated(() => {
  stopLogPolling();
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
      <nav class="settings-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['nav-btn', { active: activeTab === tab.key }]"
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
        v-if="activeTab === 'detection'"
        class="settings-section fade-in full-width-grid"
      >
        <div class="panel">
          <div class="panel-header"><h3>推理模型</h3></div>
          <div class="form-grid">
            <label class="form-item">
              <span>模型版本</span>
              <select v-model="selectedModel" @change="triggerSave">
                <option>YOLOv11-lite</option>
                <option>RT-DETR-mini</option>
                <option>Edge-Transformer</option>
              </select>
              <small>建议使用 YOLOv11-lite 以获得最佳实时性</small>
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

        <div class="panel">
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

        <div class="panel">
          <div class="panel-header">
            <h3>后端 API 地址</h3>
            <transition name="fade">
              <span v-if="ipSaved" class="status-msg success">已保存</span>
            </transition>
          </div>
          <div class="form-grid">
            <label class="form-item">
              <span>服务器地址</span>
              <div class="ip-input-row">
                <input
                  type="text"
                  v-model="ipInput"
                  placeholder="如: 10.21.204.210:8080"
                  @keyup.enter="saveBackendIp"
                />
                <button class="action-btn primary" @click="saveBackendIp" style="white-space: nowrap;">
                  保存
                </button>
              </div>
              <small>格式: IP:端口，修改后所有后端请求将使用新地址，并保存到浏览器本地存储</small>
            </label>
          </div>
        </div>
      </section>

      <!-- Tab: Preferences -->
      <section
        v-if="activeTab === 'preferences'"
        class="settings-section fade-in full-width-grid"
      >
        <div class="panel">
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

        <div class="panel">
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
      </section>

      <!-- Tab: Security -->
      <section v-if="activeTab === 'security'" class="settings-section fade-in">
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

        <div class="split-row">
          <div class="panel">
            <div class="panel-header"><h3>设备管理</h3></div>
            <div class="device-list">
              <div v-for="dev in deviceList" :key="dev.id" class="device-item">
                <div class="dev-icon">
                  {{ dev.type === "Mobile" ? "📱" : "💻" }}
                </div>
                <div class="dev-info">
                  <strong>{{ dev.name }}</strong>
                  <small>最后活跃: {{ dev.lastActive }}</small>
                </div>
                <button
                  class="action-btn sm danger"
                  @click="revokeDevice(dev.id)"
                >
                  下线
                </button>
              </div>
              <div v-if="deviceList.length === 0" class="sys-log-empty">--</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><h3>数据导出</h3></div>
            <div class="export-actions">
              <button class="action-btn primary" @click="exportData('config')">
                导出系统配置 (JSON)
              </button>
              <button class="action-btn" @click="exportData('logs')">
                导出运行日志 (CSV)
              </button>
            </div>
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

/* Full Width Grid Layout for Sections */
.full-width-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 18px;
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
