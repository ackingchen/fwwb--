import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useConfigStore = defineStore('config', () => {
  const BACKEND_IP_STORAGE_KEY = 'backend_ip';
  const THEME_STORAGE_KEY = 'app_theme';
  const DEFAULT_BACKEND_IP = '10.21.204.210:8080';
  const DEFAULT_THEME = 'dark';
  const isClient = typeof window !== 'undefined';

  const readStorage = (key) => {
    if (!isClient) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const writeStorage = (key, value) => {
    if (!isClient) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage write failures
    }
  };

  // Backend API IP Management (persisted to localStorage)
  const savedIp = readStorage(BACKEND_IP_STORAGE_KEY) || DEFAULT_BACKEND_IP;
  const backendIp = ref(savedIp);

  const setBackendIp = (ip) => {
    backendIp.value = ip;
    writeStorage(BACKEND_IP_STORAGE_KEY, ip);
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
  const savedTheme = readStorage(THEME_STORAGE_KEY);
  const theme = ref(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : DEFAULT_THEME);
  const autoUpdate = ref(true);
  const notifications = ref({
    sound: true,
    popup: true,
    push: false,
    email: true
  });

  const setTheme = (value) => {
    theme.value = value === 'light' ? 'light' : 'dark';
    writeStorage(THEME_STORAGE_KEY, theme.value);
  };

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
    setTheme(DEFAULT_THEME);
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
    setTheme,
    autoUpdate,
    notifications,
    resetSettings
  };
});
