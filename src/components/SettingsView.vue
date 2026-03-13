<script setup>
import { useConfigStore } from "../stores/useConfigStore";
import { storeToRefs } from "pinia";
import { ref, reactive, computed } from "vue";
import { loginHistory, deviceList, systemLogs } from "../mock/data";

const configStore = useConfigStore();
const {
  confidence,
  iou,
  selectedModel,
  enabledLabels,
  language,
  autoUpdate,
  notifications,
} = storeToRefs(configStore);

// Mock System Info
const systemInfo = {
  version: "2.4.0-beta",
  build: "20260310-RC1",
  os: "Ubuntu 24.04 LTS",
  kernel: "6.8.0-generic",
  uptime: "3d 14h 22m",
};

// UI State
const activeTab = ref("detection");
const isSaving = ref(false);
const showSaveSuccess = ref(false);
const showSaveError = ref(false);

const tabs = [
  { key: "detection", label: "模型与检测", icon: "🎯" },
  { key: "preferences", label: "系统偏好", icon: "⚙️" },
  { key: "security", label: "安全与隐私", icon: "🔒" },
  { key: "advanced", label: "高级选项", icon: "🛠️" },
];

const detectionOptions = [
  { key: "person", label: "人员" },
  { key: "vehicle", label: "车辆" },
  { key: "animal", label: "动物" },
  { key: "facility", label: "设施" },
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
    // Mock revoke
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
            <span v-if="showSaveSuccess" class="status-msg success"
              >✓ 已保存</span
            >
          </transition>
          <transition name="fade">
            <span v-if="isSaving" class="status-msg saving">⟳ 保存中...</span>
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
          <div class="panel-header"><h3>系统日志</h3></div>
          <div class="log-viewer">
            <div v-for="log in systemLogs" :key="log.id" class="sys-log-row">
              <span class="log-ts">{{ log.time }}</span>
              <span :class="['log-lvl', log.level]">{{
                log.level.toUpperCase()
              }}</span>
              <span class="log-msg">{{ log.message }}</span>
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

.status-msg {
  font-size: 13px;
}

.status-msg.success {
  color: var(--success);
}
.status-msg.saving {
  color: var(--muted);
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
</style>
