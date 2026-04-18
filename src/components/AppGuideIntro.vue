<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["start", "skip"]);

const fullMessage =
  "你好呀，我是小智，也是本系统的智能 AI。欢迎来到无人机目标检测系统，在这里你可以快速完成任务创建、视频/图片检测、地图定位、指标分析和日志追踪。别担心操作复杂，我会像你的小队友一样一路陪你，接下来我将为你指引本系统如何使用。";

const typedMessage = ref("");
const isTypingDone = ref(false);

let typingTimer = null;

function stopTyping() {
  if (!typingTimer) return;
  clearInterval(typingTimer);
  typingTimer = null;
}

function startTyping() {
  stopTyping();
  typedMessage.value = "";
  isTypingDone.value = false;
  let index = 0;
  typingTimer = setInterval(() => {
    index += 1;
    typedMessage.value = fullMessage.slice(0, index);
    if (index >= fullMessage.length) {
      stopTyping();
      isTypingDone.value = true;
    }
  }, 26);
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      stopTyping();
      return;
    }
    startTyping();
  },
  { immediate: true },
);

const cursorVisible = computed(() => props.visible && !isTypingDone.value);

onBeforeUnmount(() => {
  stopTyping();
});
</script>

<template>
  <div v-if="visible" class="guide-intro-overlay" role="dialog" aria-modal="true">
    <section class="guide-intro-card">
      <div class="guide-intro-avatar-wrap">
        <div class="guide-intro-avatar">
          <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <rect x="12" y="14" width="40" height="34" rx="12" fill="#2f7dff" />
            <circle cx="25" cy="31" r="4.5" fill="#eaf3ff" />
            <circle cx="39" cy="31" r="4.5" fill="#eaf3ff" />
            <rect x="26" y="40" width="12" height="3.5" rx="1.75" fill="#eaf3ff" />
            <rect x="30.5" y="7" width="3" height="8" rx="1.5" fill="#91bfff" />
            <circle cx="32" cy="7" r="3.2" fill="#62a5ff" />
          </svg>
        </div>
      </div>

      <h3 class="guide-intro-title">小智上线啦</h3>
      <p class="guide-intro-typed">
        {{ typedMessage }}
        <span v-if="cursorVisible" class="typing-cursor">|</span>
      </p>

      <div class="guide-intro-actions">
        <button class="guide-intro-btn ghost" type="button" @click="emit('skip')">
          跳过引导
        </button>
        <button class="guide-intro-btn primary" type="button" @click="emit('start')">
          开始指引
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.guide-intro-overlay {
  position: fixed;
  inset: 0;
  z-index: 7200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(6, 14, 30, 0.72);
  backdrop-filter: blur(3px);
}

.guide-intro-card {
  position: relative;
  width: min(560px, 92vw);
  border-radius: 20px;
  border: 1px solid rgba(118, 173, 255, 0.52);
  background: linear-gradient(165deg, rgba(12, 26, 52, 0.98), rgba(10, 21, 44, 0.96));
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.5);
  padding: 72px 24px 22px;
  color: #e8f2ff;
}

.guide-intro-avatar-wrap {
  position: absolute;
  left: 50%;
  top: -36px;
  transform: translateX(-50%);
}

.guide-intro-avatar {
  width: 72px;
  height: 72px;
  border-radius: 999px;
  padding: 10px;
  background:
    radial-gradient(circle at 32% 28%, rgba(176, 211, 255, 0.95), rgba(111, 164, 255, 0.9)),
    #2f7dff;
  border: 2px solid rgba(209, 228, 255, 0.9);
  box-shadow: 0 10px 28px rgba(33, 102, 229, 0.45);
}

.guide-intro-title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 22px;
  letter-spacing: 0.02em;
}

.guide-intro-typed {
  margin: 0;
  min-height: 112px;
  line-height: 1.75;
  font-size: 14px;
  color: rgba(231, 242, 255, 0.95);
}

.typing-cursor {
  margin-left: 2px;
  color: #95c5ff;
  animation: blinkCursor 0.8s steps(1, end) infinite;
}

.guide-intro-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.guide-intro-btn {
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.guide-intro-btn:hover {
  transform: translateY(-1px);
}

.guide-intro-btn.ghost {
  background: rgba(144, 170, 214, 0.23);
  color: #d8e8ff;
}

.guide-intro-btn.primary {
  background: linear-gradient(135deg, #2f7dff, #4f96ff);
  color: #f5f9ff;
  box-shadow: 0 10px 24px rgba(43, 114, 237, 0.34);
}

@keyframes blinkCursor {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

@media (max-width: 680px) {
  .guide-intro-card {
    padding: 68px 16px 18px;
  }

  .guide-intro-typed {
    min-height: 138px;
    font-size: 13px;
  }
}
</style>
