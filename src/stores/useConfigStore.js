import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useConfigStore = defineStore('config', () => {
  // Detection Settings
  const confidence = ref(0.62);
  const iou = ref(0.48);
  const selectedModel = ref('YOLOv11-lite');
  const enabledLabels = ref(['person', 'vehicle', 'animal', 'facility']);
  
  // Mock active task selection
  const selectedTaskId = ref('task-001');

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
    enabledLabels.value = ['person', 'vehicle', 'animal', 'facility'];
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
