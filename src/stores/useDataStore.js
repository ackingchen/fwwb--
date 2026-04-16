import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  detectionFeed,
  metricsSummary,
  metricSeries,
  taskList,
  systemResources,
} from "../mock/data";
import { useConfigStore } from "./useConfigStore";

export const useDataStore = defineStore("data", () => {
  const configStore = useConfigStore();

  const detections = ref(detectionFeed);
  const summary = ref(metricsSummary);
  const series = ref(metricSeries);
  const tasks = ref(taskList);
  const resources = ref(systemResources);

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
      tasks.value[0] ?? {},
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
