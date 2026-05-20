<script setup>
import { ref, nextTick, computed } from "vue";
import { useRoute } from "vue-router";
import { useDataStore } from "../stores/useDataStore";
import { useConfigStore } from "../stores/useConfigStore";
import { storeToRefs } from "pinia";
import { AUTH_LOGIN_HISTORY_KEY, AUTH_SESSION_KEY, getAuthSession } from "../utils/auth";
import { GUIDE_SEEN_KEY } from "../guide/storage";
import { onboardingGuideSteps } from "../guide/steps";
import projectReadmeRaw from "../../README.md?raw";

const dataStore = useDataStore();
const configStore = useConfigStore();
const route = useRoute();
const {
  summary,
  resources,
  detections: allDetections,
  filteredDetections: detections,
  tasks,
  activeTask,
  series,
} = storeToRefs(dataStore);
const {
  confidence,
  iou,
  selectedModel,
  enabledLabels,
  backendIp,
  backendIpHistory,
  streamRtspUrl,
  streamRtspHistory,
  selectedTaskId,
  language,
  autoUpdate,
  notifications,
  theme,
} = storeToRefs(configStore);

const API_URL = "https://api.deepseek.com/v1/chat/completions";
const API_KEY = "sk-a80e71b753ee4f26a41e4f2934d76c12";
const MODEL = "deepseek-chat";

const isOpen = ref(false);
const inputText = ref("");
const messages = ref([]);
const isLoading = ref(false);
const chatBodyRef = ref(null);

const scrollToBottom = async () => {
  await nextTick();
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight;
  }
};

const PROJECT_CAPABILITIES = [
  "登录注册与会话保持",
  "大屏三模式检测：实时流 / 本地视频 / 本地图片",
  "检测结果叠加显示（画框、类别、置信度、坐标）",
  "目标地图联动与姿态参数同步",
  "指标分析看板（mAP、Precision、Recall、FPS、延迟）",
  "历史任务管理（搜索、详情、删除、导出）",
  "配置中心（阈值、类别、地址管理、日志）",
  "帮助中心与新手引导回顾",
];

const KNOWN_FRONTEND_ENDPOINTS = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
  "/detections/latest",
  "/detections/video",
  "/detections/upload",
  "/detections/image",
  "/system/resources",
  "/system/logs",
  "/api/v1/system/logs",
  "/data/allData",
  "/data/tasks",
  "/data/detail",
  "/data/deleteDetail",
  "/map/telemetry",
  "ws://<backend>/stream-detect",
  "ws://<backend>/video-detect",
];

const PAGE_WORKFLOW_MAP = [
  "auth(/auth): register -> login -> session restore -> redirect",
  "dashboard(/dashboard): create task -> pick source(stream/video/image) -> detect -> overlay/table/map update",
  "metrics(/metrics): refresh metrics -> normalize payload -> update charts",
  "tasks(/tasks): create/search/manage task -> sync selected task summary to dashboard",
  "settings(/settings): basic settings + address history + account/security + help center + replay guide",
];

const DASHBOARD_TASK_SUMMARY_KEY = "dashboard_task_summary";
const README_CONTEXT_MAX = 12000;
const MESSAGE_HISTORY_LIMIT = 12;
const PROJECT_STORAGE_KEYS = [
  AUTH_SESSION_KEY,
  AUTH_LOGIN_HISTORY_KEY,
  GUIDE_SEEN_KEY,
  "app_theme",
  "backend_ip",
  "backend_ip_history_v1",
  "stream_rtsp_url_v1",
  "stream_rtsp_history_v1",
  DASHBOARD_TASK_SUMMARY_KEY,
];

const normalizeMultilineText = (value) =>
  String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

const shortenText = (value, maxLength = 260) => {
  const text = String(value ?? "").trim();
  if (!text) return "--";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...(truncated)`;
};

const readReadmeKnowledge = () => {
  const normalized = normalizeMultilineText(projectReadmeRaw);
  if (!normalized) return "README not found.";
  if (normalized.length <= README_CONTEXT_MAX) return normalized;
  return `${normalized.slice(0, README_CONTEXT_MAX)}\n...[README truncated for context budget]`;
};

const readStorageSnapshot = () => {
  if (typeof window === "undefined") return "localStorage unavailable";
  return PROJECT_STORAGE_KEYS.map((key) => {
    const raw = readStorageValue(key, "--");
    return `${key}=${shortenText(raw)}`;
  }).join("\n");
};

const readGuideCatalog = () => {
  if (!Array.isArray(onboardingGuideSteps) || onboardingGuideSteps.length === 0) {
    return "Guide catalog unavailable";
  }
  return onboardingGuideSteps
    .map((item, index) => {
      const id = String(item?.id ?? `step-${index + 1}`);
      const routeName = String(item?.routeName ?? "--");
      const title = String(item?.title ?? "--");
      const usage = shortenText(item?.usage ?? "--", 100);
      return `${index + 1}. [${routeName}] ${id} | ${title} | ${usage}`;
    })
    .join("\n");
};

const toNum = (value, digits = null) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  if (typeof digits === "number") return num.toFixed(digits);
  return String(num);
};

const percentText = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `${num}%`;
};

const limitedItemsText = (list, limit = 8, fallback = "暂无") => {
  if (!Array.isArray(list) || list.length === 0) return fallback;
  const values = list.slice(0, limit).map((item) => String(item ?? "").trim()).filter(Boolean);
  return values.length ? values.join("、") : fallback;
};

const detectionPreviewText = computed(() => {
  const list = Array.isArray(detections.value) ? detections.value : [];
  if (!list.length) return "暂无";
  return list
    .slice(0, 8)
    .map((d, index) => {
      const label = String(d?.label ?? d?.labelKey ?? `目标${index + 1}`).trim();
      const scoreRaw = Number(d?.score ?? d?.confidence);
      const scoreText = Number.isFinite(scoreRaw)
        ? `${Math.round((scoreRaw <= 1 ? scoreRaw : scoreRaw / 100) * 100)}%`
        : "--";
      return `${label}(${scoreText})`;
    })
    .join("、");
});

const tasksPreviewText = computed(() => {
  const list = Array.isArray(tasks.value) ? tasks.value : [];
  if (!list.length) return "暂无任务";
  return list
    .slice(0, 6)
    .map((task, index) => {
      const id = String(task?.taskId ?? task?.id ?? `task-${index + 1}`).trim();
      const name = String(task?.name ?? task?.taskName ?? "--").trim();
      const status = String(task?.status ?? "--").trim();
      const typeLabel = String(task?.taskTypeLabel ?? task?.taskType ?? "--").trim();
      return `${id}/${name}/${typeLabel}/${status}`;
    })
    .join("；");
});

const readStorageValue = (key, fallback = "--") => {
  if (typeof window === "undefined") return fallback;
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

const readDashboardTaskSummary = () => {
  const raw = readStorageValue(DASHBOARD_TASK_SUMMARY_KEY, "");
  if (!raw || raw === "--") return "--";
  try {
    const parsed = JSON.parse(raw);
    const name = String(parsed?.taskName ?? "").trim();
    const scene = String(parsed?.scene ?? "").trim();
    const type = String(parsed?.taskType ?? "").trim();
    if (!name && !scene && !type) return "--";
    return `任务名:${name || "--"} | 场景:${scene || "--"} | 类型:${type || "--"}`;
  } catch {
    return "--";
  }
};

const authUserText = computed(() => {
  const session = getAuthSession();
  if (!session) return "未检测到登录会话";
  const displayName = String(session.displayName ?? session.username ?? session.email ?? "--").trim();
  const username = String(session.username ?? "--").trim();
  const email = String(session.email ?? "--").trim();
  return `displayName=${displayName || "--"} | username=${username || "--"} | email=${email || "--"}`;
});

const getSystemContext = () => {
  const sum = summary.value ?? {};
  const res = resources.value ?? {};
  const currentTask = activeTask.value ?? {};
  const allDet = Array.isArray(allDetections.value) ? allDetections.value : [];
  const enabledLabelText = limitedItemsText(enabledLabels.value, 10, "--");
  const backendHistoryText = limitedItemsText(backendIpHistory.value, 8, "暂无");
  const rtspHistoryText = limitedItemsText(streamRtspHistory.value, 8, "暂无");
  const guideSeen = readStorageValue(GUIDE_SEEN_KEY, "0") === "1" ? "是" : "否";
  const storageSnapshot = readStorageSnapshot();
  const readmeKnowledge = readReadmeKnowledge();
  const guideCatalog = readGuideCatalog();
  const pageWorkflowText = PAGE_WORKFLOW_MAP.map((item) => `- ${item}`).join("\n");

  return `你是“无人机目标检测系统”的内置 AI 助手，名叫“小智”。你的任务是基于当前项目的实时状态回答问题，优先回答“本系统里怎么做、当前状态是什么、下一步怎么操作”。

请遵守以下回答规则：
1) 必须优先使用下方“项目快照”回答，不要编造不存在的页面或功能。
2) 如果用户问题涉及当前状态（任务、地址、检测、配置），先给结论再给操作建议。
3) 如果用户问“在哪里设置/怎么做”，请给出具体页面路径（如：配置 > 基础设置 > 后端和实时流地址管理）。
4) 如果问题超出当前快照可见范围，请明确说明“当前前端快照不可见”，并给排查步骤。
5) 全程使用中文，语气简洁、专业、可执行。

【项目功能总览】
${PROJECT_CAPABILITIES.map((item, i) => `${i + 1}. ${item}`).join("\n")}

【当前项目快照】
- 当前路由: name=${String(route.name ?? "--")} | path=${String(route.fullPath ?? "--")}
- 当前登录用户: ${authUserText.value}
- 引导是否已完成: ${guideSeen}
- 当前模型: ${String(selectedModel.value ?? "--")}
- 置信度阈值: ${toNum(confidence.value, 2)}
- IoU 阈值: ${toNum(iou.value, 2)}
- 当前主题/语言: ${String(theme.value ?? "--")} / ${String(language.value ?? "--")}
- 自动更新: ${autoUpdate.value ? "开启" : "关闭"}
- 通知设置: 声音=${notifications.value?.sound ? "开" : "关"}，弹窗=${notifications.value?.popup ? "开" : "关"}，推送=${notifications.value?.push ? "开" : "关"}，邮件=${notifications.value?.email ? "开" : "关"}
- 后端地址: ${String(backendIp.value ?? "--")}
- 后端地址历史: ${backendHistoryText}
- 当前 RTSP 地址: ${String(streamRtspUrl.value || "--")}
- RTSP 历史: ${rtspHistoryText}
- 当前选中任务 ID: ${String(selectedTaskId.value || "--")}
- 本地任务摘要(dashboard_task_summary): ${readDashboardTaskSummary()}
- 任务总数: ${Array.isArray(tasks.value) ? tasks.value.length : 0}
- 当前活跃任务: 名称=${String(currentTask?.name ?? "--")} | 场景=${String(currentTask?.scene ?? "--")} | 来源=${String(currentTask?.source ?? "--")}
- 检测结果总数(原始/过滤后): ${allDet.length}/${Array.isArray(detections.value) ? detections.value.length : 0}
- 检测结果预览: ${detectionPreviewText.value}
- 任务列表预览: ${tasksPreviewText.value}
- 指标: FPS=${toNum(sum.fps)} | 延迟=${toNum(sum.latency)}ms | Precision=${percentText(sum.precision)} | Recall=${percentText(sum.recall)} | mAP@0.5=${percentText(sum.map50)} | F1=${percentText(sum.f1)}
- 资源: CPU=${percentText(res.cpu)} | GPU=${percentText(res.gpu)} | MEM=${percentText(res.memory)} | TEMP=${toNum(res.temp)}°C
- 类别开关(前10): ${enabledLabelText}
- 图表序列长度: classes=${Array.isArray(series.value?.classes) ? series.value.classes.length : 0}，sceneComparison=${Array.isArray(series.value?.sceneComparison) ? series.value.sceneComparison.length : 0}，prCurve=${Array.isArray(series.value?.prCurve) ? series.value.prCurve.length : 0}

【前端已知接口/通道】
${KNOWN_FRONTEND_ENDPOINTS.map((item) => `- ${item}`).join("\n")}

[page-workflows]
${pageWorkflowText}

[onboarding-guide-catalog]
${guideCatalog}

[project-storage-snapshot]
${storageSnapshot}

[readme-knowledge]
${readmeKnowledge}
`;
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  messages.value.push({ role: "user", content: text });
  inputText.value = "";
  isLoading.value = true;
  scrollToBottom();

  // Build API messages
  const recentMessages = messages.value.slice(-MESSAGE_HISTORY_LIMIT);
  const apiMessages = [
    { role: "system", content: getSystemContext() },
    ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: apiMessages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    // Streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantMsg = { role: "assistant", content: "" };
    messages.value.push(assistantMsg);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            assistantMsg.content += delta;
            scrollToBottom();
          }
        } catch {
          // skip malformed JSON
        }
      }
    }
  } catch (error) {
    messages.value.push({
      role: "assistant",
      content: `抱歉，请求出错了：${error.message}`,
    });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
};

const clearChat = () => {
  messages.value = [];
};

const handleKeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
</script>

<template>
  <!-- Floating Toggle Button -->
  <button
    class="ai-fab"
    data-guide="app.ai-assistant-fab"
    @click="isOpen = !isOpen"
    :class="{ active: isOpen }"
  >
    <svg v-if="!isOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>

  <!-- Chat Window -->
  <Transition name="ai-slide">
    <div v-if="isOpen" class="ai-chat-window">
      <div class="ai-chat-header">
        <div class="ai-chat-title">
          <span class="ai-dot"></span>
          AI 检测助手
        </div>
        <button class="ai-clear-btn" @click="clearChat" title="清空对话">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      <div class="ai-chat-body" ref="chatBodyRef">
        <div v-if="messages.length === 0" class="ai-empty-hint">
          <p>你好！我是 AI 检测助手。</p>
          <p>你可以问我关于系统状态、检测结果、参数调优等问题。</p>
          <div class="ai-quick-questions">
            <button @click="inputText = '当前检测了哪些目标？'; sendMessage()">当前检测了哪些目标？</button>
            <button @click="inputText = '系统资源占用情况如何？'; sendMessage()">系统资源占用如何？</button>
            <button @click="inputText = '如何提高检测精度？'; sendMessage()">如何提高检测精度？</button>
            <button @click="inputText = '请总结这个项目当前都有哪些功能和使用入口'; sendMessage()">项目功能总览</button>
          </div>
        </div>

        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          :class="['ai-msg', msg.role]"
        >
          <div class="ai-msg-bubble">{{ msg.content }}<span v-if="isLoading && idx === messages.length - 1 && msg.role === 'assistant' && !msg.content" class="ai-typing">思考中...</span></div>
        </div>
      </div>

      <div class="ai-chat-footer">
        <textarea
          v-model="inputText"
          class="ai-input"
          placeholder="输入你的问题..."
          rows="1"
          @keydown="handleKeydown"
          :disabled="isLoading"
        ></textarea>
        <button class="ai-send-btn" @click="sendMessage" :disabled="!inputText.trim() || isLoading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>
