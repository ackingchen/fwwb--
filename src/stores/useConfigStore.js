import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useConfigStore = defineStore('config', () => {
  const BACKEND_IP_STORAGE_KEY = 'backend_ip';
  const BACKEND_IP_HISTORY_STORAGE_KEY = 'backend_ip_history_v1';
  const STREAM_RTSP_URL_STORAGE_KEY = 'stream_rtsp_url_v1';
  const STREAM_RTSP_HISTORY_STORAGE_KEY = 'stream_rtsp_history_v1';
  const THEME_STORAGE_KEY = 'app_theme';
  const DEFAULT_BACKEND_IP = '10.21.204.210:8080';
  const DEFAULT_THEME = 'dark';
  const ADDRESS_HISTORY_LIMIT = 20;
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

  const readStorageArray = (key) => {
    const raw = readStorage(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeStorageArray = (key, list) => {
    writeStorage(key, JSON.stringify(Array.isArray(list) ? list : []));
  };

  const normalizeBackendIp = (value) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const noProtocol = text.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '');
    const [hostPort] = noProtocol.split('/');
    return String(hostPort ?? '').trim();
  };

  const normalizeRtspUrl = (value) => String(value ?? '').trim();

  const pushHistoryValue = (list = [], value = '') => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return [...list];
    const next = [normalized, ...list.filter((item) => item !== normalized)];
    return next.slice(0, ADDRESS_HISTORY_LIMIT);
  };

  // Backend API IP Management (persisted to localStorage)
  const savedIp = normalizeBackendIp(readStorage(BACKEND_IP_STORAGE_KEY)) || DEFAULT_BACKEND_IP;
  const backendIp = ref(savedIp);
  const backendIpHistory = ref(
    pushHistoryValue(readStorageArray(BACKEND_IP_HISTORY_STORAGE_KEY), savedIp),
  );

  const setBackendIp = (ip) => {
    const normalized = normalizeBackendIp(ip);
    if (!normalized) return;
    backendIp.value = normalized;
    writeStorage(BACKEND_IP_STORAGE_KEY, normalized);
    backendIpHistory.value = pushHistoryValue(backendIpHistory.value, normalized);
    writeStorageArray(BACKEND_IP_HISTORY_STORAGE_KEY, backendIpHistory.value);
  };

  const useBackendIp = (ip) => {
    setBackendIp(ip);
  };

  const removeBackendIp = (ip) => {
    const normalized = normalizeBackendIp(ip);
    if (!normalized) return;
    const filtered = backendIpHistory.value.filter((item) => item !== normalized);
    backendIpHistory.value = filtered.length ? filtered : [DEFAULT_BACKEND_IP];
    writeStorageArray(BACKEND_IP_HISTORY_STORAGE_KEY, backendIpHistory.value);
    if (backendIp.value === normalized) {
      const next = backendIpHistory.value[0] || DEFAULT_BACKEND_IP;
      backendIp.value = next;
      writeStorage(BACKEND_IP_STORAGE_KEY, next);
    }
  };

  const httpBase = computed(() => `http://${backendIp.value}`);
  const wsBase = computed(() => `ws://${backendIp.value}`);

  // Stream RTSP address management (persisted to localStorage)
  const savedRtspUrl = normalizeRtspUrl(readStorage(STREAM_RTSP_URL_STORAGE_KEY));
  const streamRtspUrl = ref(savedRtspUrl);
  const streamRtspHistory = ref(
    pushHistoryValue(readStorageArray(STREAM_RTSP_HISTORY_STORAGE_KEY), savedRtspUrl),
  );

  const setStreamRtspUrl = (url, { saveHistory = true } = {}) => {
    const normalized = normalizeRtspUrl(url);
    streamRtspUrl.value = normalized;
    writeStorage(STREAM_RTSP_URL_STORAGE_KEY, normalized);
    if (!saveHistory || !normalized) return;
    streamRtspHistory.value = pushHistoryValue(streamRtspHistory.value, normalized);
    writeStorageArray(STREAM_RTSP_HISTORY_STORAGE_KEY, streamRtspHistory.value);
  };

  const useStreamRtspUrl = (url) => {
    setStreamRtspUrl(url, { saveHistory: true });
  };

  const removeStreamRtspUrl = (url) => {
    const normalized = normalizeRtspUrl(url);
    if (!normalized) return;
    streamRtspHistory.value = streamRtspHistory.value.filter((item) => item !== normalized);
    writeStorageArray(STREAM_RTSP_HISTORY_STORAGE_KEY, streamRtspHistory.value);
    if (streamRtspUrl.value === normalized) {
      const next = streamRtspHistory.value[0] || '';
      streamRtspUrl.value = next;
      writeStorage(STREAM_RTSP_URL_STORAGE_KEY, next);
    }
  };

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
    backendIpHistory,
    useBackendIp,
    removeBackendIp,
    httpBase,
    wsBase,
    streamRtspUrl,
    streamRtspHistory,
    setStreamRtspUrl,
    useStreamRtspUrl,
    removeStreamRtspUrl,
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
