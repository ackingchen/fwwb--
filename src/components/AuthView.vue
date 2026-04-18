<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  fetchAuthSession,
  loginWithBackend,
  registerWithBackend,
} from "../utils/auth";

const router = useRouter();
const route = useRoute();

const activeTab = ref("login");
const submitting = ref(false);
const noticeText = ref("");
const noticeType = ref("info");

const loginForm = reactive({
  account: "",
  password: "",
});

const registerForm = reactive({
  account: "",
  password: "",
  confirmPassword: "",
});

const projectStats = [
  { value: "3+", label: "检测接入模式" },
  { value: "4", label: "核心业务模块" },
  { value: "10", label: "目标类别标签" },
  { value: "24h", label: "日志追踪视图" },
];

const projectModules = [
  {
    title: "实时检测大屏",
    desc: "集中展示画面流、检测框、地图态势与资源状态，支持运行过程中的快速监控与告警定位。",
  },
  {
    title: "指标统计分析",
    desc: "对识别数量、类别占比与趋势变化进行图表化汇总，帮助快速评估识别质量与系统负载。",
  },
  {
    title: "任务与日志管理",
    desc: "支持任务创建、状态跟踪与关键日志回溯，便于后续复盘排查和流程优化。",
  },
  {
    title: "系统配置中心",
    desc: "可在线调整置信度、IoU 阈值和连接参数，实现模型结果和业务策略的快速迭代。",
  },
];

const projectFlow = [
  {
    title: "数据接入",
    detail: "接入 RTSP 实时流、本地视频或图片文件，统一进入识别链路。",
  },
  {
    title: "在线识别",
    detail: "执行模型推理与阈值过滤，实时输出目标类别、置信度与位置框。",
  },
  {
    title: "态势呈现",
    detail: "在大屏和地图联动展示目标状态，并同步系统资源和连接健康度。",
  },
  {
    title: "结果沉淀",
    detail: "记录任务过程与系统日志，为训练调优和业务复盘提供依据。",
  },
];

const cardTitle = computed(() =>
  activeTab.value === "login" ? "欢迎回来" : "创建账号",
);

const safeRedirectPath = computed(() => {
  const redirect = route.query.redirect;
  if (typeof redirect !== "string") return "/dashboard";
  if (!redirect.startsWith("/")) return "/dashboard";
  if (redirect === "/auth") return "/dashboard";
  return redirect;
});

function setNotice(message, type = "info") {
  noticeText.value = message;
  noticeType.value = type;
}

function switchTab(tab) {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  setNotice("");
}

async function jumpToSystem() {
  await router.replace(safeRedirectPath.value);
}

async function submitLogin() {
  if (submitting.value) return;
  submitting.value = true;
  setNotice("");

  try {
    const result = await loginWithBackend(loginForm);
    const displayName = result?.user?.displayName || result?.user?.username || "用户";
    setNotice(`登录成功，欢迎 ${displayName}`, "success");
    await jumpToSystem();
  } catch (error) {
    setNotice(error?.message || "登录失败，请稍后重试", "error");
  } finally {
    submitting.value = false;
  }
}

async function submitRegister() {
  if (submitting.value) return;
  submitting.value = true;
  setNotice("");

  if (!registerForm.account.trim()) {
    setNotice("请输入账号", "error");
    submitting.value = false;
    return;
  }

  if (registerForm.password !== registerForm.confirmPassword) {
    setNotice("两次输入的密码不一致", "error");
    submitting.value = false;
    return;
  }

  try {
    await registerWithBackend({
      account: registerForm.account,
      password: registerForm.password,
    });
    setNotice("注册成功，请使用账号和密码登录", "success");
    loginForm.account = registerForm.account.trim();
    activeTab.value = "login";
  } catch (error) {
    setNotice(error?.message || "注册失败，请稍后重试", "error");
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  const existingSession = await fetchAuthSession();
  if (existingSession) {
    await jumpToSystem();
  }
});
</script>

<template>
  <div class="auth-page">
    <div class="auth-glow glow-a"></div>
    <div class="auth-glow glow-b"></div>
    <div class="auth-grid">
      <section class="auth-hero">
        <p class="hero-tag reveal" style="--delay: 50ms">PROJECT OVERVIEW</p>
        <h1 class="reveal" style="--delay: 110ms">无人机目标检测系统</h1>
        <p class="hero-subtitle reveal" style="--delay: 170ms">
          本项目围绕低空巡检与目标识别业务构建，提供从多源输入、在线识别、态势展示到任务沉淀的完整全栈工作台，
          适用于目标筛选，任务执行，低空监测。
        </p>

        <div class="hero-metrics">
          <article
            v-for="(item, index) in projectStats"
            :key="item.label"
            class="metric-pill reveal"
            :style="{ '--delay': `${230 + index * 60}ms` }"
          >
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </article>
        </div>

        <div class="hero-cards">
          <article
            v-for="(item, index) in projectModules"
            :key="item.title"
            class="intro-card reveal"
            :style="{ '--delay': `${430 + index * 70}ms` }"
          >
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </article>
        </div>

        <div class="hero-flow reveal" style="--delay: 700ms">
          <h4>核心处理链路</h4>
          <div class="flow-track">
            <div
              v-for="(step, index) in projectFlow"
              :key="step.title"
              class="flow-step"
            >
              <div class="flow-index">{{ String(index + 1).padStart(2, "0") }}</div>
              <div class="flow-body">
                <strong>{{ step.title }}</strong>
                <p>{{ step.detail }}</p>
              </div>
            </div>
          </div>
        </div>

      </section>

      <section class="auth-card">
        <header class="auth-card-header">
          <h2>{{ cardTitle }}</h2>
        </header>

        <div class="auth-tabs">
          <button
            type="button"
            :class="['tab-btn', { active: activeTab === 'login' }]"
            @click="switchTab('login')"
          >
            登录
          </button>
          <button
            type="button"
            :class="['tab-btn', { active: activeTab === 'register' }]"
            @click="switchTab('register')"
          >
            注册
          </button>
        </div>

        <form
          v-if="activeTab === 'login'"
          class="auth-form"
          @submit.prevent="submitLogin"
        >
          <label class="field">
            <span>账号</span>
            <input
              v-model.trim="loginForm.account"
              type="text"
              autocomplete="username email"
              placeholder="请输入账号"
            />
          </label>
          <label class="field">
            <span>密码</span>
            <input
              v-model="loginForm.password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
            />
          </label>
          <button class="submit-btn" type="submit" :disabled="submitting">
            {{ submitting ? "登录中..." : "登录并进入系统" }}
          </button>
        </form>

        <form v-else class="auth-form" @submit.prevent="submitRegister">
          <label class="field">
            <span>账号</span>
            <input
              v-model.trim="registerForm.account"
              type="text"
              autocomplete="username"
              placeholder="请输入账号"
            />
          </label>
          <label class="field">
            <span>密码</span>
            <input
              v-model="registerForm.password"
              type="password"
              autocomplete="new-password"
              placeholder="至少 6 位密码"
            />
          </label>
          <label class="field">
            <span>确认密码</span>
            <input
              v-model="registerForm.confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="再次输入密码"
            />
          </label>
          <button class="submit-btn" type="submit" :disabled="submitting">
            {{ submitting ? "注册中..." : "完成注册" }}
          </button>
        </form>

        <p v-if="noticeText" :class="['auth-notice', noticeType]">
          {{ noticeText }}
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  position: relative;
  min-height: 100vh;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 14% 18%, rgba(60, 138, 255, 0.42), transparent 40%),
    radial-gradient(circle at 86% 80%, rgba(51, 218, 191, 0.35), transparent 44%),
    linear-gradient(130deg, #03172f 0%, #04284a 52%, #0a3554 100%);
  font-family: "SF Pro Display", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  isolation: isolate;
}

.auth-page::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 72% 28%, rgba(107, 175, 255, 0.14), transparent 32%),
    radial-gradient(circle at 28% 72%, rgba(64, 216, 186, 0.12), transparent 34%);
  animation: scenePulse 13s ease-in-out infinite;
}

.auth-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(62px);
  opacity: 0.66;
  pointer-events: none;
  animation: floatGlow 9s ease-in-out infinite;
}

.glow-a {
  width: 340px;
  height: 340px;
  left: -80px;
  top: 14%;
  background: #2f74ff;
}

.glow-b {
  width: 420px;
  height: 420px;
  right: -120px;
  bottom: -20px;
  background: #2bc9a9;
  animation-delay: -3s;
}

.auth-grid {
  position: relative;
  z-index: 1;
  width: min(1220px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.22fr) minmax(360px, 0.92fr);
  gap: 34px;
  align-items: start;
}

.auth-hero {
  padding: 16px 6px;
  color: #f5fbff;
  display: grid;
  align-content: start;
  gap: 14px;
}

.hero-tag {
  margin: 0;
  display: inline-flex;
  width: fit-content;
  padding: 8px 13px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.22);
  font-size: 12px;
  letter-spacing: 0.11em;
}

.auth-hero h1 {
  margin: 0;
  font-size: clamp(34px, 4.3vw, 54px);
  line-height: 1.08;
  letter-spacing: 0.01em;
  text-wrap: balance;
  text-shadow: 0 8px 28px rgba(5, 15, 38, 0.45);
}

.hero-subtitle {
  margin: 2px 0 0;
  max-width: 620px;
  color: rgba(237, 246, 255, 0.85);
  line-height: 1.72;
  font-size: 15px;
}

.hero-metrics {
  margin-top: 2px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.metric-pill {
  min-height: 74px;
  padding: 12px 11px;
  border-radius: 14px;
  border: 1px solid rgba(173, 211, 255, 0.2);
  background: linear-gradient(
    150deg,
    rgba(19, 53, 93, 0.75),
    rgba(17, 62, 93, 0.5)
  );
  display: grid;
  align-content: center;
  gap: 3px;
  transition: transform 0.25s ease, border-color 0.25s ease;
}

.metric-pill:hover {
  transform: translateY(-2px);
  border-color: rgba(170, 230, 255, 0.42);
}

.metric-pill strong {
  font-size: 24px;
  letter-spacing: 0.01em;
  color: #ffffff;
}

.metric-pill span {
  font-size: 12px;
  color: rgba(226, 241, 255, 0.78);
}

.hero-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.intro-card {
  position: relative;
  overflow: hidden;
  min-height: 112px;
  border-radius: 16px;
  border: 1px solid rgba(148, 214, 255, 0.22);
  background: linear-gradient(
    145deg,
    rgba(18, 51, 90, 0.75),
    rgba(9, 33, 66, 0.62)
  );
  padding: 14px 14px 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transition: transform 0.22s ease, border-color 0.22s ease;
}

.intro-card::after {
  content: "";
  position: absolute;
  left: 14px;
  top: 0;
  width: 50px;
  height: 2px;
  background: linear-gradient(90deg, #73bbff, #69f4ce);
}

.intro-card:hover {
  transform: translateY(-2px);
  border-color: rgba(145, 226, 251, 0.45);
}

.intro-card h3 {
  margin: 0;
  font-size: 15px;
  color: #edf7ff;
}

.intro-card p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.58;
  color: rgba(220, 238, 255, 0.78);
}

.hero-flow {
  border-radius: 16px;
  border: 1px solid rgba(157, 207, 255, 0.21);
  background: linear-gradient(
    145deg,
    rgba(13, 39, 74, 0.72),
    rgba(10, 35, 64, 0.58)
  );
  padding: 15px 16px;
}

.hero-flow h4 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(238, 247, 255, 0.92);
}

.flow-track {
  display: grid;
  gap: 9px;
}

.flow-step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.flow-index {
  width: 34px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(142, 221, 255, 0.32);
  background: rgba(114, 188, 255, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #bfe5ff;
  flex: 0 0 auto;
}

.flow-body {
  position: relative;
  padding-top: 1px;
}

.flow-body strong {
  display: block;
  font-size: 13px;
  color: #edf7ff;
}

.flow-body p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(214, 234, 252, 0.75);
}

.hero-note {
  margin-top: 2px;
  padding: 0 2px;
  color: rgba(237, 246, 255, 0.65);
  font-size: 13px;
  line-height: 1.5;
}

.auth-card {
  position: relative;
  overflow: hidden;
  align-self: center;
  opacity: 0;
  transform: translateY(14px);
  animation: revealUp 0.75s cubic-bezier(0.22, 0.61, 0.36, 1) 260ms forwards;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: linear-gradient(
    150deg,
    rgba(255, 255, 255, 0.22),
    rgba(255, 255, 255, 0.08)
  );
  box-shadow:
    0 26px 50px rgba(2, 14, 35, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(16px);
  padding: 30px;
  color: #f5fbff;
}

.auth-card::before {
  content: "";
  position: absolute;
  inset: -30% -20%;
  background: linear-gradient(
    115deg,
    transparent 35%,
    rgba(152, 227, 255, 0.12) 45%,
    transparent 58%
  );
  animation: cardSweep 8s linear infinite;
  pointer-events: none;
}

.auth-card-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.auth-card-header h2 {
  margin: 0;
  font-size: 28px;
}

.auth-card-header span {
  font-size: 13px;
  color: rgba(245, 251, 255, 0.75);
}

.auth-tabs {
  position: relative;
  margin-top: 22px;
  padding: 4px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-radius: 12px;
  background: rgba(5, 20, 40, 0.4);
}

.tab-btn {
  height: 42px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(245, 251, 255, 0.74);
  background: transparent;
  transition: all 0.22s ease;
}

.tab-btn.active {
  color: #07213d;
  font-weight: 600;
  background: linear-gradient(135deg, #59a2ff, #5ce4c3);
  box-shadow: 0 8px 18px rgba(52, 171, 238, 0.24);
}

.auth-form {
  position: relative;
  margin-top: 18px;
  display: grid;
  gap: 14px;
}

.field {
  display: grid;
  gap: 6px;
}

.field span {
  font-size: 13px;
  color: rgba(245, 251, 255, 0.8);
}

.field input {
  width: 100%;
  height: 42px;
  border-radius: 11px;
  border: 1px solid rgba(245, 251, 255, 0.3);
  background: rgba(2, 16, 32, 0.38);
  color: #f5fbff;
  outline: none;
  padding: 0 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.field input::placeholder {
  color: rgba(245, 251, 255, 0.42);
}

.field input:focus {
  border-color: rgba(94, 163, 255, 0.95);
  box-shadow: 0 0 0 3px rgba(94, 163, 255, 0.2);
}

.submit-btn {
  margin-top: 2px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  color: #06203b;
  background: linear-gradient(135deg, #57a4ff, #5be7c5);
  box-shadow: 0 14px 28px rgba(7, 95, 171, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.003);
  box-shadow: 0 16px 30px rgba(7, 95, 171, 0.45);
}

.submit-btn:disabled {
  opacity: 0.68;
  cursor: not-allowed;
}

.auth-notice {
  margin: 12px 2px 0;
  font-size: 13px;
  position: relative;
  z-index: 2;
}

.auth-notice.success {
  color: #75ffd1;
}

.auth-notice.error {
  color: #ffbab1;
}

@keyframes revealUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes floatGlow {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(0, -14px, 0) scale(1.04);
  }
}

@keyframes scenePulse {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(1);
  }
  50% {
    opacity: 0.96;
    transform: scale(1.04);
  }
}

@keyframes cardSweep {
  0% {
    transform: translateX(-52%) rotate(0deg);
  }
  100% {
    transform: translateX(52%) rotate(0deg);
  }
}

.reveal {
  opacity: 0;
  transform: translateY(14px);
  animation: revealUp 0.72s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  animation-delay: var(--delay, 0ms);
}

@media (max-width: 1150px) {
  .auth-grid {
    grid-template-columns: minmax(0, 1.12fr) minmax(336px, 0.9fr);
    gap: 22px;
  }

  .hero-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 920px) {
  .auth-page {
    padding: 16px;
  }

  .auth-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .auth-hero {
    padding: 10px 2px 0;
  }

  .auth-hero h1 {
    font-size: clamp(30px, 10vw, 44px);
  }

  .hero-subtitle {
    max-width: none;
  }

  .hero-cards {
    grid-template-columns: 1fr;
  }

  .hero-flow {
    padding: 14px;
  }

  .auth-card {
    align-self: start;
    padding: 22px 18px;
    border-radius: 18px;
  }

  .auth-card-header h2 {
    font-size: 24px;
  }
}

@media (max-width: 560px) {
  .auth-page {
    padding: 12px;
  }

  .metric-pill {
    min-height: 66px;
    padding: 10px;
  }

  .metric-pill strong {
    font-size: 20px;
  }

  .auth-card-header {
    align-items: center;
  }

  .auth-card-header span {
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reveal,
  .auth-card,
  .auth-glow,
  .auth-page::before,
  .auth-card::before {
    animation: none !important;
    transform: none !important;
    opacity: 1 !important;
  }
}
</style>
