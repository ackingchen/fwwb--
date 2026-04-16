<script setup>
import { ref, computed, onActivated, onDeactivated, onUnmounted, watch } from 'vue';
import { useDataStore } from '../stores/useDataStore';
import { useConfigStore } from '../stores/useConfigStore';
import { storeToRefs } from 'pinia';

const dataStore = useDataStore();
const configStore = useConfigStore();

const { tasks } = storeToRefs(dataStore);
const { selectedTaskId, httpBase } = storeToRefs(configStore);

const TASKS_POLL_INTERVAL = 3000;
let tasksTimer = null;
let tasksFetching = false;
const tasksLoading = ref(false);
const tasksError = ref('');

function normalizeTaskStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['running', 'run', 'processing', 'in_progress', 'active', '执行中', '运行中'].includes(raw)) {
    return 'running';
  }
  if (['finished', 'done', 'completed', 'success', 'stopped', '结束', '已结束', '完成'].includes(raw)) {
    return 'finished';
  }
  if (['pending', 'queued', 'waiting', 'created', '待启动', '待执行'].includes(raw)) {
    return 'pending';
  }
  return raw || 'pending';
}

function normalizeTasksPayload(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.result)
        ? payload.result
        : [];

  return list.map((item, index) => ({
    id: String(item.id ?? item.taskId ?? item.task_id ?? `task-${index + 1}`),
    name: item.name ?? item.taskName ?? item.task_name ?? '未命名任务',
    scene: item.scene ?? item.sceneName ?? item.scenario ?? '--',
    source: item.source ?? item.inputSource ?? item.input ?? '--',
    createdAt: item.createdAt ?? item.createTime ?? item.created_at ?? '--',
    targetCount: Number(item.targetCount ?? item.objectCount ?? item.targets ?? 0) || 0,
    status: normalizeTaskStatus(item.status ?? item.state ?? item.taskStatus),
  }));
}

async function fetchTasksFromBackend({ silent = false } = {}) {
  if (tasksFetching) return;
  tasksFetching = true;
  if (!silent) tasksLoading.value = true;
  tasksError.value = '';

  try {
    const response = await fetch(`${httpBase.value}/detections/tasks`);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `HTTP ${response.status}`);
    }
    const payload = await response.json();
    const normalizedTasks = normalizeTasksPayload(payload);
    tasks.value = normalizedTasks;

    if (!tasks.value.length) {
      selectedTaskId.value = '';
      return;
    }
    if (!tasks.value.some((task) => task.id === selectedTaskId.value)) {
      selectedTaskId.value = tasks.value[0].id;
    }
  } catch (error) {
    tasksError.value = error.message || '任务数据拉取失败';
  } finally {
    tasksFetching = false;
    tasksLoading.value = false;
  }
}

function startTasksPolling() {
  if (tasksTimer) return;
  fetchTasksFromBackend();
  tasksTimer = setInterval(() => fetchTasksFromBackend({ silent: true }), TASKS_POLL_INTERVAL);
}

function stopTasksPolling() {
  if (!tasksTimer) return;
  clearInterval(tasksTimer);
  tasksTimer = null;
}

watch(httpBase, () => {
  fetchTasksFromBackend();
});

// 搜索
const searchQuery = ref('');

// 分页
const currentPage = ref(1);
const pageSize = ref(10);

// 添加任务弹窗
const showAddDialog = ref(false);
const newTaskName = ref('');
const newTaskScene = ref('');
const newTaskSource = ref('');
const sceneOptions = ['城市', '山地', '农田', '水域', '森林', '沙漠', '港口', '高速公路'];

// 过滤后的任务
const filteredTasks = computed(() => {
  if (!searchQuery.value.trim()) return tasks.value;
  const q = searchQuery.value.trim().toLowerCase();
  return tasks.value.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.scene.toLowerCase().includes(q) ||
      t.source.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
  );
});

// 总页数
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredTasks.value.length / pageSize.value))
);

// 当前页数据
const pagedTasks = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredTasks.value.slice(start, start + pageSize.value);
});

// 页码列表（最多显示5个页码）
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  const pages = [];
  let start = Math.max(1, current - 2);
  let end = Math.min(total, start + 4);
  start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
});

function goToPage(page) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
  }
}

function onSearch() {
  currentPage.value = 1;
}

function selectTask(id) {
  selectedTaskId.value = id;
}

// 生成任务ID
function generateTaskId() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(tasks.value.length + 1).padStart(2, '0');
  return `T-${y}${m}${d}-${seq}`;
}

// 格式化当前时间
function formatNow() {
  const now = new Date();
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${M}-${d} ${h}:${m}`;
}

// 打开添加弹窗
function openAddDialog() {
  newTaskName.value = '';
  newTaskScene.value = '';
  newTaskSource.value = '';
  showAddDialog.value = true;
}

// 确认添加任务
function confirmAddTask() {
  if (!newTaskName.value.trim() || !newTaskScene.value || !newTaskSource.value.trim()) return;
  const newTask = {
    id: generateTaskId(),
    name: newTaskName.value.trim(),
    scene: newTaskScene.value,
    source: newTaskSource.value.trim(),
    createdAt: formatNow(),
    targetCount: 0,
    status: 'pending',
  };
  tasks.value.unshift(newTask);
  showAddDialog.value = false;
  currentPage.value = 1;
}

// 切换任务状态
function toggleStatus(task, e) {
  e.stopPropagation();
  showStatusMenu.value = showStatusMenu.value === task.id ? null : task.id;
}

const showStatusMenu = ref(null);

function setStatus(task, status, e) {
  e.stopPropagation();
  if (status === 'running') {
    // 最多只能有一个 running
    tasks.value.forEach((t) => {
      if (t.status === 'running') t.status = 'finished';
    });
  }
  task.status = status;
  showStatusMenu.value = null;
}

// 点击其他地方关闭状态菜单
function closeStatusMenu() {
  showStatusMenu.value = null;
}

// 刷新（重置搜索和分页）
function refreshTasks() {
  searchQuery.value = '';
  currentPage.value = 1;
  fetchTasksFromBackend();
}

// 状态显示映射
const statusLabel = {
  running: '运行中',
  finished: '已结束',
  pending: '待启动',
};
onActivated(() => {
  startTasksPolling();
});

onDeactivated(() => {
  stopTasksPolling();
});

onUnmounted(() => {
  stopTasksPolling();
});
</script>

<template>
  <section class="panel tasks-panel" @click="closeStatusMenu">
    <div class="panel-header">
      <h3>历史任务</h3>
      <div class="header-actions">
        <span class="pill" v-if="tasksLoading">同步中...</span>
        <span class="pill danger" v-if="tasksError">{{ tasksError }}</span>
        <span class="pill">共 {{ filteredTasks.length }} 条</span>
        <button class="action-btn" @click="refreshTasks" title="刷新">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
        <button class="action-btn primary" @click="openAddDialog">+ 新建任务</button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="tasks-toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          v-model="searchQuery"
          placeholder="搜索任务名称、场景、来源..."
          @input="onSearch"
        />
      </div>
      <div class="page-size-select">
        <label>每页</label>
        <select v-model.number="pageSize" @change="currentPage = 1">
          <option :value="5">5</option>
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
        <label>条</label>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>任务名称</th>
            <th>场景</th>
            <th>输入源</th>
            <th>时间</th>
            <th>目标数</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in pagedTasks"
            :key="task.id"
            :class="{ selected: task.id === selectedTaskId }"
            @click="selectTask(task.id)"
          >
            <td>{{ task.name }}</td>
            <td>{{ task.scene }}</td>
            <td>{{ task.source }}</td>
            <td>{{ task.createdAt }}</td>
            <td>{{ task.targetCount }}</td>
            <td class="status-cell">
              <div class="status-wrapper" @click="toggleStatus(task, $event)">
                <span :class="['pill', task.status]">{{ statusLabel[task.status] || task.status }}</span>
                <svg class="status-arrow" viewBox="0 0 12 12" width="10" height="10">
                  <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/>
                </svg>
                <!-- 状态下拉菜单 -->
                <div class="status-dropdown" v-if="showStatusMenu === task.id" @click.stop>
                  <div
                    class="status-option running"
                    :class="{ current: task.status === 'running' }"
                    @click="setStatus(task, 'running', $event)"
                  >运行中</div>
                  <div
                    class="status-option finished"
                    :class="{ current: task.status === 'finished' }"
                    @click="setStatus(task, 'finished', $event)"
                  >已结束</div>
                </div>
              </div>
            </td>
          </tr>
          <tr v-if="pagedTasks.length === 0">
            <td colspan="6" class="empty-row">暂无匹配的任务记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页控件 -->
    <div class="pagination" v-if="totalPages > 1">
      <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(1)">«</button>
      <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">‹</button>
      <button
        v-for="p in pageNumbers"
        :key="p"
        class="page-btn"
        :class="{ active: p === currentPage }"
        @click="goToPage(p)"
      >{{ p }}</button>
      <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">›</button>
      <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">»</button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
    </div>

    <!-- 添加任务弹窗 -->
    <teleport to="body">
      <transition name="fade">
        <div class="dialog-overlay" v-if="showAddDialog" @click.self="showAddDialog = false">
          <div class="dialog">
            <div class="dialog-header">
              <h4>新建任务</h4>
              <button class="dialog-close" @click="showAddDialog = false">&times;</button>
            </div>
            <div class="dialog-body">
              <label class="form-field">
                <span>任务名称</span>
                <input type="text" v-model="newTaskName" placeholder="输入任务名称" @keyup.enter="confirmAddTask" />
              </label>
              <label class="form-field">
                <span>场景</span>
                <select v-model="newTaskScene">
                  <option value="" disabled>请选择场景</option>
                  <option v-for="s in sceneOptions" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <div class="form-field">
                <span>创建时间</span>
                <div class="auto-time">自动设置为当前时间</div>
              </div>
              <div class="form-field">
                <span>输入源</span>
                <input
                  type="text"
                  v-model="newTaskSource"
                  placeholder="请输入输入源名称"
                />
              </div>
            </div>
            <div class="dialog-footer">
              <button class="action-btn" @click="showAddDialog = false">取消</button>
              <button
                class="action-btn primary"
                :disabled="!newTaskName.trim() || !newTaskScene || !newTaskSource.trim()"
                @click="confirmAddTask"
              >确认创建</button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </section>
</template>

<style scoped>
.tasks-panel {
  --card: var(--bg-panel);
  --border: var(--line);
  --text-dim: var(--muted);
}

.tasks-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.action-btn.primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.action-btn.primary:hover {
  opacity: 0.85;
}

.action-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 360px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  transition: border-color 0.2s;
}

.search-box:focus-within {
  border-color: var(--primary);
}

.search-box svg {
  color: var(--text-dim);
  flex-shrink: 0;
}

.search-box input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
}

.search-box input::placeholder {
  color: var(--text-dim);
}

.page-size-select {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-dim);
}

.page-size-select select {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
  cursor: pointer;
}

.page-size-select select option {
  background: #1e1e2e;
  color: #e0e0e0;
}

.empty-row {
  text-align: center;
  color: var(--text-dim);
  padding: 32px 0 !important;
  font-size: 14px;
}

/* 状态单元格 */
.status-cell {
  position: relative;
}

.status-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  position: relative;
}

.status-arrow {
  color: var(--text-dim);
  transition: transform 0.2s;
}

.status-wrapper:hover .status-arrow {
  color: var(--primary);
}

.status-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 100;
  min-width: 110px;
  overflow: hidden;
  backdrop-filter: blur(12px);
}

.status-option {
  padding: 9px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  color: #ccc;
}

.status-option:hover {
  background: rgba(79, 149, 255, 0.15);
}

.status-option.current {
  font-weight: 600;
}

.status-option.running,
.status-option.current.running {
  color: var(--cyan, #00d4ff);
}

.status-option.finished,
.status-option.current.finished {
  color: #aaa;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.page-btn {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled):not(.active) {
  border-color: var(--primary);
  color: var(--primary);
}

.page-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  margin-left: 12px;
  font-size: 13px;
  color: var(--text-dim);
}

/* 弹窗 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg, rgba(3, 14, 30, 0.75));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.dialog-header h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.dialog-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.dialog-close:hover {
  color: var(--text);
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field span {
  font-size: 13px;
  color: var(--text-dim);
  font-weight: 500;
}

.form-field input,
.form-field select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-field input:focus,
.form-field select:focus {
  border-color: var(--primary);
}

.form-field select option {
  background: #1e1e2e;
  color: #e0e0e0;
}

.auto-time {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-dim);
  font-size: 13px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
