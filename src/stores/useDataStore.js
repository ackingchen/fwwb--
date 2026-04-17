import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useConfigStore } from "./useConfigStore";

export const useDataStore = defineStore("data", () => {
  const configStore = useConfigStore();

  const detections = ref([]);
  const summary = ref({
    map50: undefined,
    map75: undefined,
    map5095: undefined,
    precision: undefined,
    recall: undefined,
    f1: undefined,
    fps: undefined,
    latency: undefined,
    jitter: undefined,
    throughput: undefined,
    missRate: undefined,
    stability: undefined,
    totalFrames: undefined,
    totalTargets: undefined,
    avgScore: undefined,
    avgInference: undefined,
  });
  const series = ref({
    classes: [],
    sceneComparison: [],
    prCurve: [],
    iouMetrics: [],
    confidenceBands: [],
    fpsTrend: [],
    latencyTrend: [],
    hourlyQuality: [],
  });
  const tasks = ref([]);
  const resources = ref({
    cpu: undefined,
    gpu: undefined,
    memory: undefined,
    temp: undefined,
  });

  const filteredDetections = computed(() =>
    detections.value.filter(
      (item) =>
        item.score >= configStore.confidence &&
        configStore.enabledLabels.includes(item.labelKey),
    ),
  );

  const activeTask = computed(
    () =>
      tasks.value.find((task) => task.status === "running") ??
      tasks.value[0] ?? { name: "--", scene: "--", source: "--" },
  );

  return {
    detections,
    summary,
    series,
    tasks,
    resources,
    filteredDetections,
    activeTask,
  };
});
