<script setup>
import { useConfigStore } from "../stores/useConfigStore";
import { useDataStore } from "../stores/useDataStore";
import { storeToRefs } from "pinia";
import { ref } from "vue";

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
const alertLevelFilter = ref(["danger", "warning"]);

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

function toggleLabel(key) {
  const next = enabledLabels.value.includes(key)
    ? enabledLabels.value.filter((item) => item !== key)
    : [...enabledLabels.value, key];
  enabledLabels.value = next;
}

function toggleAlertFilter(level) {
  const next = alertLevelFilter.value.includes(level)
    ? alertLevelFilter.value.filter((l) => l !== level)
    : [...alertLevelFilter.value, level];
  alertLevelFilter.value = next;
}
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

          <div class="video-stage board-style">
            <div class="grid-overlay"></div>
            <div class="scanline"></div>
            <div class="corner corner-tl"></div>
            <div class="corner corner-tr"></div>
            <div class="corner corner-bl"></div>
            <div class="corner corner-br"></div>

            <div
              v-for="item in detections"
              :key="item.id"
              :class="['bbox', item.level]"
              :style="{
                left: `${item.bbox[0]}%`,
                top: `${item.bbox[1]}%`,
                width: `${item.bbox[2]}%`,
                height: `${item.bbox[3]}%`,
              }"
            >
              <span>{{ item.label }} {{ Math.round(item.score * 100) }}%</span>
            </div>

            <div class="video-info-tag">
              无人机视角 | 1920x1080 | {{ summary.latency }}ms
            </div>
          </div>

          <!-- Integrated Lower Grid (Alerts/Stats) inside Video Section -->
          <div class="video-lower-grid">
            <div class="subpanel">
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

            <div class="subpanel">
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

            <div class="subpanel">
              <div class="subpanel-title">目标统计</div>
              <div class="mini-bars">
                <div
                  v-for="item in series.classes"
                  :key="`${item.name}-mini`"
                  class="mini-bar-row"
                >
                  <span>{{ item.name }}</span>
                  <div class="mini-bar-track">
                    <div
                      class="mini-bar-fill"
                      :style="{ width: `${item.value}%` }"
                    ></div>
                  </div>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Functional Control Area (35%) -->
      <div class="control-section">
        <!-- Module 1: System Control & Status -->
        <div class="dashboard-card control-module">
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
        <div class="dashboard-card filter-module">
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

        <!-- Module 3: Alert Level Filter -->
        <div class="dashboard-card alert-filter-module">
          <div class="module-header">
            <h4>告警级别过滤</h4>
          </div>
          <div class="filter-chips">
            <button
              v-for="level in ['danger', 'warning', 'normal']"
              :key="level"
              :class="[
                'chip',
                level,
                { active: alertLevelFilter.includes(level) },
              ]"
              @click="toggleAlertFilter(level)"
            >
              {{ levelText[level] }}
            </button>
          </div>
        </div>

        <!-- Module 4: Time Range (Upgraded) -->
        <div class="dashboard-card time-module">
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
        <div class="dashboard-card quick-module">
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

        <!-- Module 6: Device Status (New) -->
        <div class="dashboard-card device-module">
          <div class="module-header">
            <h4>设备状态</h4>
          </div>
          <div class="device-stats">
            <div class="device-row">
              <span class="icon">🔋</span>
              <div class="progress-wrap">
                <div class="label-row">
                  <span>电量</span>
                  <strong>82%</strong>
                </div>
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    style="width: 82%; background: #41d98f"
                  ></div>
                </div>
              </div>
            </div>
            <div class="device-row">
              <span class="icon">📡</span>
              <div class="progress-wrap">
                <div class="label-row">
                  <span>信号</span>
                  <strong>强</strong>
                </div>
                <div class="signal-bars">
                  <span class="bar active"></span>
                  <span class="bar active"></span>
                  <span class="bar active"></span>
                  <span class="bar"></span>
                </div>
              </div>
            </div>
            <div class="device-row">
              <span class="icon">💾</span>
              <div class="progress-wrap">
                <div class="label-row">
                  <span>存储</span>
                  <strong>128GB / 512GB</strong>
                </div>
                <div class="progress-track">
                  <div
                    class="progress-fill"
                    style="width: 25%; background: #61d9e8"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Module 7: System Resource Monitor (New - Replaced Detection Log) -->
        <div class="dashboard-card resource-module">
          <div class="module-header">
            <h4>系统资源监控</h4>
            <div class="status-indicator">
              <span class="temp-badge">{{ resources.temp }}°C</span>
            </div>
          </div>
          <div class="resource-grid">
            <div class="resource-item">
              <div class="res-label">
                <span>CPU</span>
                <strong>{{ resources.cpu }}%</strong>
              </div>
              <div class="res-track">
                <div
                  class="res-fill cpu"
                  :style="{ width: `${resources.cpu}%` }"
                ></div>
              </div>
            </div>
            <div class="resource-item">
              <div class="res-label">
                <span>GPU</span>
                <strong>{{ resources.gpu }}%</strong>
              </div>
              <div class="res-track">
                <div
                  class="res-fill gpu"
                  :style="{ width: `${resources.gpu}%` }"
                ></div>
              </div>
            </div>
            <div class="resource-item">
              <div class="res-label">
                <span>内存</span>
                <strong>{{ resources.memory }}%</strong>
              </div>
              <div class="res-track">
                <div
                  class="res-fill mem"
                  :style="{ width: `${resources.memory}%` }"
                ></div>
              </div>
            </div>
            <div class="net-stats">
              <div class="net-row">
                <span>↑ 上行</span>
                <strong>{{ resources.network.up }}</strong>
              </div>
              <div class="net-row">
                <span>↓ 下行</span>
                <strong>{{ resources.network.down }}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Auxiliary Info Area (New) -->
      <div class="auxiliary-section">
        <!-- Module A: Environment -->
        <div class="dashboard-card aux-module">
          <div class="module-header">
            <h4>环境感知</h4>
            <div class="status-indicator">
              <span class="led running"></span> 实时
            </div>
          </div>
          <div class="env-grid">
            <div class="env-item">
              <span class="env-icon">🌬️</span>
              <div class="env-data">
                <strong>3.2 m/s</strong>
                <small>西北风</small>
              </div>
            </div>
            <div class="env-item">
              <span class="env-icon">🌡️</span>
              <div class="env-data">
                <strong>24°C</strong>
                <small>湿度 45%</small>
              </div>
            </div>
            <div class="env-item">
              <span class="env-icon">🏔️</span>
              <div class="env-data">
                <strong>128m</strong>
                <small>海拔高度</small>
              </div>
            </div>
            <div class="env-item">
              <span class="env-icon">☀️</span>
              <div class="env-data">
                <strong>良</strong>
                <small>能见度</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Module B: Flight Trajectory (Mini Map) -->
        <div class="dashboard-card aux-module map-module">
          <div class="module-header">
            <h4>飞行轨迹</h4>
          </div>
          <div class="mini-map">
            <!-- Mock Map Visualization -->
            <div class="map-path"></div>
            <div class="map-drone"></div>
            <div class="map-grid-lines"></div>
            <div class="map-labels">
              <span>N: 34.21°</span>
              <span>E: 108.93°</span>
            </div>
          </div>
        </div>

        <!-- Module C: System Log -->
        <div class="dashboard-card aux-module log-module">
          <div class="module-header">
            <h4>系统日志</h4>
            <button class="icon-btn" title="清空">🗑️</button>
          </div>
          <div class="log-list">
            <div class="log-item">
              <span class="log-time">14:32:05</span>
              <span class="log-content info">系统自检完成，各项指标正常</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:31:08</span>
              <span class="log-content warning">检测到异常车辆 (ID: 002)</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:30:45</span>
              <span class="log-content success">无人机连接建立成功</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:30:10</span>
              <span class="log-content info">加载模型: YOLOv8-Nano</span>
            </div>
            <div class="log-item">
              <span class="log-time">14:30:00</span>
              <span class="log-content info">系统初始化...</span>
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
