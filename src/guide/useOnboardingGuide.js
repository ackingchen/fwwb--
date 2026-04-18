import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onboardingGuideSteps } from "./steps";
import {
  hasCompletedOnboardingGuide,
  markOnboardingGuideCompleted,
} from "./storage";

const TARGET_QUERY_TIMEOUT = 4000;
const TARGET_QUERY_INTERVAL = 80;
const SCROLL_SETTLE_DELAY = 220;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTargetElement(selector) {
  const start = Date.now();
  while (Date.now() - start < TARGET_QUERY_TIMEOUT) {
    const element = document.querySelector(selector);
    if (element) return element;
    await sleep(TARGET_QUERY_INTERVAL);
  }
  return document.querySelector(selector);
}

function readRectFromElement(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function useOnboardingGuide({ route, router, isAuthRoute }) {
  const isGuideIntroVisible = ref(false);
  const isGuideVisible = ref(false);
  const currentStepIndex = ref(0);
  const currentTargetRect = ref(null);
  const autoCheckDone = ref(false);
  const pageMounted = ref(false);
  const resolvingTarget = ref(false);
  const currentTargetElement = ref(null);

  let resolveToken = 0;
  let targetResizeObserver = null;

  const totalSteps = onboardingGuideSteps.length;
  const currentStep = computed(() => onboardingGuideSteps[currentStepIndex.value] || null);

  function clearTargetObserver() {
    if (!targetResizeObserver) return;
    targetResizeObserver.disconnect();
    targetResizeObserver = null;
  }

  function bindTargetObserver(target) {
    clearTargetObserver();
    if (!target) return;
    if (typeof ResizeObserver !== "undefined") {
      targetResizeObserver = new ResizeObserver(() => {
        currentTargetRect.value = readRectFromElement(currentTargetElement.value);
      });
      targetResizeObserver.observe(target);
    }
  }

  function clearCurrentTarget() {
    currentTargetElement.value = null;
    currentTargetRect.value = null;
    clearTargetObserver();
  }

  function updateTargetRect() {
    if (!isGuideVisible.value || !currentTargetElement.value) {
      currentTargetRect.value = null;
      return;
    }
    currentTargetRect.value = readRectFromElement(currentTargetElement.value);
  }

  async function ensureStepRoute(step) {
    if (!step?.routeName) return;
    if (route.name === step.routeName) return;
    await router.push({ name: step.routeName });
  }

  async function resolveCurrentStepTarget({ scrollIntoView = true } = {}) {
    if (!isGuideVisible.value || !currentStep.value) return;
    const token = ++resolveToken;
    resolvingTarget.value = true;

    try {
      const step = currentStep.value;
      await ensureStepRoute(step);
      await nextTick();
      const target = await waitForTargetElement(step.selector);
      if (!isGuideVisible.value || token !== resolveToken) return;

      if (!target) {
        clearCurrentTarget();
        return;
      }

      currentTargetElement.value = target;
      bindTargetObserver(target);
      if (scrollIntoView) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        await sleep(SCROLL_SETTLE_DELAY);
      }
      updateTargetRect();
    } finally {
      if (token === resolveToken) {
        resolvingTarget.value = false;
      }
    }
  }

  function stopGuide() {
    resolveToken += 1;
    isGuideVisible.value = false;
    clearCurrentTarget();
  }

  function finishGuide() {
    markOnboardingGuideCompleted();
    stopGuide();
  }

  function startGuide() {
    if (isAuthRoute.value || totalSteps === 0) return;
    isGuideIntroVisible.value = false;
    isGuideVisible.value = true;
    currentStepIndex.value = 0;
    resolveCurrentStepTarget({ scrollIntoView: true });
  }

  function openGuideIntro() {
    if (isAuthRoute.value || totalSteps === 0) return;
    isGuideVisible.value = false;
    isGuideIntroVisible.value = true;
  }

  function maybeStartGuide() {
    if (!pageMounted.value || autoCheckDone.value || isAuthRoute.value) return;
    autoCheckDone.value = true;
    if (!hasCompletedOnboardingGuide()) {
      openGuideIntro();
    }
  }

  function startGuideFromIntro() {
    startGuide();
  }

  function skipGuideFromIntro() {
    finishGuide();
    isGuideIntroVisible.value = false;
  }

  function nextGuideStep() {
    if (!isGuideVisible.value) return;
    if (currentStepIndex.value >= totalSteps - 1) {
      finishGuide();
      return;
    }
    currentStepIndex.value += 1;
  }

  function skipGuide() {
    finishGuide();
  }

  function onWindowChanged() {
    updateTargetRect();
  }

  watch(
    () => currentStep.value?.id,
    () => {
      if (!isGuideVisible.value) return;
      resolveCurrentStepTarget({ scrollIntoView: true });
    },
  );

  watch(
    () => route.fullPath,
    () => {
      if (!isGuideVisible.value) return;
      resolveCurrentStepTarget({ scrollIntoView: false });
    },
  );

  watch(
    isAuthRoute,
    (authRoute) => {
      if (authRoute) {
        // Entering auth route should reset the one-time auto check.
        // Otherwise a pre-login redirect can consume the check and skip guide after login.
        autoCheckDone.value = false;
        isGuideIntroVisible.value = false;
        stopGuide();
        return;
      }
      nextTick(() => {
        maybeStartGuide();
      });
    },
    { immediate: true },
  );

  onMounted(() => {
    pageMounted.value = true;
    maybeStartGuide();
    window.addEventListener("resize", onWindowChanged);
    window.addEventListener("scroll", onWindowChanged, true);
  });

  onUnmounted(() => {
    resolveToken += 1;
    clearCurrentTarget();
    window.removeEventListener("resize", onWindowChanged);
    window.removeEventListener("scroll", onWindowChanged, true);
  });

  return {
    isGuideIntroVisible,
    isGuideVisible,
    currentGuideStep: currentStep,
    currentGuideStepIndex: currentStepIndex,
    totalGuideSteps: totalSteps,
    currentGuideTargetRect: currentTargetRect,
    startGuideFromIntro,
    skipGuideFromIntro,
    nextGuideStep,
    skipGuide,
    maybeStartGuide,
    startGuide,
  };
}
