<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onActivated,
  onDeactivated,
  ref,
  watch,
  nextTick,
} from "vue";
import { useDataStore } from "../stores/useDataStore";
import { useConfigStore } from "../stores/useConfigStore";
import { storeToRefs } from "pinia";
import * as echarts from "echarts";

const dataStore = useDataStore();
const configStore = useConfigStore();
const { summary, series } = storeToRefs(dataStore);
const { httpBase } = storeToRefs(configStore);

// 后端数据加载状态
const loading = ref(false);
const fetchError = ref("");
const useBackendData = ref(false); // 是否已从后端成功加载过数据

const chartPalette = [
  "#4f95ff",
  "#61d9e8",
  "#41d98f",
  "#f6cf68",
  "#ff7b7b",
  "#a56af5",
];

const fmt = (v, suffix = '') => v === undefined ? '--' : `${v}${suffix}`;

const CLASS_LABELS = {
  0: "行人 (Pedestrian)",
  1: "人群 (People)",
  2: "自行车 (Bicycle)",
  3: "汽车 (Car)",
  4: "面包车 (Van)",
  5: "卡车 (Truck)",
  6: "三轮车 (Tricycle)",
  7: "棚式三轮车 (Awning-tricycle)",
  8: "公交车 (Bus)",
  9: "摩托车 (Motor)",
};

const toNumber = (value, fallback = undefined) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const roundTo = (value, digits = 2) => {
  if (value === undefined) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toPercent = (value, digits = 2) => {
  const num = toNumber(value);
  if (num === undefined) return undefined;
  return roundTo(num <= 1 ? num * 100 : num, digits);
};

const toRatio = (value) => {
  const num = toNumber(value);
  if (num === undefined) return undefined;
  return num > 1 ? num / 100 : num;
};

const buildFlatTrend = (value, count = 12, amplitude = 0) => {
  if (value === undefined) return [];
  return Array.from({ length: count }, (_, index) =>
    roundTo(value + Math.sin((index / count) * Math.PI * 2) * amplitude, 2),
  );
};

const emptySeries = () => ({
  classes: [],
  sceneComparison: [],
  prCurve: [],
  iouMetrics: [],
  fpsTrend: [],
  latencyTrend: [],
  confidenceBands: [],
  hourlyQuality: [],
});

const applyEmptyMetrics = () => {
  const emptyKeys = [
    "precision",
    "recall",
    "map50",
    "map75",
    "map5095",
    "f1",
    "fps",
    "latency",
    "jitter",
    "throughput",
    "missRate",
    "stability",
    "totalFrames",
    "totalTargets",
    "avgScore",
    "avgInference",
  ];
  emptyKeys.forEach((key) => {
    summary.value[key] = undefined;
  });
  localSeries.value = emptySeries();
};

const normalizeLegacyMetrics = (container) => {
  if (!container || typeof container !== "object") return null;

  if (container.summary || container.series) {
    return {
      summaryPatch: container.summary ?? {},
      seriesData: { ...emptySeries(), ...(container.series ?? {}) },
    };
  }

  const hasSeriesShape =
    Array.isArray(container.classes) ||
    Array.isArray(container.sceneComparison) ||
    Array.isArray(container.prCurve);

  if (!hasSeriesShape) return null;

  return {
    summaryPatch: {},
    seriesData: { ...emptySeries(), ...container },
  };
};

const normalizeNewMetrics = (container) => {
  if (!container || typeof container !== "object") return null;

  const hasNewShape =
    container.head ||
    container.PR ||
    Array.isArray(container.type) ||
    Array.isArray(container.sceneRate) ||
    container.stream;
  if (!hasNewShape) return null;

  const head = container.head ?? {};
  const stream = container.stream ?? {};
  const typeList = Array.isArray(container.type) ? container.type : [];
  const sceneRateList = Array.isArray(container.sceneRate) ? container.sceneRate : [];
  const prObj = container.PR && typeof container.PR === "object" ? container.PR : {};
  const firstPrList = Object.values(prObj).find((value) => Array.isArray(value)) ?? [];

  const map50 = toPercent(head.map05);
  const map75 = toPercent(head.map75);
  const map5095 = toPercent(head.map0595);
  const precision = toPercent(head.precision);
  const recall = toPercent(head.recall);
  const f1 = toPercent(head.f1Score);
  const fps = roundTo(toNumber(head.fps ?? stream.fps), 2);
  const latency = roundTo(toNumber(head.latency ?? stream.delay), 2);
  const avgMs = roundTo(toNumber(head.avgMs ?? stream.processTime), 2);
  const totalCount = roundTo(toNumber(head.allCount ?? stream.targetCount), 0);
  const confidence = toPercent(head.confidence ?? stream.confidence);
  const missRate = recall === undefined ? undefined : roundTo(100 - recall, 2);

  const classes = typeList.map((item, index) => {
    const classId = toNumber(item?.classId);
    const count = roundTo(toNumber(item?.count, 0), 0) ?? 0;
    const ratePercent = toPercent(item?.rate);
    return {
      name: CLASS_LABELS[classId] ?? `类别 ${classId ?? index + 1}`,
      value: ratePercent ?? count,
      precision,
      recall,
      f1,
      support: count,
      missRate,
    };
  });

  const sceneComparison = sceneRateList.map((item, index) => {
    const sceneRaw = String(item?.scene ?? "").trim();
    const count = roundTo(toNumber(item?.count, 0), 0) ?? 0;
    const ratePercent = toPercent(item?.rate);
    return {
      scene: sceneRaw && sceneRaw !== "null" ? sceneRaw : `场景 ${index + 1}`,
      precision,
      recall,
      map50: ratePercent,
      fps,
      latency,
      samples: count,
    };
  });

  const prCurve = firstPrList
    .map((point) => {
      const recallRatio = toRatio(point?.recall);
      const precisionRatio = toRatio(point?.precision);
      if (recallRatio === undefined || precisionRatio === undefined) return null;
      return [roundTo(recallRatio, 6), roundTo(precisionRatio, 6)];
    })
    .filter(Boolean);

  const iouMetrics = [
    { iou: "0.50", map: map50, precision, recall },
    { iou: "0.75", map: map75, precision, recall },
    { iou: "0.95", map: map5095, precision, recall },
  ].filter(
    (item) =>
      item.map !== undefined ||
      item.precision !== undefined ||
      item.recall !== undefined,
  );

  const confidenceThreshold = roundTo(toNumber(head.confidence ?? stream.confidence), 2);
  const confidenceBands =
    confidenceThreshold === undefined
      ? []
      : [
          {
            threshold: confidenceThreshold,
            precision,
            recall,
            f1,
          },
        ];

  const fpsTrend = buildFlatTrend(fps, 12, fps ? Math.max(0.2, fps * 0.02) : 0);
  const latencyTrend = buildFlatTrend(
    latency,
    12,
    latency ? Math.max(0.2, latency * 0.05) : 0,
  );

  const hourlyQualityFromScene = sceneComparison.map((item, index) => ({
    period: item.scene || `场景 ${index + 1}`,
    targets: item.samples ?? 0,
    avgScore: confidence,
    map50: item.map50 ?? map50,
  }));

  const hourlyQuality =
    hourlyQualityFromScene.length > 0
      ? hourlyQualityFromScene
      : totalCount === undefined
        ? []
        : [
            {
              period: "当前",
              targets: totalCount,
              avgScore: confidence,
              map50,
            },
          ];

  return {
    summaryPatch: {
      map50,
      map75,
      map5095,
      precision,
      recall,
      f1,
      fps,
      latency,
      jitter: avgMs,
      throughput: totalCount,
      missRate,
      stability: confidence,
      totalFrames: totalCount,
      totalTargets: totalCount,
      avgScore: confidence,
      avgInference: avgMs,
    },
    seriesData: {
      classes,
      sceneComparison,
      prCurve,
      iouMetrics,
      confidenceBands,
      fpsTrend,
      latencyTrend,
      hourlyQuality,
    },
  };
};

const normalizeMetricsPayload = (payload) => {
  const container =
    payload &&
    typeof payload === "object" &&
    payload.data &&
    typeof payload.data === "object"
      ? payload.data
      : payload;

  return normalizeNewMetrics(container) ?? normalizeLegacyMetrics(container);
};

const coreMetrics = computed(() => [
  { label: "mAP@0.5", value: fmt(summary.value.map50, '%'), note: "目标定位准确率" },
  { label: "mAP@0.75", value: fmt(summary.value.map75, '%'), note: "严格 IoU 指标" },
  { label: "mAP@0.5:0.95", value: fmt(summary.value.map5095, '%'), note: "综合检测能力" },
  { label: "Precision", value: fmt(summary.value.precision, '%'), note: "误报控制能力" },
  { label: "Recall", value: fmt(summary.value.recall, '%'), note: "目标召回能力" },
  { label: "F1 Score", value: fmt(summary.value.f1, '%'), note: "精确率召回率平衡" },
  { label: "FPS", value: fmt(summary.value.fps), note: "实时推理帧率" },
  { label: "Latency", value: fmt(summary.value.latency, ' ms'), note: "端到端时延" },
  { label: "Jitter", value: fmt(summary.value.jitter, ' ms'), note: "时延抖动" },
  { label: "Throughput", value: fmt(summary.value.throughput, ' obj/min'), note: "每分钟处理目标数" },
  { label: "Miss Rate", value: fmt(summary.value.missRate, '%'), note: "漏检率" },
]);

const cloneSeries = (data) => JSON.parse(JSON.stringify(data));
const localSeries = ref(cloneSeries(series.value));
const lastUpdated = ref(new Date());
const refreshKey = ref(0);

const pageIndex = ref(0);
const pageSize = 6;
const totalPages = computed(() =>
  Math.ceil(localSeries.value.hourlyQuality.length / pageSize),
);

const pagedHourly = computed(() => {
  const start = pageIndex.value * pageSize;
  return localSeries.value.hourlyQuality.slice(start, start + pageSize);
});

const refreshMetrics = async () => {
  loading.value = true;
  fetchError.value = "";
  try {
    const response = await fetch(`${httpBase.value}/data/allData`);
    if (!response.ok) throw new Error(`请求失败 (${response.status})`);

    const payload = await response.json();
    const code = payload?.code;
    if (code !== undefined && code !== 0 && code !== 200) {
      throw new Error(payload?.msg || `接口返回异常 (${code})`);
    }

    const normalized = normalizeMetricsPayload(payload);
    if (!normalized) throw new Error("当前指标数据格式不受支持");

    Object.assign(summary.value, normalized.summaryPatch);
    localSeries.value = { ...emptySeries(), ...normalized.seriesData };

    useBackendData.value = true;
    lastUpdated.value = new Date();
    refreshKey.value += 1;
    pageIndex.value = 0;
  } catch (error) {
    console.error("获取指标数据失败:", error);
    fetchError.value =
      error.message === "Failed to fetch"
        ? "无法连接后端服务，请检查后端地址"
        : error.message;

    applyEmptyMetrics();
    refreshKey.value += 1;
  } finally {
    loading.value = false;
  }
};

const nextPage = () => {
  if (pageIndex.value < totalPages.value - 1) pageIndex.value += 1;
};

const prevPage = () => {
  if (pageIndex.value > 0) pageIndex.value -= 1;
};

const lastUpdatedText = computed(
  () =>
    `${lastUpdated.value.toLocaleDateString()} ${lastUpdated.value.toLocaleTimeString()}`,
);

const classPieRef = ref(null);
const sceneFunnelRef = ref(null);
const prLineRef = ref(null);
const iouLineRef = ref(null);
const confidenceLineRef = ref(null);
const performanceLineRef = ref(null);
const hourlyBarRef = ref(null);

const chartMap = new Map();

const initChart = (key, el) => {
  if (!el || chartMap.has(key)) return;
  chartMap.set(key, echarts.init(el, null, { renderer: "svg" }));
};

const resizeCharts = () => {
  chartMap.forEach((chart) => chart.resize());
};

const downloadFile = (url, filename) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
};

const svgToPng = (svgUrl) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.src = svgUrl;
  });

const exportChart = async (key, type) => {
  const chart = chartMap.get(key);
  if (!chart) return;
  const svgData = chart.getDataURL({ type: "svg" });
  if (type === "svg") {
    downloadFile(svgData, `${key}.svg`);
    return;
  }
  if (type === "png") {
    const pngData = await svgToPng(svgData);
    downloadFile(pngData, `${key}.png`);
    return;
  }
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(
    '<!DOCTYPE html><html><head><title>Print Chart</title></head><body style="margin:0;padding:0;text-align:center;"></body></html>',
  );
  const img = printWindow.document.createElement("img");
  img.src = svgData;
  img.style.width = "100%";
  img.style.height = "auto";
  printWindow.document.body.appendChild(img);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 200);
};

const buildChartOptions = () => {
  const classes = localSeries.value.classes;
  const scenes = localSeries.value.sceneComparison;
  const prCurve = localSeries.value.prCurve;
  const iouMetrics = localSeries.value.iouMetrics;
  const confidenceBands = localSeries.value.confidenceBands;
  const fpsTrend = localSeries.value.fpsTrend;
  const latencyTrend = localSeries.value.latencyTrend;
  const hourlyQuality = pagedHourly.value;

  const classPieOption = {
    color: chartPalette,
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: {
      bottom: 0,
      textStyle: { color: "#9cb6db" },
    },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        label: { color: "#eef5ff", formatter: "{b}\n{d}%" },
        data: classes.map((item) => ({ name: item.name, value: item.value })),
      },
    ],
  };

  const sceneFunnelOption = {
    color: chartPalette,
    tooltip: { trigger: "item", formatter: "{b}: {c}%" },
    legend: { top: 8, textStyle: { color: "#9cb6db" } },
    series: [
      {
        type: "funnel",
        sort: "descending",
        label: { color: "#eef5ff" },
        data: scenes.map((item) => ({
          name: item.scene,
          value: item.map50,
        })),
      },
    ],
  };

  const prLineOption = {
    color: ["#61d9e8"],
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: "Recall",
      min: 0,
      max: 1,
      axisLabel: { color: "#9cb6db" },
    },
    yAxis: {
      type: "value",
      name: "Precision",
      min: 0,
      max: 1,
      axisLabel: { color: "#9cb6db" },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 6,
        data: prCurve.map(([x, y]) => [x, y]),
      },
    ],
  };

  const iouLineOption = {
    color: ["#4f95ff", "#61d9e8", "#f6cf68"],
    tooltip: { trigger: "axis" },
    legend: { top: 8, textStyle: { color: "#9cb6db" } },
    xAxis: {
      type: "category",
      data: iouMetrics.map((item) => item.iou),
      axisLabel: { color: "#9cb6db" },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#9cb6db" },
    },
    series: [
      {
        name: "mAP",
        type: "line",
        smooth: true,
        data: iouMetrics.map((item) => item.map),
      },
      {
        name: "Precision",
        type: "line",
        smooth: true,
        data: iouMetrics.map((item) => item.precision),
      },
      {
        name: "Recall",
        type: "line",
        smooth: true,
        data: iouMetrics.map((item) => item.recall),
      },
    ],
  };

  const confidenceLineOption = {
    color: ["#41d98f", "#ff7b7b", "#f6cf68"],
    tooltip: { trigger: "axis" },
    legend: { top: 8, textStyle: { color: "#9cb6db" } },
    xAxis: {
      type: "category",
      data: confidenceBands.map((item) => item.threshold),
      axisLabel: { color: "#9cb6db" },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#9cb6db" },
    },
    series: [
      {
        name: "Precision",
        type: "line",
        smooth: true,
        data: confidenceBands.map((item) => item.precision),
      },
      {
        name: "Recall",
        type: "line",
        smooth: true,
        data: confidenceBands.map((item) => item.recall),
      },
      {
        name: "F1",
        type: "line",
        smooth: true,
        data: confidenceBands.map((item) => item.f1),
      },
    ],
  };

  const performanceLineOption = {
    color: ["#61d9e8", "#f6cf68"],
    tooltip: { trigger: "axis" },
    legend: { top: 8, textStyle: { color: "#9cb6db" } },
    xAxis: {
      type: "category",
      data: fpsTrend.map((_, index) => `T${index + 1}`),
      axisLabel: { color: "#9cb6db" },
    },
    yAxis: [
      {
        type: "value",
        name: "FPS",
        axisLabel: { color: "#9cb6db" },
      },
      {
        type: "value",
        name: "Latency",
        axisLabel: { color: "#9cb6db" },
      },
    ],
    series: [
      {
        name: "FPS",
        type: "line",
        smooth: true,
        data: fpsTrend,
      },
      {
        name: "Latency",
        type: "line",
        smooth: true,
        yAxisIndex: 1,
        data: latencyTrend,
      },
    ],
  };

  const hourlyBarOption = {
    color: ["#4f95ff", "#ff7b7b", "#41d98f"],
    tooltip: { trigger: "axis" },
    legend: { top: 8, textStyle: { color: "#9cb6db" } },
    xAxis: {
      type: "category",
      data: hourlyQuality.map((item) => item.period),
      axisLabel: { color: "#9cb6db", rotate: 30 },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#9cb6db" },
    },
    series: [
      {
        name: "检测目标",
        type: "bar",
        label: { show: true, position: "top", color: "#9cb6db", fontSize: 10 },
        data: hourlyQuality.map((item) => item.targets),
      },
      {
        name: "mAP@0.5",
        type: "line",
        smooth: true,
        data: hourlyQuality.map((item) => item.map50),
      },
    ],
  };

  return {
    classPieOption,
    sceneFunnelOption,
    prLineOption,
    iouLineOption,
    confidenceLineOption,
    performanceLineOption,
    hourlyBarOption,
  };
};

const updateCharts = () => {
  const options = buildChartOptions();
  chartMap.get("classPie")?.setOption(options.classPieOption);
  chartMap.get("sceneFunnel")?.setOption(options.sceneFunnelOption);
  chartMap.get("prLine")?.setOption(options.prLineOption);
  chartMap.get("iouLine")?.setOption(options.iouLineOption);
  chartMap.get("confidenceLine")?.setOption(options.confidenceLineOption);
  chartMap.get("performanceLine")?.setOption(options.performanceLineOption);
  chartMap.get("hourlyBar")?.setOption(options.hourlyBarOption);
};

let isActive = false;

onMounted(async () => {
  initChart("classPie", classPieRef.value);
  initChart("sceneFunnel", sceneFunnelRef.value);
  initChart("prLine", prLineRef.value);
  initChart("iouLine", iouLineRef.value);
  initChart("confidenceLine", confidenceLineRef.value);
  initChart("performanceLine", performanceLineRef.value);
  initChart("hourlyBar", hourlyBarRef.value);
  // 首屏先渲染空态图表，再尝试从后端获取
  updateCharts();
  await refreshMetrics();
  updateCharts();
});

onActivated(() => {
  isActive = true;
  window.addEventListener("resize", resizeCharts);
  // Force resize in case window was resized while inactive
  setTimeout(() => resizeCharts(), 0);
});

onDeactivated(() => {
  isActive = false;
  window.removeEventListener("resize", resizeCharts);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCharts);
  chartMap.forEach((chart) => chart.dispose());
  chartMap.clear();
});

watch(
  series,
  () => {
    localSeries.value = cloneSeries(series.value);
    if (isActive) updateCharts();
  },
  { deep: true },
);

watch([refreshKey, pageIndex], updateCharts);
</script>

<template>
  <section class="metrics-grid">
    <div class="panel metrics-panel-wide">
      <div class="panel-header">
        <h3>核心指标总览</h3>
        <div class="panel-actions">
          <span v-if="fetchError" class="update-time" style="color: var(--danger)">{{ fetchError }}</span>
          <span v-else class="update-time">{{ useBackendData ? '实时数据' : '--' }} | 更新 {{ lastUpdatedText }}</span>
          <button class="ghost-btn" @click="refreshMetrics" :disabled="loading">
            {{ loading ? '加载中...' : '刷新数据' }}
          </button>
        </div>
      </div>
      <div class="detailed-stat-grid">
        <div
          v-for="item in coreMetrics"
          :key="item.label"
          class="metric-detail-card"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.note }}</small>
        </div>
      </div>
      <div class="metrics-kpi-row">
        <div class="kpi-pill">
          <span>累计分析帧数</span>
          <strong>{{ summary.totalFrames ?? '--' }}</strong>
        </div>
        <div class="kpi-pill">
          <span>累计检测目标</span>
          <strong>{{ summary.totalTargets ?? '--' }}</strong>
        </div>
        <div class="kpi-pill">
          <span>平均置信度</span>
          <strong>{{ summary.avgScore !== undefined ? summary.avgScore + '%' : '--' }}</strong>
        </div>
        <div class="kpi-pill">
          <span>稳定性</span>
          <strong>{{ summary.stability !== undefined ? summary.stability + '%' : '--' }}</strong>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>类别表现与误差分析</h3>
        <div class="panel-actions">
          <button class="ghost-btn" @click="exportChart('classPie', 'png')">
            PNG
          </button>
          <button class="ghost-btn" @click="exportChart('classPie', 'svg')">
            SVG
          </button>
          <button class="ghost-btn" @click="exportChart('classPie', 'pdf')">
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas" ref="classPieRef"></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>多场景鲁棒性对比</h3>
        <div class="panel-actions">
          <button class="ghost-btn" @click="exportChart('sceneFunnel', 'png')">
            PNG
          </button>
          <button class="ghost-btn" @click="exportChart('sceneFunnel', 'svg')">
            SVG
          </button>
          <button class="ghost-btn" @click="exportChart('sceneFunnel', 'pdf')">
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas" ref="sceneFunnelRef"></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>P-R 曲线</h3>
        <div class="panel-actions">
          <button class="ghost-btn" @click="exportChart('prLine', 'png')">
            PNG
          </button>
          <button class="ghost-btn" @click="exportChart('prLine', 'svg')">
            SVG
          </button>
          <button class="ghost-btn" @click="exportChart('prLine', 'pdf')">
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas tall" ref="prLineRef"></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>IoU 阈值趋势</h3>
        <div class="panel-actions">
          <button class="ghost-btn" @click="exportChart('iouLine', 'png')">
            PNG
          </button>
          <button class="ghost-btn" @click="exportChart('iouLine', 'svg')">
            SVG
          </button>
          <button class="ghost-btn" @click="exportChart('iouLine', 'pdf')">
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas" ref="iouLineRef"></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>阈值敏感性</h3>
        <div class="panel-actions">
          <button
            class="ghost-btn"
            @click="exportChart('confidenceLine', 'png')"
          >
            PNG
          </button>
          <button
            class="ghost-btn"
            @click="exportChart('confidenceLine', 'svg')"
          >
            SVG
          </button>
          <button
            class="ghost-btn"
            @click="exportChart('confidenceLine', 'pdf')"
          >
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas" ref="confidenceLineRef"></div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>实时性能趋势</h3>
        <div class="panel-actions">
          <button
            class="ghost-btn"
            @click="exportChart('performanceLine', 'png')"
          >
            PNG
          </button>
          <button
            class="ghost-btn"
            @click="exportChart('performanceLine', 'svg')"
          >
            SVG
          </button>
          <button
            class="ghost-btn"
            @click="exportChart('performanceLine', 'pdf')"
          >
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas tall" ref="performanceLineRef"></div>
    </div>

    <div class="panel metrics-panel-wide">
      <div class="panel-header">
        <h3>分时检测质量</h3>
        <div class="panel-actions">
          <span class="update-time">更新 {{ lastUpdatedText }}</span>
          <button class="ghost-btn" @click="refreshMetrics" :disabled="loading">
            {{ loading ? '加载中...' : '刷新数据' }}
          </button>
          <button class="ghost-btn" @click="exportChart('hourlyBar', 'png')">
            PNG
          </button>
          <button class="ghost-btn" @click="exportChart('hourlyBar', 'svg')">
            SVG
          </button>
          <button class="ghost-btn" @click="exportChart('hourlyBar', 'pdf')">
            打印
          </button>
        </div>
      </div>
      <div class="chart-canvas tall" ref="hourlyBarRef"></div>
      <div class="pagination-bar">
        <button class="ghost-btn" @click="prevPage" :disabled="pageIndex === 0">
          上一页
        </button>
        <span class="page-info"
          >第 {{ pageIndex + 1 }} / {{ totalPages }} 页</span
        >
        <button
          class="ghost-btn"
          @click="nextPage"
          :disabled="pageIndex >= totalPages - 1"
        >
          下一页
        </button>
      </div>
    </div>
  </section>
</template>
