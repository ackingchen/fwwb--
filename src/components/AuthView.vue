<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  createLocalAccount,
  getStoredAccounts,
  hasAuthSession,
  setAuthSession,
  validateAccountLogin,
} from "../utils/auth";

const router = useRouter();
const route = useRoute();

const activeTab = ref("login");
const submitting = ref(false);
const noticeText = ref("");
const noticeType = ref("info");
const accountCount = ref(0);

const loginForm = reactive({
  username: "",
  password: "",
});

const registerForm = reactive({
  username: "",
  password: "",
  confirmPassword: "",
});

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

function refreshAccountCount() {
  accountCount.value = getStoredAccounts().length;
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

  const result = validateAccountLogin(loginForm);
  if (!result.ok) {
    setNotice(result.message, "error");
    submitting.value = false;
    return;
  }

  setAuthSession(result.account.username);
  setNotice(`登录成功，欢迎 ${result.account.username}`, "success");
  submitting.value = false;
  await jumpToSystem();
}

async function submitRegister() {
  if (submitting.value) return;
  submitting.value = true;
  setNotice("");

  if (registerForm.password !== registerForm.confirmPassword) {
    setNotice("两次输入的密码不一致", "error");
    submitting.value = false;
    return;
  }

  const result = createLocalAccount({
    username: registerForm.username,
    password: registerForm.password,
  });

  if (!result.ok) {
    setNotice(result.message, "error");
    submitting.value = false;
    return;
  }

  refreshAccountCount();
  setAuthSession(result.account.username);
  setNotice(`注册成功，已自动登录为 ${result.account.username}`, "success");
  submitting.value = false;
  await jumpToSystem();
}

onMounted(async () => {
  refreshAccountCount();
  if (hasAuthSession()) {
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
        <p class="hero-tag">UAV DETECTION PLATFORM</p>
        <h1>无人机目标检测系统</h1>
        <p class="hero-subtitle">
          登录后即可进入实时检测大屏、指标统计、任务管理和系统配置模块。
        </p>
        <div class="hero-points">
          <div class="hero-point">
            <span class="point-dot"></span>
            <span>支持本地账号注册与登录</span>
          </div>
          <div class="hero-point">
            <span class="point-dot"></span>
            <span>登录状态持久化保存，下次进入自动识别</span>
          </div>
          <div class="hero-point">
            <span class="point-dot"></span>
            <span>移动端与桌面端均可使用</span>
          </div>
        </div>
        <p class="hero-note">提示：账号和登录状态仅保存在当前浏览器本地。</p>
      </section>

      <section class="auth-card">
        <header class="auth-card-header">
          <h2>{{ cardTitle }}</h2>
          <span>本地账号 {{ accountCount }} 个</span>
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
            <span>用户名</span>
            <input
              v-model.trim="loginForm.username"
              type="text"
              autocomplete="username"
              placeholder="请输入用户名"
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
            <span>用户名</span>
            <input
              v-model.trim="registerForm.username"
              type="text"
              autocomplete="username"
              placeholder="至少 3 个字符"
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
            {{ submitting ? "注册中..." : "注册并自动登录" }}
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
    radial-gradient(circle at 20% 18%, rgba(55, 128, 253, 0.4), transparent 36%),
    radial-gradient(circle at 84% 82%, rgba(57, 216, 195, 0.34), transparent 42%),
    linear-gradient(135deg, #021830 0%, #032445 50%, #082f4d 100%);
  font-family: "SF Pro Display", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.auth-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(62px);
  opacity: 0.62;
  pointer-events: none;
}

.glow-a {
  width: 300px;
  height: 300px;
  left: -80px;
  top: 12%;
  background: #3076ff;
}

.glow-b {
  width: 380px;
  height: 380px;
  right: -120px;
  bottom: 0;
  background: #2bc9a9;
}

.auth-grid {
  position: relative;
  z-index: 1;
  width: min(1040px, 100%);
  display: grid;
  grid-template-columns: 1.2fr 0.95fr;
  gap: 28px;
  align-items: stretch;
}

.auth-hero {
  padding: 34px 16px;
  color: #f5fbff;
}

.hero-tag {
  margin: 0;
  display: inline-flex;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 12px;
  letter-spacing: 0.1em;
}

.auth-hero h1 {
  margin: 18px 0 10px;
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.14;
  letter-spacing: 0.01em;
}

.hero-subtitle {
  margin: 0;
  max-width: 520px;
  color: rgba(237, 246, 255, 0.85);
  line-height: 1.68;
  font-size: 15px;
}

.hero-points {
  margin-top: 24px;
  display: grid;
  gap: 14px;
}

.hero-point {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 14px;
}

.point-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5ea3ff, #43e0bf);
  box-shadow: 0 0 16px rgba(67, 224, 191, 0.7);
}

.hero-note {
  margin-top: 30px;
  color: rgba(237, 246, 255, 0.65);
  font-size: 13px;
}

.auth-card {
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.2);
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

.auth-card-header {
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
}

.auth-form {
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
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(7, 95, 171, 0.45);
}

.submit-btn:disabled {
  opacity: 0.68;
  cursor: not-allowed;
}

.auth-notice {
  margin: 12px 2px 0;
  font-size: 13px;
}

.auth-notice.success {
  color: #75ffd1;
}

.auth-notice.error {
  color: #ffbab1;
}

@media (max-width: 920px) {
  .auth-page {
    padding: 16px;
  }

  .auth-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .auth-hero {
    padding: 12px 6px 2px;
  }

  .auth-card {
    padding: 22px 18px;
    border-radius: 18px;
  }

  .auth-card-header h2 {
    font-size: 24px;
  }
}
</style>
