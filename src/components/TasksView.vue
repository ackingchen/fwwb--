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
const useBackendPaging = ref(false);
const backendTotal = ref(0);
const backendPages = ref(1);

const TASK_TYPE_LABELS = {
  0: '图片',
  1: '视频',
  2: '实时流',
};
const SOURCE_TO_TASK_TYPE = {
  图片: 0,
  视频: 1,
  实时流: 2,
};
const DASHBOARD_TASK_SUMMARY_KEY = 'dashboard_task_summary';

function saveTaskSummaryToStorage({ taskName = '', taskType = '', scene = '' } = {}) {
  try {
    localStorage.setItem(
      DASHBOARD_TASK_SUMMARY_KEY,
      JSON.stringify({
        taskName: String(taskName).trim(),
        taskType: String(taskType).trim(),
        scene: String(scene).trim(),
      }),
    );
  } catch {
    // Ignore storage write failures
  }
}

function formatTaskTime(value) {
  if (value === null || value === undefined || value === '') return '--';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.replace('T', ' ');
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw.replace('T', ' ');
  }
  const y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${M}-${d} ${h}:${m}:${s}`;
}

function normalizeTaskStatus(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric === 1) return 'running';
    if (numeric === 2 || numeric === 3) return 'finished';
    if (numeric === 0) return 'pending';
  }
  const raw = String(value ?? '').trim().toLowerCase();
  if (['1', 'running', 'run', 'processing', 'in_progress', 'active', '执行中', '运行中'].includes(raw)) {
    return 'running';
  }
  if (['2', '3', 'finished', 'done', 'completed', 'success', 'stopped', '结束', '已结束', '完成'].includes(raw)) {
    return 'finished';
  }
  if (['0', 'pending', 'queued', 'waiting', 'created', '待启动', '待执行'].includes(raw)) {
    return 'pending';
  }
  return raw || 'pending';
}

function normalizeTextValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text && text !== '--' ? text : '';
}

function inferTaskTypeFromSource(sourceValue) {
  const source = String(sourceValue ?? '').trim().toLowerCase();
  if (!source) return null;

  if (
    source.startsWith('rtsp://') ||
    source.startsWith('rtmp://') ||
    source.startsWith('ws://') ||
    source.startsWith('wss://') ||
    source.includes('实时流') ||
    source.includes('stream') ||
    source.includes('camera') ||
    source.includes('live')
  ) {
    return 2;
  }

  if (
    source.includes('视频') ||
    source.includes('video') ||
    /\.(mp4|avi|mov|mkv|flv|wmv|mpeg|m4v)(\?|$)/.test(source)
  ) {
    return 1;
  }

  if (
    source.includes('图片') ||
    source.includes('image') ||
    source.startsWith('data:image/') ||
    /\.(jpg|jpeg|png|bmp|webp|gif|tif|tiff)(\?|$)/.test(source)
  ) {
    return 0;
  }

  return null;
}

function resolveTaskType(rawType, sourceValue = '', streamUrl = '', fallbackType = null, fallbackSource = '') {
  const numeric = Number(rawType);
  if (Number.isFinite(numeric) && [0, 1, 2].includes(numeric)) return numeric;
  if (numeric === 3) return 2;

  const raw = String(rawType ?? '').trim().toLowerCase();
  if (['0', 'image', 'img', 'picture', '图片'].includes(raw)) return 0;
  if (['1', 'video', '视频'].includes(raw)) return 1;
  if (['2', '3', 'stream', 'live', '实时流', 'rtsp'].includes(raw)) return 2;

  const fromStreamUrl = inferTaskTypeFromSource(streamUrl);
  if (fromStreamUrl !== null) return fromStreamUrl;

  const fromSource = inferTaskTypeFromSource(sourceValue);
  if (fromSource !== null) return fromSource;

  const fallbackNumeric = Number(fallbackType);
  if (Number.isFinite(fallbackNumeric) && [0, 1, 2].includes(fallbackNumeric)) return fallbackNumeric;
  if (fallbackNumeric === 3) return 2;

  const fromFallbackSource = inferTaskTypeFromSource(fallbackSource);
  if (fromFallbackSource !== null) return fromFallbackSource;

  return null;
}

function normalizeTaskRecord(item = {}, index = 0, fallback = null) {
  const taskId = String(
    item?.taskId ??
      item?.task_id ??
      fallback?.taskId ??
      item?.id ??
      fallback?.id ??
      `task-${index + 1}`,
  );
  const sourceCandidate =
    item?.source ??
    item?.streamUrl ??
    item?.inputSource ??
    item?.input ??
    item?.pictureName ??
    fallback?.pictureName ??
    fallback?.source ??
    '--';
  const sourceRaw = String(sourceCandidate).trim();
  const taskType = resolveTaskType(
    item?.taskType ?? item?.type ?? item?.task_type ?? item?.taskTypeLabel,
    sourceRaw,
    item?.streamUrl,
    fallback?.taskType ?? fallback?.taskTypeLabel,
    fallback?.source ?? fallback?.streamUrl,
  );
  const taskTimeRaw =
    item?.taskTime ?? item?.task_time ?? item?.runTime ?? fallback?.taskTime;
  const createdRaw = item?.createTime ?? item?.createdAt ?? item?.created_at;
  const taskTime =
    taskTimeRaw !== undefined &&
    taskTimeRaw !== null &&
    String(taskTimeRaw).trim() !== ''
      ? formatTaskTime(taskTimeRaw)
      : fallback?.taskTime ?? '--';
  const createdAt =
    createdRaw !== undefined &&
    createdRaw !== null &&
    String(createdRaw).trim() !== ''
      ? formatTaskTime(createdRaw)
      : fallback?.createdAt ?? '--';
  const statusRaw =
    item?.status ?? item?.state ?? item?.taskStatus ?? fallback?.status;
  const targetRaw =
    item?.totalCount ??
    item?.targetCount ??
    item?.objectCount ??
    item?.targets ??
    fallback?.targetCount ??
    0;
  const detectionMetrics =
    item?.detectionMetricsResult &&
    typeof item.detectionMetricsResult === 'object' &&
    !Array.isArray(item.detectionMetricsResult)
      ? item.detectionMetricsResult
      : fallback?.detectionMetrics ?? {};
  const beforeImageCandidate =
    item?.beforeImage ??
    item?.beforeImageUrl ??
    item?.originalImageUrl ??
    item?.originalImage ??
    item?.beforeDetectImage ??
    item?.beforeDetectImageUrl ??
    item?.inputImage ??
    item?.inputImageUrl ??
    item?.sourceImage ??
    item?.sourceImageUrl ??
    item?.originImage ??
    item?.originImageUrl ??
    item?.rawImage ??
    item?.rawImageUrl ??
    item?.pictureUrl ??
    fallback?.beforeImage ??
    fallback?.beforeImageUrl ??
    sourceRaw;
  const afterImageCandidate =
    item?.afterImage ??
    item?.afterImageUrl ??
    item?.afterDetectImage ??
    item?.afterDetectImageUrl ??
    item?.resultImage ??
    item?.resultImageUrl ??
    item?.detectedImage ??
    item?.detectedImageUrl ??
    item?.outputImage ??
    item?.outputImageUrl ??
    item?.renderImage ??
    item?.renderImageUrl ??
    item?.annotatedImage ??
    item?.annotatedImageUrl ??
    fallback?.afterImage ??
    fallback?.afterImageUrl;

  return {
    ...(fallback ?? {}),
    id: taskId,
    taskId,
    rawId: String(item?.id ?? fallback?.rawId ?? ''),
    name:
      item?.taskName ??
      item?.task_name ??
      item?.name ??
      fallback?.name ??
      '未命名任务',
    taskType,
    taskTypeLabel:
      TASK_TYPE_LABELS[taskType] ??
      (taskType === 0 ? '图片' : taskType === 1 ? '视频' : taskType === 2 ? '实时流' : fallback?.taskTypeLabel ?? '--'),
    scene: item?.scene ?? item?.sceneName ?? item?.scenario ?? fallback?.scene ?? '--',
    source: sourceRaw || '--',
    streamUrl: item?.streamUrl ?? fallback?.streamUrl,
    beforeImage: normalizeTextValue(beforeImageCandidate),
    afterImage: normalizeTextValue(afterImageCandidate),
    pictureName: item?.pictureName ?? fallback?.pictureName,
    width: item?.width ?? fallback?.width,
    height: item?.height ?? fallback?.height,
    confidence: item?.confidence ?? fallback?.confidence,
    taskTime,
    createdAt,
    targetCount: Number(targetRaw) || 0,
    status: normalizeTaskStatus(statusRaw),
    detectionMetrics,
    metricsPrecision: detectionMetrics?.precision ?? fallback?.metricsPrecision,
    metricsRecall: detectionMetrics?.recall ?? fallback?.metricsRecall,
    metricsF1Score: detectionMetrics?.f1Score ?? fallback?.metricsF1Score,
    metricsMap05: detectionMetrics?.map05 ?? fallback?.metricsMap05,
    metricsMap75: detectionMetrics?.map75 ?? fallback?.metricsMap75,
    metricsMap0595: detectionMetrics?.map0595 ?? fallback?.metricsMap0595,
    fps: item?.fps ?? item?.frameRate ?? detectionMetrics?.fps ?? fallback?.fps,
    processTime:
      item?.processTime ?? item?.process_time ?? item?.avgProcessTime ?? fallback?.processTime,
    delay: item?.delay ?? item?.networkDelay ?? item?.latency ?? fallback?.delay,
    allTime: item?.allTime ?? item?.totalTime ?? item?.duration ?? fallback?.allTime,
    latency:
      item?.latency ??
      item?.processTime ??
      item?.process_time ??
      detectionMetrics?.latency ??
      fallback?.latency,
    jitter: item?.jitter ?? item?.delay ?? detectionMetrics?.jitter ?? fallback?.jitter,
    throughput: item?.throughput ?? detectionMetrics?.throughput ?? fallback?.throughput,
    missRate: item?.missRate ?? detectionMetrics?.missRate ?? fallback?.missRate,
    metricsCreateTime:
      detectionMetrics?.createTime
        ? formatTaskTime(detectionMetrics.createTime)
        : fallback?.metricsCreateTime,
  };
}

function createMockSvgImage({
  toneA = '#203a57',
  toneB = '#0b2036',
  accent = '#40a9ff',
  highlight = '#f6ffed',
  dashed = '#ffd666',
} = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${toneA}"/>
        <stop offset="100%" stop-color="${toneB}"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)"/>
    <circle cx="210" cy="180" r="95" fill="${accent}" opacity="0.18"/>
    <circle cx="1080" cy="120" r="70" fill="${accent}" opacity="0.14"/>
    <rect x="110" y="420" width="320" height="180" rx="10" fill="${highlight}" opacity="0.1"/>
    <rect x="480" y="300" width="360" height="220" rx="12" fill="${highlight}" opacity="0.08"/>
    <rect x="890" y="360" width="260" height="160" rx="10" fill="${highlight}" opacity="0.08"/>
    <rect x="160" y="180" width="210" height="130" rx="8" fill="none" stroke="${dashed}" stroke-width="6" stroke-dasharray="16 10"/>
    <rect x="560" y="220" width="240" height="150" rx="8" fill="none" stroke="${dashed}" stroke-width="6" stroke-dasharray="14 8"/>
    <rect x="960" y="190" width="170" height="120" rx="8" fill="none" stroke="${dashed}" stroke-width="6" stroke-dasharray="12 8"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getHistoryImageTaskMocks() {
  const beforeCity = createMockSvgImage({
    toneA: '#24466a',
    toneB: '#10253c',
    accent: '#5fb3ff',
    highlight: '#e6f4ff',
    dashed: '#ffd666',
  });
  const afterCity = createMockSvgImage({
    toneA: '#21402f',
    toneB: '#10251c',
    accent: '#52c41a',
    highlight: '#f6ffed',
    dashed: '#95de64',
  });
  const beforePort = createMockSvgImage({
    toneA: '#3f2d66',
    toneB: '#1a1638',
    accent: '#b37feb',
    highlight: '#f9f0ff',
    dashed: '#ffc069',
  });
  const afterPort = createMockSvgImage({
    toneA: '#3a2611',
    toneB: '#1f1409',
    accent: '#ffa940',
    highlight: '#fff7e6',
    dashed: '#ffd591',
  });
  const beforeFarm = createMockSvgImage({
    toneA: '#35522a',
    toneB: '#172f11',
    accent: '#95de64',
    highlight: '#f6ffed',
    dashed: '#ffd666',
  });
  const afterFarm = createMockSvgImage({
    toneA: '#1f3f5b',
    toneB: '#102334',
    accent: '#36cfc9',
    highlight: '#e6fffb',
    dashed: '#5cdbd3',
  });

  const mockPayload = [
    {
      taskId: 'IMG-260417-01',
      taskName: '城区道路巡检-样例图',
      taskType: 0,
      scene: '城市',
      source: 'mock/city_road_01.jpg',
      taskTime: '2026-04-17 16:19:53',
      createTime: '2026-04-17 16:19:53',
      totalCount: 19,
      status: 1,
      pictureName: 'city_road_01.jpg',
      width: 1280,
      height: 720,
      confidence: 0.914,
      fps: 29.4,
      latency: 34.2,
      jitter: 3.9,
      throughput: 1058,
      missRate: 3.7,
      beforeImage: beforeCity,
      afterImage: afterCity,
      detectionMetricsResult: {
        precision: 0.915,
        recall: 0.882,
        f1Score: 0.898,
        map05: 0.921,
        map75: 0.864,
        map0595: 0.743,
        createTime: '2026-04-17 16:19:53',
      },
    },
    {
      taskId: 'IMG-260417-02',
      taskName: '港口堆场巡检-样例图',
      taskType: 0,
      scene: '港口',
      source: 'mock/port_stack_02.jpg',
      taskTime: '2026-04-17 16:13:27',
      createTime: '2026-04-17 16:13:27',
      totalCount: 12,
      status: 2,
      pictureName: 'port_stack_02.jpg',
      width: 1280,
      height: 720,
      confidence: 0.876,
      fps: 26.7,
      latency: 41.5,
      jitter: 5.8,
      throughput: 912,
      missRate: 5.9,
      beforeImage: beforePort,
      afterImage: afterPort,
      detectionMetricsResult: {
        precision: 0.884,
        recall: 0.836,
        f1Score: 0.859,
        map05: 0.892,
        map75: 0.842,
        map0595: 0.709,
        createTime: '2026-04-17 16:13:27',
      },
    },
    {
      taskId: 'IMG-260417-03',
      taskName: '农田目标识别-样例图',
      taskType: 0,
      scene: '农田',
      source: 'mock/farm_field_03.jpg',
      taskTime: '2026-04-17 16:07:11',
      createTime: '2026-04-17 16:07:11',
      totalCount: 27,
      status: 2,
      pictureName: 'farm_field_03.jpg',
      width: 1280,
      height: 720,
      confidence: 0.902,
      fps: 28.1,
      latency: 36.9,
      jitter: 4.3,
      throughput: 987,
      missRate: 4.5,
      beforeImage: beforeFarm,
      afterImage: afterFarm,
      detectionMetricsResult: {
        precision: 0.907,
        recall: 0.891,
        f1Score: 0.899,
        map05: 0.914,
        map75: 0.871,
        map0595: 0.758,
        createTime: '2026-04-17 16:07:11',
      },
    },
  ];

  return mockPayload.map((item, index) => normalizeTaskRecord(item, index));
}

function normalizeTasksPayload(payload) {
  const container =
    payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload;

  const list = Array.isArray(container)
    ? container
    : Array.isArray(container?.list)
      ? container.list
      : Array.isArray(container?.data)
        ? container.data
        : Array.isArray(container?.result)
          ? container.result
          : [];

  const metaTotal = Number(container?.total);
  const metaPageNum = Number(container?.pageNum ?? container?.page);
  const metaPageSize = Number(container?.pageSize ?? container?.size);
  const metaPages = Number(container?.pages);
  const backendPaged =
    Array.isArray(container?.list) ||
    Number.isFinite(metaPageNum) ||
    Number.isFinite(metaPages) ||
    Number.isFinite(metaTotal);

  const pageSizeValue = Number.isFinite(metaPageSize) && metaPageSize > 0 ? metaPageSize : pageSize.value;
  const totalValue = Number.isFinite(metaTotal) && metaTotal >= 0 ? metaTotal : list.length;
  const pagesValue =
    Number.isFinite(metaPages) && metaPages > 0
      ? metaPages
      : Math.max(1, Math.ceil(totalValue / pageSizeValue));

  const items = list.map((item, index) => normalizeTaskRecord(item, index));

  return {
    items,
    meta: {
      backendPaged,
      total: totalValue,
      pageNum: Number.isFinite(metaPageNum) && metaPageNum > 0 ? metaPageNum : 1,
      pageSize: pageSizeValue,
      pages: pagesValue,
    },
  };
}

async function fetchTasksFromBackend({
  silent = false,
  page = currentPage.value,
  size = pageSize.value,
} = {}) {
  if (tasksFetching) return;
  tasksFetching = true;
  if (!silent) tasksLoading.value = true;
  tasksError.value = '';

  try {
    const url = new URL(`${httpBase.value}/data/tasks`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(size));
    const response = await fetch(url.toString());
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `HTTP ${response.status}`);
    }
    const payload = await response.json();
    const code = payload?.code;
    if (code !== undefined && code !== 0 && code !== 200) {
      throw new Error(payload?.msg || `接口返回异常 (${code})`);
    }
    const normalized = normalizeTasksPayload(payload);
    tasks.value = normalized.items;
    useBackendPaging.value = normalized.meta.backendPaged;
    backendTotal.value = normalized.meta.total;
    backendPages.value = normalized.meta.pages;
    if (useBackendPaging.value) {
      currentPage.value = normalized.meta.pageNum;
      pageSize.value = normalized.meta.pageSize;
    }

    if (!tasks.value.length) {
      selectedTaskId.value = '';
      return;
    }
    if (!tasks.value.some((task) => task.id === selectedTaskId.value)) {
      selectedTaskId.value = tasks.value[0].id;
    }
  } catch (error) {
    const mockTasks = getHistoryImageTaskMocks();
    tasks.value = mockTasks;
    useBackendPaging.value = false;
    backendTotal.value = mockTasks.length;
    backendPages.value = 1;
    currentPage.value = 1;
    if (mockTasks.length && !mockTasks.some((task) => task.id === selectedTaskId.value)) {
      selectedTaskId.value = mockTasks[0].id;
    }
    const reason = error?.message ? `(${error.message})` : '';
    tasksError.value = `后端不可用，已展示本地图片Mock任务${reason}`;
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
  searchQuery.value = '';
  currentPage.value = 1;
  fetchTasksFromBackend({ page: 1, size: pageSize.value });
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
const sceneOptions = ['城市', '山地', '农田', '水域', '森林', '隧道', '港口', '高速公路'];
const sourceOptions = ['图片', '视频', '实时流'];
const showDetailDialog = ref(false);
const detailTask = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
const detailSourceTask = ref(null);

function buildImageDetailMock(task = {}) {
  const sampleSource = task.source ?? task.pictureName ?? 'dv_ir_00001.jpg';
  const metricsSource =
    task.detectionMetricsResult &&
    typeof task.detectionMetricsResult === 'object' &&
    !Array.isArray(task.detectionMetricsResult)
      ? task.detectionMetricsResult
      : task.detectionMetrics && typeof task.detectionMetrics === 'object'
        ? task.detectionMetrics
        : {};
  return {
    taskId: task.taskId ?? '0434e302-0b85-43cf-beb3-f6e9cebb4e5e',
    taskName: task.name ?? '图片检测任务-演示',
    taskType: 0,
    scene: task.scene ?? '城市道路',
    source: sampleSource,
    beforeImage: task.beforeImage ?? sampleSource,
    afterImage: task.afterImage ?? task.resultImage ?? sampleSource,
    taskTime: task.taskTime ?? task.createdAt ?? '2026-04-17T06:42:09.000+00:00',
    targetCount: task.targetCount ?? 24,
    pictureName: task.pictureName ?? 'dv_ir_00001.jpg',
    createTime: task.createdAt ?? '2026-04-17',
    width: task.width ?? 840,
    height: task.height ?? 712,
    confidence: task.confidence ?? 0.8134,
    fps: task.fps ?? 27.8,
    latency: task.latency ?? 36,
    jitter: task.jitter ?? 4.6,
    throughput: task.throughput ?? 946,
    missRate: task.missRate ?? 4.4,
    detectionMetricsResult: {
      precision: metricsSource.precision ?? task.metricsPrecision ?? 0.8642,
      recall: metricsSource.recall ?? task.metricsRecall ?? 1.0,
      f1Score: metricsSource.f1Score ?? task.metricsF1Score ?? 0.9263,
      map05: metricsSource.map05 ?? task.metricsMap05 ?? 0.9124,
      map75: metricsSource.map75 ?? task.metricsMap75 ?? 0.8786,
      map0595: metricsSource.map0595 ?? task.metricsMap0595 ?? 0.7321,
      createTime:
        metricsSource.createTime ??
        task.metricsCreateTime ??
        task.taskTime ??
        '2026-04-17T14:42:09',
    },
  };
}

// 过滤后的任务
const filteredTasks = computed(() => {
  if (!searchQuery.value.trim()) return tasks.value;
  const q = searchQuery.value.trim().toLowerCase();
  return tasks.value.filter(
    (t) =>
      String(t.name ?? '').toLowerCase().includes(q) ||
      String(t.taskId ?? '').toLowerCase().includes(q) ||
      String(t.taskTypeLabel ?? '').toLowerCase().includes(q) ||
      String(t.scene ?? '').toLowerCase().includes(q) ||
      String(t.source ?? '').toLowerCase().includes(q) ||
      String(t.id ?? '').toLowerCase().includes(q)
  );
});

// 总页数
const totalPages = computed(() =>
  useBackendPaging.value && !searchQuery.value.trim()
    ? Math.max(1, backendPages.value)
    : Math.max(1, Math.ceil(filteredTasks.value.length / pageSize.value))
);

const totalCount = computed(() =>
  useBackendPaging.value && !searchQuery.value.trim()
    ? backendTotal.value
    : filteredTasks.value.length
);

// 当前页数据
const pagedTasks = computed(() => {
  if (useBackendPaging.value && !searchQuery.value.trim()) {
    return filteredTasks.value;
  }
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
  if (page < 1 || page > totalPages.value) return;
  if (useBackendPaging.value && !searchQuery.value.trim()) {
    currentPage.value = page;
    fetchTasksFromBackend({ silent: true, page, size: pageSize.value });
    return;
  }
  currentPage.value = page;
}

function onSearch() {
  currentPage.value = 1;
}

function onPageSizeChange() {
  currentPage.value = 1;
  if (useBackendPaging.value && !searchQuery.value.trim()) {
    fetchTasksFromBackend({ page: 1, size: pageSize.value });
  }
}

function selectTask(id) {
  selectedTaskId.value = id;
}

function textOrDash(value) {
  if (value === null || value === undefined) return '--';
  const text = String(value).trim();
  return text || '--';
}

function percentOrDash(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '--';
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const percent = num <= 1 ? num * 100 : num;
  return `${percent.toFixed(digits).replace(/\.?0+$/, '')}%`;
}

function getStatusText(status) {
  return statusLabel[status] || textOrDash(status);
}

function numberOrDash(value, digits = 1, suffix = '') {
  if (value === null || value === undefined || value === '') return '--';
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return `${num.toFixed(digits).replace(/\.?0+$/, '')}${suffix}`;
}

function toPercentNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num <= 1 ? num * 100 : num;
}

function toneByScore(value, goodThreshold = 85) {
  const score = toPercentNumber(value);
  if (score === null) return 'neutral';
  return score >= goodThreshold ? 'good' : 'bad';
}

function toneByStatus(status) {
  if (status === 'running' || status === 'finished') return 'good';
  if (status === 'pending') return 'bad';
  return 'neutral';
}

function toneByHigherBetter(value, goodThreshold) {
  if (value === null || value === undefined || value === '') return 'neutral';
  const num = Number(value);
  if (!Number.isFinite(num)) return 'neutral';
  return num >= goodThreshold ? 'good' : 'bad';
}

function toneByLowerBetter(value, goodThreshold) {
  if (value === null || value === undefined || value === '') return 'neutral';
  const num = Number(value);
  if (!Number.isFinite(num)) return 'neutral';
  return num <= goodThreshold ? 'good' : 'bad';
}

function resolveImageUrl(value) {
  const raw = normalizeTextValue(value);
  if (!raw) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
  const normalizedPath = raw.replace(/\\/g, '/');
  try {
    return new URL(normalizedPath, `${httpBase.value}/`).toString();
  } catch {
    return '';
  }
}

const detailBeforeImageUrl = computed(() => {
  const t = detailTask.value;
  if (!t) return '';
  return resolveImageUrl(
    t.beforeImage ??
      t.beforeImageUrl ??
      t.sourceImage ??
      t.inputImage ??
      t.source ??
      t.pictureName,
  );
});

const detailAfterImageUrl = computed(() => {
  const t = detailTask.value;
  if (!t) return '';
  return resolveImageUrl(
    t.afterImage ??
      t.afterImageUrl ??
      t.resultImage ??
      t.detectedImage ??
      t.outputImage,
  );
});

const hasImageDetail = computed(() => {
  const t = detailTask.value;
  if (!t) return false;
  return (
    t.taskType === 0 ||
    t.pictureName !== undefined ||
    t.width !== undefined ||
    t.height !== undefined ||
    t.confidence !== undefined
  );
});

const detailMetaItems = computed(() => {
  const t = detailTask.value;
  if (!t) return [];
  const isStreamTask = Number(t.taskType) === 2;
  const items = [
    { label: '任务ID', value: textOrDash(t.taskId) },
    { label: '任务名称', value: textOrDash(t.name) },
    { label: '任务类型', value: textOrDash(t.taskTypeLabel) },
    { label: '场景', value: textOrDash(t.scene) },
    { label: '数据源', value: textOrDash(t.source) },
    { label: '检测时间', value: textOrDash(t.taskTime ?? t.createdAt) },
    { label: '创建时间', value: textOrDash(t.createdAt) },
    { label: '检测总数', value: textOrDash(t.targetCount), tone: Number(t.targetCount) > 0 ? 'good' : 'bad' },
    {
      label: '任务状态',
      value: getStatusText(t.status),
      tone: toneByStatus(t.status),
    },
  ];
  if (isStreamTask && t.streamUrl) {
    items.push({
      label: '流地址',
      value: textOrDash(t.streamUrl),
    });
  }
  if (hasImageDetail.value) {
    items.push(
      { label: '图片名称', value: textOrDash(t.pictureName) },
      {
        label: '分辨率',
        value:
          Number.isFinite(Number(t.width)) && Number.isFinite(Number(t.height))
            ? `${Number(t.width)} × ${Number(t.height)}`
            : '--',
      },
      {
        label: '置信度',
        value: percentOrDash(t.confidence, 2),
        tone: toneByScore(t.confidence, 85),
      },
    );
  }
  if (t.rawId) {
    items.push({
      label: '数据库ID',
      value: textOrDash(t.rawId),
    });
  }
  if (t.metricsCreateTime) {
    items.push({
      label: '指标时间',
      value: textOrDash(t.metricsCreateTime),
    });
  }
  return items;
});

const detailMetricCards = computed(() => {
  const t = detailTask.value;
  if (!t) return [];
  const isStreamTask = Number(t.taskType) === 2;
  const runtimeNum = Number(t.allTime);
  const targetNum = Number(t.targetCount);
  const derivedThroughput =
    Number.isFinite(runtimeNum) && runtimeNum > 0 && Number.isFinite(targetNum)
      ? (targetNum * 1000) / runtimeNum
      : null;
  if (isStreamTask) {
    return [
      {
        label: 'FPS',
        value: numberOrDash(t.fps, 1),
        desc: '实时推理帧率',
        tone: toneByHigherBetter(t.fps, 25),
      },
      {
        label: 'Confidence',
        value: percentOrDash(t.confidence, 2),
        desc: '目标检测置信度',
        tone: toneByScore(t.confidence, 85),
      },
      {
        label: 'Process Time',
        value: numberOrDash(t.processTime, 1, ' ms'),
        desc: '单帧处理时长',
        tone: toneByLowerBetter(t.processTime, 120),
      },
      {
        label: 'Delay',
        value: numberOrDash(t.delay, 1, ' ms'),
        desc: '端到端延迟',
        tone: toneByLowerBetter(t.delay, 50),
      },
      {
        label: 'All Time',
        value: numberOrDash(t.allTime, 0, ' ms'),
        desc: '任务累计处理时长',
        tone: 'neutral',
      },
      {
        label: 'Target Count',
        value: textOrDash(t.targetCount),
        desc: '累计检测目标数',
        tone: Number(t.targetCount) > 0 ? 'good' : 'bad',
      },
      {
        label: 'Throughput',
        value:
          Number.isFinite(Number(t.throughput)) && Number(t.throughput) >= 0
            ? numberOrDash(t.throughput, 0)
            : Number.isFinite(derivedThroughput)
              ? numberOrDash(derivedThroughput, 1)
              : '--',
        desc: '每秒处理目标数',
        tone:
          Number.isFinite(Number(t.throughput)) && Number(t.throughput) >= 0
            ? toneByHigherBetter(t.throughput, 5)
            : Number.isFinite(derivedThroughput)
              ? toneByHigherBetter(derivedThroughput, 5)
              : 'neutral',
      },
    ];
  }
  const cards = [
    {
      label: 'mAP@0.5',
      value: percentOrDash(t.metricsMap05, 2),
      desc: '目标定位准确率',
      tone: toneByScore(t.metricsMap05, 80),
    },
    {
      label: 'mAP@0.75',
      value: percentOrDash(t.metricsMap75, 2),
      desc: '严格 IoU 指标',
      tone: toneByScore(t.metricsMap75, 75),
    },
    {
      label: 'mAP@0.5:0.95',
      value: percentOrDash(t.metricsMap0595, 2),
      desc: '综合检测能力',
      tone: toneByScore(t.metricsMap0595, 70),
    },
    {
      label: 'Precision',
      value: percentOrDash(t.metricsPrecision, 2),
      desc: '误报控制能力',
      tone: toneByScore(t.metricsPrecision, 85),
    },
    {
      label: 'Recall',
      value: percentOrDash(t.metricsRecall, 2),
      desc: '目标召回能力',
      tone: toneByScore(t.metricsRecall, 80),
    },
    {
      label: 'F1 Score',
      value: percentOrDash(t.metricsF1Score, 2),
      desc: '精确率召回率平衡',
      tone: toneByScore(t.metricsF1Score, 80),
    },
    {
      label: 'Confidence',
      value: percentOrDash(t.confidence, 2),
      desc: '目标检测置信度',
      tone: toneByScore(t.confidence, 85),
    },
    {
      label: 'FPS',
      value: numberOrDash(t.fps, 1),
      desc: '实时推理帧率',
      tone: toneByHigherBetter(t.fps, 25),
    },
    {
      label: 'Latency',
      value: numberOrDash(t.latency, 1),
      desc: '端到端时延',
      tone: toneByLowerBetter(t.latency, 60),
    },
    {
      label: 'Jitter',
      value: numberOrDash(t.jitter, 1),
      desc: '时延抖动',
      tone: toneByLowerBetter(t.jitter, 8),
    },
    {
      label: 'Throughput',
      value: numberOrDash(t.throughput, 0),
      desc: '每分钟处理目标数',
      tone: toneByHigherBetter(t.throughput, 500),
    },
    {
      label: 'Miss Rate',
      value: percentOrDash(t.missRate, 2),
      desc: '漏检率',
      tone: toneByLowerBetter(toPercentNumber(t.missRate), 10),
    },
  ];
  return cards;
});

async function loadTaskDetail(task) {
  detailLoading.value = true;
  detailError.value = '';
  detailTask.value = task;
  let resolvedTaskType = null;
  try {
    const taskId = String(task?.taskId ?? '').trim();
    const taskType = resolveTaskType(
      task?.taskType ?? task?.taskTypeLabel,
      task?.source ?? task?.inputSource,
      task?.streamUrl,
      null,
      '',
    );
    resolvedTaskType = taskType;
    if (!taskId) throw new Error('任务ID缺失');
    if (taskType === null || taskType === undefined) {
      throw new Error('任务类型缺失或无法识别');
    }

    const detailUrl = new URL(`${httpBase.value}/data/detail`);
    detailUrl.searchParams.set('taskId', taskId);
    detailUrl.searchParams.set('taskType', String(taskType));
    const response = await fetch(detailUrl.toString(), { method: 'GET' });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || `HTTP ${response.status}`);
    }
    const payload = await response.json();
    const code = payload?.code;
    if (code !== undefined && code !== 0 && code !== 200) {
      throw new Error(payload?.msg || `接口返回异常 (${code})`);
    }

    const container =
      payload &&
      typeof payload === 'object' &&
      payload.data &&
      typeof payload.data === 'object' &&
      !Array.isArray(payload.data)
        ? payload.data
        : {};
    detailTask.value = normalizeTaskRecord(container, 0, task);
  } catch (error) {
    if (resolvedTaskType === 0) {
      const mockDetail = buildImageDetailMock(task);
      detailTask.value = normalizeTaskRecord(mockDetail, 0, task);
      detailError.value = '';
      return;
    }
    detailError.value =
      error.message === 'Failed to fetch'
        ? '无法连接后端服务，请检查后端地址'
        : error.message || '获取任务详情失败';
  } finally {
    detailLoading.value = false;
  }
}

async function openDetailDialog(task, e) {
  e.stopPropagation();
  detailSourceTask.value = task;
  showDetailDialog.value = true;
  await loadTaskDetail(task);
}

async function retryDetail() {
  if (!detailSourceTask.value) return;
  await loadTaskDetail(detailSourceTask.value);
}

function closeDetailDialog() {
  showDetailDialog.value = false;
  detailTask.value = null;
  detailSourceTask.value = null;
  detailError.value = '';
  detailLoading.value = false;
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
  const taskType = SOURCE_TO_TASK_TYPE[newTaskSource.value];
  const createdTaskId = generateTaskId();
  const newTask = {
    id: createdTaskId,
    taskId: createdTaskId,
    name: newTaskName.value.trim(),
    taskType,
    taskTypeLabel: TASK_TYPE_LABELS[taskType] ?? '--',
    scene: newTaskScene.value,
    source: newTaskSource.value.trim(),
    createdAt: formatNow(),
    targetCount: 0,
    status: 'pending',
  };
  tasks.value.unshift(newTask);
  saveTaskSummaryToStorage({
    taskName: newTask.name,
    taskType: newTask.taskTypeLabel,
    scene: newTask.scene,
  });
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
  fetchTasksFromBackend({ page: 1, size: pageSize.value });
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
        <span class="pill">共 {{ totalCount }} 条</span>
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
          placeholder="搜索任务ID、名称、类型、来源..."
          @input="onSearch"
        />
      </div>
      <div class="page-size-select">
        <label>每页</label>
        <select v-model.number="pageSize" @change="onPageSizeChange">
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
            <th>任务ID</th>
            <th>任务名称</th>
            <th>任务类型</th>
            <th>数据源</th>
            <th>检测时间</th>
            <th>检测总数</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in pagedTasks"
            :key="task.id"
            :class="{ selected: task.id === selectedTaskId }"
            @click="selectTask(task.id)"
          >
            <td>{{ task.taskId }}</td>
            <td>{{ task.name }}</td>
            <td>{{ task.taskTypeLabel }}</td>
            <td>{{ task.source }}</td>
            <td>{{ task.taskTime || task.createdAt }}</td>
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
            <td class="op-cell">
              <button class="action-btn sm" @click="openDetailDialog(task, $event)">
                查看详情
              </button>
            </td>
          </tr>
          <tr v-if="pagedTasks.length === 0">
            <td colspan="8" class="empty-row">暂无匹配的任务记录</td>
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
                <select v-model="newTaskSource">
                  <option value="" disabled>请选择输入源</option>
                  <option v-for="s in sourceOptions" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>
            <div class="dialog-footer add-task-footer">
              <div class="add-task-tip">
                Tip：新建的任务信息将存储到本地，每次新建任务会覆盖掉之前的值，请确认当前任务完成后再新建任务！
              </div>
              <div class="add-task-actions">
                <button class="action-btn" @click="showAddDialog = false">取消</button>
                <button
                  class="action-btn primary"
                  :disabled="!newTaskName.trim() || !newTaskScene || !newTaskSource.trim()"
                  @click="confirmAddTask"
                >确认创建</button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="fade">
        <div class="dialog-overlay" v-if="showDetailDialog" @click.self="closeDetailDialog">
          <div class="dialog detail-dialog">
            <div class="dialog-header">
              <h4>任务详情</h4>
              <button class="dialog-close" @click="closeDetailDialog">&times;</button>
            </div>
            <div class="dialog-body">
              <div v-if="detailLoading" class="detail-empty">加载中...</div>
              <template v-else>
                <div v-if="detailError" class="detail-empty danger">
                  <span>{{ detailError }}</span>
                  <button class="action-btn sm" @click="retryDetail">重试</button>
                </div>
                <div class="detail-preview">
                  <div class="detail-image-card">
                    <span class="detail-image-title">检测前图片</span>
                    <div class="detail-image-box">
                      <img
                        v-if="detailBeforeImageUrl"
                        :src="detailBeforeImageUrl"
                        alt="检测前图片"
                      />
                      <span v-else>暂无检测前图片</span>
                    </div>
                  </div>
                  <div class="detail-image-card">
                    <span class="detail-image-title">检测后图片</span>
                    <div class="detail-image-box">
                      <img
                        v-if="detailAfterImageUrl"
                        :src="detailAfterImageUrl"
                        alt="检测后图片"
                      />
                      <span v-else>暂无检测后图片</span>
                    </div>
                  </div>
                </div>
                <div class="detail-section-title">任务信息</div>
                <div class="detail-meta-grid">
                  <div
                    v-for="item in detailMetaItems"
                    :key="item.label"
                    class="meta-item"
                  >
                    <span class="meta-label">{{ item.label }}</span>
                    <span class="meta-value" :class="item.tone ? `tone-${item.tone}` : ''">
                      {{ item.value }}
                    </span>
                  </div>
                </div>
                <div class="detail-section-title">检测指标</div>
                <div class="detail-metric-grid">
                  <div
                    v-for="item in detailMetricCards"
                    :key="item.label"
                    class="metric-card"
                  >
                    <span class="metric-title">{{ item.label }}</span>
                    <span class="metric-value" :class="item.tone ? `tone-${item.tone}` : ''">
                      {{ item.value }}
                    </span>
                    <span class="metric-desc">{{ item.desc }}</span>
                  </div>
                </div>
              </template>
            </div>
            <div class="dialog-footer">
              <button class="action-btn primary" @click="closeDetailDialog">关闭</button>
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

.detail-dialog {
  width: min(1080px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.detail-dialog .dialog-body {
  overflow-y: auto;
}

.detail-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.detail-image-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-image-title {
  color: var(--text-dim);
  font-size: 13px;
}

.detail-image-box {
  min-height: 280px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-dim);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.detail-image-box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: rgba(5, 10, 20, 0.9);
}

.detail-section-title {
  font-size: 13px;
  color: var(--text-dim);
  margin-bottom: 2px;
  font-weight: 600;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.meta-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(130, 180, 255, 0.05);
}

.meta-label {
  font-size: 12px;
  color: var(--text-dim);
}

.meta-value {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  word-break: break-all;
}

.detail-metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(138, 177, 230, 0.12);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 118px;
}

.metric-title {
  font-size: 12px;
  font-weight: 600;
  color: #dfe8ff;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.05;
  color: #f5f8ff;
}

.metric-desc {
  margin-top: auto;
  font-size: 12px;
  color: #a8bad9;
}

.meta-value.tone-good,
.metric-value.tone-good {
  color: #95de64;
}

.meta-value.tone-bad,
.metric-value.tone-bad {
  color: #ff7875;
}

.detail-empty {
  color: var(--text-dim);
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.detail-empty.danger {
  color: var(--danger);
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

.add-task-footer {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.add-task-tip {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-dim);
}

.add-task-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 960px) {
  .detail-preview {
    grid-template-columns: 1fr;
  }

  .detail-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .detail-image-box {
    min-height: 220px;
  }
}

@media (max-width: 640px) {
  .detail-meta-grid {
    grid-template-columns: 1fr;
  }

  .detail-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 460px) {
  .detail-metric-grid {
    grid-template-columns: 1fr;
  }
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
