import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import AuthView from "./AuthView.vue";
import { AUTH_ACCOUNTS_KEY, AUTH_SESSION_KEY } from "../utils/auth";

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
    window.localStorage.removeItem(AUTH_ACCOUNTS_KEY);
    window.localStorage.removeItem(AUTH_SESSION_KEY);
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

  it("registers account and auto logs in", async () => {
    const router = createTestRouter();
    router.push("/auth");
    await router.isReady();

    const wrapper = mount(AuthView, {
      global: {
        plugins: [router],
      },
    });

    await wrapper.findAll("button")[1].trigger("click");
    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("pilot");
    await inputs[1].setValue("abc12345");
    await inputs[2].setValue("abc12345");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/dashboard");
    const session = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY));
    const accounts = JSON.parse(window.localStorage.getItem(AUTH_ACCOUNTS_KEY));
    expect(session.username).toBe("pilot");
    expect(accounts[0].username).toBe("pilot");
  });

  it("logs in and respects redirect query", async () => {
    window.localStorage.setItem(
      AUTH_ACCOUNTS_KEY,
      JSON.stringify([
        {
          username: "operator",
          password: "pass1234",
          createdAt: new Date().toISOString(),
        },
      ]),
    );

    const router = createTestRouter();
    router.push("/auth?redirect=/tasks");
    await router.isReady();

    const wrapper = mount(AuthView, {
      global: {
        plugins: [router],
      },
    });

    const inputs = wrapper.findAll("input");
    await inputs[0].setValue("operator");
    await inputs[1].setValue("pass1234");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(router.currentRoute.value.path).toBe("/tasks");
  });
});
