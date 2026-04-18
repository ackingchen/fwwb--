import axios from "axios";

export const AUTH_ENDPOINTS = Object.freeze({
  register: "/api/auth/register",
  login: "/api/auth/login",
  session: "/api/auth/session",
  logout: "/api/auth/logout",
});
export const AUTH_SESSION_KEY = "uav_auth_session_v1";

const authHttp = axios.create({
  withCredentials: true,
  timeout: 12000,
});

const SESSION_STATE = {
  loaded: false,
  user: null,
};

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function toTrimmedText(value) {
  return String(value ?? "").trim();
}

function makeValidationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  return error;
}

function isValidationError(error) {
  return error?.code === "VALIDATION_ERROR";
}

function readMessageFromError(error, fallback = "请求失败，请稍后重试") {
  const payload = error?.response?.data;
  const candidate =
    payload?.message ??
    payload?.msg ??
    payload?.error ??
    error?.message ??
    "";
  const text = toTrimmedText(candidate);
  return text || fallback;
}

function toAuthUser(payload) {
  const source =
    payload?.user ??
    payload?.data?.user ??
    payload?.data ??
    payload ??
    null;
  if (!source || typeof source !== "object") return null;

  const username = toTrimmedText(
    source.username ?? source.account ?? source.userName ?? source.email,
  );
  const email = toTrimmedText(source.email ?? source.mail);
  const displayName = toTrimmedText(
    source.displayName ??
      source.nickname ??
      source.name ??
      username ??
      email,
  );
  const uid = toTrimmedText(source.id ?? source.userId ?? source.uid);

  if (!displayName && !username && !email) return null;
  return {
    id: uid,
    username: username || email,
    email,
    displayName: displayName || username || email,
  };
}

function readSessionFromStorage() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return toAuthUser(parsed);
  } catch {
    return null;
  }
}

function writeSessionToStorage(user) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (!user) {
      storage.removeItem(AUTH_SESSION_KEY);
      return;
    }
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
  } catch {
    // Ignore storage failures.
  }
}

function setSession(user) {
  SESSION_STATE.loaded = true;
  SESSION_STATE.user = user ? { ...user } : null;
  writeSessionToStorage(SESSION_STATE.user);
  return SESSION_STATE.user;
}

function setSessionFromPayload(payload) {
  const parsedUser = toAuthUser(payload);
  return setSession(parsedUser);
}

export function getAuthSession() {
  return SESSION_STATE.user ? { ...SESSION_STATE.user } : null;
}

export function clearAuthSession() {
  setSession(null);
}

export async function fetchAuthSession({ force = false } = {}) {
  if (SESSION_STATE.loaded && !force) {
    return getAuthSession();
  }

  const localSession = readSessionFromStorage();
  if (localSession && !force) {
    return setSession(localSession);
  }

  try {
    const { data } = await authHttp.get(AUTH_ENDPOINTS.session);
    const user = setSessionFromPayload(data) || (localSession ? setSession(localSession) : null);
    return user;
  } catch {
    if (localSession) {
      return setSession(localSession);
    }
    clearAuthSession();
    return null;
  }
}

export async function registerWithBackend({ account, password }) {
  const normalizedAccount = toTrimmedText(account);
  const normalizedPassword = String(password ?? "");

  if (!normalizedAccount) {
    throw makeValidationError("请输入账号");
  }
  if (normalizedPassword.length < 6) {
    throw makeValidationError("密码至少需要 6 位");
  }

  try {
    const { data } = await authHttp.post(AUTH_ENDPOINTS.register, {
      account: normalizedAccount,
      password: normalizedPassword,
    });
    return data;
  } catch (error) {
    if (isValidationError(error)) {
      throw error;
    }
    // Temporary competition fallback: backend register API unavailable.
    return {
      ok: true,
      mock: true,
      account: normalizedAccount,
    };
  }
}

export async function loginWithBackend({ account, password }) {
  const normalizedAccount = toTrimmedText(account);
  const normalizedPassword = String(password ?? "");

  if (!normalizedAccount || !normalizedPassword) {
    throw makeValidationError("请输入账号和密码");
  }

  try {
    const { data } = await authHttp.post(AUTH_ENDPOINTS.login, {
      account: normalizedAccount,
      password: normalizedPassword,
    });

    const user =
      setSessionFromPayload(data) ||
      setSession({
        id: "",
        username: normalizedAccount,
        email: "",
        displayName: normalizedAccount,
      });

    return {
      user,
      data,
    };
  } catch (error) {
    if (isValidationError(error)) {
      throw error;
    }
    // Temporary competition fallback: allow login when backend is not ready.
    const user = setSession({
      id: "",
      username: normalizedAccount,
      email: "",
      displayName: normalizedAccount,
    });
    return {
      user,
      data: {
        ok: true,
        mock: true,
      },
      message: readMessageFromError(error, "后端未就绪，已进入演示登录模式"),
    };
  }
}

export async function logoutFromBackend() {
  try {
    await authHttp.post(AUTH_ENDPOINTS.logout);
  } catch {
    // Ignore backend logout failures and clear frontend cache anyway.
  } finally {
    clearAuthSession();
  }
}
