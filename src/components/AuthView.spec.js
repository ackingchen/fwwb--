import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import AuthView from "./AuthView.vue";
import {
  fetchAuthSession,
  loginWithBackend,
  registerWithBackend,
} from "../utils/auth";

vi.mock("../utils/auth", () => ({
  fetchAuthSession: vi.fn(async () => null),
  loginWithBackend: vi.fn(async ({ account }) => ({
    user: {
      displayName: account,
      username: account,
      email: "",
    },
  })),
  registerWithBackend: vi.fn(async () => ({ ok: true })),
}));

const DummyDashboard = { template: '<div class="dashboard-page">Dashboard</div>' };
const DummyTasks = { template: '<div class="tasks-page">Tasks</div>' };

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/auth", name: "auth", component: AuthView },
      { path: "/dashboard", name: "dashboard", component: DummyDashboard },
      { path: "/tasks", name: "tasks", component: DummyTasks },
    ],
  });

describe("AuthView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAuthSession.mockResolvedValue(null);
  });

  it("renders login panel by default", async () => {
    const router = createTestRouter();
    router.push("/auth");
    await router.isReady();

    const wrapper = mount(AuthView, {
      global: {
        plugins: [router],
      },
    });

    expect(wrapper.text()).toContain("登录并进入系统");
  });

  it("registers with account/password and switches to login", async () => {
    const router = createTestRouter();
    router.push("/auth");
    await router.isReady();

    const wrapper = mount(AuthView, {
      global: {
        plugins: [router],
      },
    });

    await wrapper.findAll("button")[1].trigger("click");
    const registerInputs = wrapper.findAll("input");
    await registerInputs[0].setValue("pilot");
    await registerInputs[1].setValue("abc12345");
    await registerInputs[2].setValue("abc12345");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(registerWithBackend).toHaveBeenCalledWith({
      account: "pilot",
      password: "abc12345",
    });
    expect(wrapper.text()).toContain("登录并进入系统");
  });

  it("logs in and respects redirect query", async () => {
    const router = createTestRouter();
    router.push("/auth?redirect=/tasks");
    await router.isReady();

    const wrapper = mount(AuthView, {
      global: {
        plugins: [router],
      },
    });

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("operator@example.com");
    await inputs[1].setValue("pass1234");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(loginWithBackend).toHaveBeenCalledWith({
      account: "operator@example.com",
      password: "pass1234",
    });
    expect(router.currentRoute.value.path).toBe("/tasks");
  });
});
