<script setup>
import { computed } from "vue";
import { useDataStore } from "../stores/useDataStore";
import { storeToRefs } from "pinia";

const dataStore = useDataStore();
const { summary, series } = storeToRefs(dataStore);

const coreMetrics = computed(() => [
  {
    label: "mAP@0.5",
    value: `${summary.value.map50}%`,
    note: "目标定位准确率",
  },
  {
    label: "mAP@0.75",
    value: `${summary.value.map75}%`,
    note: "严格 IoU 指标",
  },
  {
    label: "mAP@0.5:0.95",
    value: `${summary.value.map5095}%`,
    note: "综合检测能力",
  },
  {
    label: "Precision",
    value: `${summary.value.precision}%`,
    note: "误报控制能力",
  },
  { label: "Recall", value: `${summary.value.recall}%`, note: "目标召回能力" },
  {
    label: "F1 Score",
    value: `${summary.value.f1}%`,
    note: "精确率召回率平衡",
  },
  { label: "FPS", value: `${summary.value.fps}`, note: "实时推理帧率" },
  {
    label: "Latency",
    value: `${summary.value.latency} ms`,
    note: "端到端时延",
  },
  { label: "Jitter", value: `${summary.value.jitter} ms`, note: "时延抖动" },
  {
    label: "Throughput",
    value: `${summary.value.throughput} obj/min`,
    note: "每分钟处理目标数",
  },
  {
    label: "False Alarm",
    value: `${summary.value.falseAlarmRate}%`,
    note: "误报率",
  },
  { label: "Miss Rate", value: `${summary.value.missRate}%`, note: "漏检率" },
]);

const buildNormalizedPath = (values, width, height) => {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

const buildPrPath = (points, width, height) =>
  points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${x * width} ${(1 - y) * height}`,
    )
    .join(" ");

const prPath = computed(() => buildPrPath(series.value.prCurve, 320, 180));
const fpsPath = computed(() =>
  buildNormalizedPath(series.value.fpsTrend, 320, 96),
);
const latencyPath = computed(() =>
  buildNormalizedPath(series.value.latencyTrend, 320, 96),
);

const classBest = computed(
  () => [...series.value.classes].sort((a, b) => b.value - a.value)[0],
);

const sceneWeakest = computed(
  () => [...series.value.sceneComparison].sort((a, b) => a.map50 - b.map50)[0],
);
</script>

<template>
  <section class="metrics-grid">
    <div class="panel metrics-panel-wide">
      <div class="panel-header">
        <h3>核心指标总览</h3>
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
          <strong>{{ summary.totalFrames }}</strong>
        </div>
        <div class="kpi-pill">
          <span>累计检测目标</span>
          <strong>{{ summary.totalTargets }}</strong>
        </div>
        <div class="kpi-pill">
          <span>累计告警</span>
          <strong>{{ summary.totalWarnings }}</strong>
        </div>
        <div class="kpi-pill">
          <span>平均置信度</span>
          <strong>{{ summary.avgScore }}%</strong>
        </div>
        <div class="kpi-pill">
          <span>稳定性</span>
          <strong>{{ summary.stability }}%</strong>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>类别表现与误差分析</h3>
      </div>
      <div class="class-detail-list">
        <div
          v-for="item in series.classes"
          :key="item.name"
          class="class-detail-row"
        >
          <div class="class-row-header">
            <h4>{{ item.name }}</h4>
            <strong>{{ item.value }}%</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: `${item.value}%` }"></div>
          </div>
          <div class="class-meta-grid">
            <span>P: {{ item.precision }}%</span>
            <span>R: {{ item.recall }}%</span>
            <span>F1: {{ item.f1 }}%</span>
            <span>样本: {{ item.support }}</span>
            <span>漏检: {{ item.missRate }}%</span>
            <span>误报: {{ item.falseAlarm }}%</span>
          </div>
        </div>
      </div>
      <div class="analysis-footer">
        <span>最佳类别：{{ classBest?.name }}</span>
        <strong>AP {{ classBest?.value }}%</strong>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>多场景鲁棒性对比</h3>
      </div>
      <div class="scene-compare-list">
        <div
          v-for="item in series.sceneComparison"
          :key="item.scene"
          class="scene-rich-card"
        >
          <div class="scene-rich-title">
            <h4>{{ item.scene }}</h4>
            <strong>mAP {{ item.map50 }}%</strong>
          </div>
          <div class="scene-rich-grid">
            <span>Precision {{ item.precision }}%</span>
            <span>Recall {{ item.recall }}%</span>
            <span>FPS {{ item.fps }}</span>
            <span>Latency {{ item.latency }}ms</span>
            <span>告警率 {{ item.warningRate }}%</span>
            <span>样本 {{ item.samples }}</span>
          </div>
        </div>
      </div>
      <div class="analysis-footer">
        <span>薄弱场景：{{ sceneWeakest?.scene }}</span>
        <strong>mAP {{ sceneWeakest?.map50 }}%</strong>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>P-R 曲线与阈值敏感性</h3>
      </div>
      <svg viewBox="0 0 320 180" class="curve-chart" aria-label="P-R Curve">
        <path d="M 0 180 L 320 180" class="axis"></path>
        <path d="M 0 0 L 0 180" class="axis"></path>
        <path :d="prPath" class="curve"></path>
      </svg>
      <div class="metric-table-wrap">
        <table>
          <thead>
            <tr>
              <th>IoU</th>
              <th>mAP</th>
              <th>Precision</th>
              <th>Recall</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in series.iouMetrics" :key="item.iou">
              <td>{{ item.iou }}</td>
              <td>{{ item.map }}%</td>
              <td>{{ item.precision }}%</td>
              <td>{{ item.recall }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="confidence-band-list">
        <div
          v-for="item in series.confidenceBands"
          :key="item.threshold"
          class="confidence-band-item"
        >
          <span>阈值 {{ item.threshold }}</span>
          <span>P {{ item.precision }}%</span>
          <span>R {{ item.recall }}%</span>
          <span>F1 {{ item.f1 }}%</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>实时性能趋势</h3>
      </div>
      <div class="trend-block">
        <div class="trend-item">
          <div class="trend-title">
            <span>FPS 波动</span>
            <strong>{{ summary.fps }}</strong>
          </div>
          <svg viewBox="0 0 320 96" class="trend-chart" aria-label="FPS Trend">
            <path d="M 0 96 L 320 96" class="axis"></path>
            <path :d="fpsPath" class="curve"></path>
          </svg>
        </div>
        <div class="trend-item">
          <div class="trend-title">
            <span>时延波动</span>
            <strong>{{ summary.latency }}ms</strong>
          </div>
          <svg
            viewBox="0 0 320 96"
            class="trend-chart"
            aria-label="Latency Trend"
          >
            <path d="M 0 96 L 320 96" class="axis"></path>
            <path :d="latencyPath" class="curve latency-curve"></path>
          </svg>
        </div>
      </div>
    </div>

    <div class="panel metrics-panel-wide">
      <div class="panel-header">
        <h3>分时检测质量明细</h3>
      </div>
      <div class="metric-table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间段</th>
              <th>检测目标</th>
              <th>告警数</th>
              <th>平均置信度</th>
              <th>mAP@0.5</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in series.hourlyQuality" :key="item.period">
              <td>{{ item.period }}</td>
              <td>{{ item.targets }}</td>
              <td>{{ item.warnings }}</td>
              <td>{{ item.avgScore }}%</td>
              <td>{{ item.map50 }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
