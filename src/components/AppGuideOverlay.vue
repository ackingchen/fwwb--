<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps({
  step: {
    type: Object,
    default: null,
  },
  stepIndex: {
    type: Number,
    required: true,
  },
  totalSteps: {
    type: Number,
    required: true,
  },
  targetRect: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["next", "skip"]);

const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 0);
const viewportHeight = ref(typeof window !== "undefined" ? window.innerHeight : 0);

const SPOTLIGHT_PADDING = 8;
const PANEL_WIDTH = 340;
const PANEL_GAP = 18;
const SAFE_GAP = 16;

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function updateViewport() {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
}

const holeRect = computed(() => {
  const rect = props.targetRect;
  if (!rect) return null;
  const left = clamp(rect.left - SPOTLIGHT_PADDING, 0, viewportWidth.value);
  const top = clamp(rect.top - SPOTLIGHT_PADDING, 0, viewportHeight.value);
  const right = clamp(rect.left + rect.width + SPOTLIGHT_PADDING, 0, viewportWidth.value);
  const bottom = clamp(rect.top + rect.height + SPOTLIGHT_PADDING, 0, viewportHeight.value);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  if (width === 0 || height === 0) return null;
  return { top, left, right, bottom, width, height };
});

const shieldTopStyle = computed(() => ({
  left: "0px",
  top: "0px",
  width: `${viewportWidth.value}px`,
  height: `${holeRect.value?.top ?? viewportHeight.value}px`,
}));

const shieldLeftStyle = computed(() => {
  if (!holeRect.value) return { display: "none" };
  return {
    left: "0px",
    top: `${holeRect.value.top}px`,
    width: `${holeRect.value.left}px`,
    height: `${holeRect.value.height}px`,
  };
});

const shieldRightStyle = computed(() => {
  if (!holeRect.value) return { display: "none" };
  return {
    left: `${holeRect.value.right}px`,
    top: `${holeRect.value.top}px`,
    width: `${Math.max(0, viewportWidth.value - holeRect.value.right)}px`,
    height: `${holeRect.value.height}px`,
  };
});

const shieldBottomStyle = computed(() => ({
  left: "0px",
  top: `${holeRect.value?.bottom ?? 0}px`,
  width: `${viewportWidth.value}px`,
  height: `${Math.max(0, viewportHeight.value - (holeRect.value?.bottom ?? 0))}px`,
}));

const spotlightStyle = computed(() => {
  if (!holeRect.value) return { display: "none" };
  return {
    top: `${holeRect.value.top}px`,
    left: `${holeRect.value.left}px`,
    width: `${holeRect.value.width}px`,
    height: `${holeRect.value.height}px`,
  };
});

const panelStyle = computed(() => {
  if (!holeRect.value) {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: `${PANEL_WIDTH}px`,
    };
  }

  const preferredRight = holeRect.value.right + PANEL_GAP;
  const preferredLeft = holeRect.value.left - PANEL_GAP - PANEL_WIDTH;
  const canPlaceRight = preferredRight + PANEL_WIDTH <= viewportWidth.value - SAFE_GAP;
  const canPlaceLeft = preferredLeft >= SAFE_GAP;

  let left = canPlaceRight ? preferredRight : canPlaceLeft ? preferredLeft : SAFE_GAP;
  left = clamp(left, SAFE_GAP, Math.max(SAFE_GAP, viewportWidth.value - PANEL_WIDTH - SAFE_GAP));

  const rawTop = holeRect.value.top;
  const maxTop = Math.max(SAFE_GAP, viewportHeight.value - 236);
  const top = clamp(rawTop, SAFE_GAP, maxTop);

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${PANEL_WIDTH}px`,
  };
});

const isLastStep = computed(() => props.stepIndex >= props.totalSteps - 1);

onMounted(() => {
  updateViewport();
  window.addEventListener("resize", updateViewport);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateViewport);
});
</script>

<template>
  <div class="guide-overlay" role="dialog" aria-modal="true">
    <div class="guide-shield" :style="shieldTopStyle"></div>
    <div class="guide-shield" :style="shieldLeftStyle"></div>
    <div class="guide-shield" :style="shieldRightStyle"></div>
    <div class="guide-shield" :style="shieldBottomStyle"></div>

    <div class="guide-spotlight" :style="spotlightStyle"></div>

    <section class="guide-panel" :style="panelStyle">
      <div class="guide-progress">
        <span>功能指引</span>
        <strong>{{ stepIndex + 1 }} / {{ totalSteps }}</strong>
      </div>

      <h4 class="guide-title">{{ step?.title || "功能介绍" }}</h4>
      <p class="guide-text">{{ step?.description || "请按步骤完成系统功能导览。" }}</p>
      <p class="guide-tip">使用方式：{{ step?.usage || "查看高亮模块后，点击下一步继续。" }}</p>

      <div class="guide-actions">
        <button class="guide-btn secondary" type="button" @click="emit('skip')">
          跳过
        </button>
        <button class="guide-btn primary" type="button" @click="emit('next')">
          {{ isLastStep ? "完成" : "下一步" }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 7000;
}

.guide-shield {
  position: fixed;
  background: rgba(4, 10, 20, 0.72);
  backdrop-filter: blur(1px);
  pointer-events: auto;
}

.guide-spotlight {
  position: fixed;
  border-radius: 14px;
  border: 2px solid rgba(96, 164, 255, 0.98);
  box-shadow:
    0 0 0 1px rgba(142, 190, 255, 0.55),
    0 0 0 8px rgba(96, 164, 255, 0.12),
    0 0 22px rgba(96, 164, 255, 0.45);
  animation: guidePulse 1.6s ease-in-out infinite;
  pointer-events: none;
}

.guide-panel {
  position: fixed;
  z-index: 7010;
  border-radius: 16px;
  border: 1px solid rgba(110, 167, 255, 0.48);
  background: linear-gradient(180deg, rgba(15, 26, 50, 0.96), rgba(10, 19, 38, 0.96));
  box-shadow: 0 22px 48px rgba(0, 0, 0, 0.44);
  padding: 16px 16px 14px;
  color: #e7f0ff;
  pointer-events: auto;
}

.guide-progress {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
  color: rgba(224, 236, 255, 0.78);
}

.guide-progress strong {
  font-size: 12px;
  color: #8ec2ff;
}

.guide-title {
  margin: 0 0 10px;
  font-size: 18px;
  line-height: 1.3;
}

.guide-text {
  margin: 0 0 8px;
  line-height: 1.55;
  font-size: 13px;
  color: rgba(230, 240, 255, 0.9);
}

.guide-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(167, 197, 238, 0.95);
}

.guide-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.guide-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.guide-btn:hover {
  transform: translateY(-1px);
}

.guide-btn.secondary {
  background: rgba(144, 166, 204, 0.23);
  color: #d8e6ff;
}

.guide-btn.primary {
  background: linear-gradient(135deg, #2f7dff, #4f96ff);
  color: #f5f9ff;
  box-shadow: 0 10px 24px rgba(43, 114, 237, 0.35);
}

@keyframes guidePulse {
  0%,
  100% {
    box-shadow:
      0 0 0 1px rgba(142, 190, 255, 0.55),
      0 0 0 8px rgba(96, 164, 255, 0.12),
      0 0 22px rgba(96, 164, 255, 0.45);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(164, 204, 255, 0.72),
      0 0 0 10px rgba(96, 164, 255, 0.16),
      0 0 30px rgba(96, 164, 255, 0.62);
  }
}

@media (max-width: 900px) {
  .guide-panel {
    width: min(92vw, 340px) !important;
    left: 50% !important;
    top: auto !important;
    bottom: 16px;
    transform: translateX(-50%);
  }
}
</style>
