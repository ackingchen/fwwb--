import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useConfigStore = defineStore('config', () => {
  // Backend API IP Management (persisted to localStorage)
  const savedIp = localStorage.getItem('backend_ip') || '10.21.204.210:8080';
  const backendIp = ref(savedIp);

  const setBackendIp = (ip) => {
    backendIp.value = ip;
    localStorage.setItem('backend_ip', ip);
  };

  const httpBase = computed(() => `http://${backendIp.value}`);
  const wsBase = computed(() => `ws://${backendIp.value}`);

  // Detection Settings
  const confidence = ref(0.62);
  const iou = ref(0.48);
  const selectedModel = ref('YOLOv11-lite');
  const enabledLabels = ref([
    'pedestrian',
    'people',
    'bicycle',
    'car',
    'van',
    'truck',
    'tricycle',
    'awning-tricycle',
    'bus',
    'motor',
  ]);
  
  // Active task selection
  const selectedTaskId = ref('');

  // System Preferences
  const language = ref('zh-CN');
  const theme = ref('dark'); // 'dark', 'light' (mock)
  const autoUpdate = ref(true);
  const notifications = ref({
    sound: true,
    popup: true,
    push: false,
    email: true
  });

  // Actions
  const resetSettings = () => {
    confidence.value = 0.62;
    iou.value = 0.48;
    selectedModel.value = 'YOLOv11-lite';
    enabledLabels.value = [
      'pedestrian',
      'people',
      'bicycle',
      'car',
      'van',
      'truck',
      'tricycle',
      'awning-tricycle',
      'bus',
      'motor',
    ];
    language.value = 'zh-CN';
    theme.value = 'dark';
    autoUpdate.value = true;
    notifications.value = {
      sound: true,
      popup: true,
      push: false,
      email: true
    };
  };

  return {
    backendIp,
    setBackendIp,
    httpBase,
    wsBase,
    confidence,
    iou,
    selectedModel,
    enabledLabels,
    selectedTaskId,
    language,
    theme,
    autoUpdate,
    notifications,
    resetSettings
  };
});
