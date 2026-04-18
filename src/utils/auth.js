export const AUTH_ACCOUNTS_KEY = "uav_local_accounts_v1";
export const AUTH_SESSION_KEY = "uav_auth_session_v1";

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage ?? null;
}

function readJson(key, fallbackValue) {
  const storage = getStorage();
  if (!storage) return fallbackValue;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeUsername(value) {
  return String(value ?? "").trim();
}

function normalizePassword(value) {
  return String(value ?? "");
}

function sanitizeAccount(value) {
  if (!value || typeof value !== "object") return null;
  const username = normalizeUsername(value.username);
  const password = normalizePassword(value.password);
  if (!username || !password) return null;
  return {
    username,
    password,
    createdAt: String(value.createdAt ?? ""),
  };
}

export function getStoredAccounts() {
  const list = readJson(AUTH_ACCOUNTS_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => sanitizeAccount(item))
    .filter((item) => item !== null);
}

export function createLocalAccount({ username, password }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);

  if (normalizedUsername.length < 3) {
    return { ok: false, message: "用户名至少需要 3 个字符" };
  }
  if (normalizedPassword.length < 6) {
    return { ok: false, message: "密码至少需要 6 位" };
  }

  const accounts = getStoredAccounts();
  const isDuplicated = accounts.some(
    (item) => item.username.toLowerCase() === normalizedUsername.toLowerCase(),
  );
  if (isDuplicated) {
    return { ok: false, message: "用户名已存在，请直接登录" };
  }

  const createdAccount = {
    username: normalizedUsername,
    password: normalizedPassword,
    createdAt: new Date().toISOString(),
  };
  const nextAccounts = [createdAccount, ...accounts];
  writeJson(AUTH_ACCOUNTS_KEY, nextAccounts);

  return { ok: true, account: createdAccount };
}

export function validateAccountLogin({ username, password }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);
  if (!normalizedUsername || !normalizedPassword) {
    return { ok: false, message: "请输入用户名和密码" };
  }

  const accounts = getStoredAccounts();
  const matchedAccount = accounts.find(
    (item) =>
      item.username.toLowerCase() === normalizedUsername.toLowerCase() &&
      item.password === normalizedPassword,
  );

  if (!matchedAccount) {
    return { ok: false, message: "账号或密码错误" };
  }

  return { ok: true, account: matchedAccount };
}

export function setAuthSession(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  const nextSession = {
    username: normalizedUsername,
    loginAt: new Date().toISOString(),
  };
  writeJson(AUTH_SESSION_KEY, nextSession);
  return nextSession;
}

export function getAuthSession() {
  const session = readJson(AUTH_SESSION_KEY, null);
  if (!session || typeof session !== "object") return null;
  const username = normalizeUsername(session.username);
  if (!username) return null;
  return {
    username,
    loginAt: String(session.loginAt ?? ""),
  };
}

export function hasAuthSession() {
  return Boolean(getAuthSession());
}

export function clearAuthSession() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore storage failures
  }
}
