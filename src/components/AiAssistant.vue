<script setup>
import { ref, nextTick, computed } from "vue";
import { useDataStore } from "../stores/useDataStore";
import { useConfigStore } from "../stores/useConfigStore";
import { storeToRefs } from "pinia";

const dataStore = useDataStore();
const configStore = useConfigStore();
const { summary, resources, filteredDetections: detections } = storeToRefs(dataStore);
const { confidence, iou, selectedModel } = storeToRefs(configStore);

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

const getSystemContext = () => {
  const det = detections.value;
  const res = resources.value;
  const sum = summary.value;
  const numText = (value, suffix = "") => {
    const num = Number(value);
    return Number.isFinite(num) ? `${num}${suffix}` : "--";
  };

  return `你是无人机目标检测系统的 AI 助手，名叫"检测助手"。你需要根据系统当前状态回答用户的问题，提供专业、简洁的回答。

当前系统状态：
- 使用模型: ${selectedModel.value}
- 置信度阈值: ${confidence.value.toFixed(2)}
- IoU 阈值: ${iou.value.toFixed(2)}
- 当前检测目标数: ${det.length}
- 检测目标详情: ${det.map((d) => `${d.label}(${Math.round(d.score * 100)}%)`).join("、") || "暂无"}
- FPS: ${numText(sum.fps)}
- 推理延迟: ${numText(sum.latency, "ms")}
- Precision: ${numText(sum.precision, "%")}
- Recall: ${numText(sum.recall, "%")}
- mAP@0.5: ${numText(sum.map50, "%")}
- F1 Score: ${numText(sum.f1, "%")}
- CPU 使用率: ${numText(res.cpu, "%")}
- GPU 使用率: ${numText(res.gpu, "%")}
- 内存使用率: ${numText(res.memory, "%")}
- GPU 温度: ${numText(res.temp, "°C")}

请用中文回答，保持简洁专业。如果用户问的问题与系统无关，也可以正常回答。`;
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  messages.value.push({ role: "user", content: text });
  inputText.value = "";
  isLoading.value = true;
  scrollToBottom();

  // Build API messages
  const apiMessages = [
    { role: "system", content: getSystemContext() },
    ...messages.value.map((m) => ({ role: m.role, content: m.content })),
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
