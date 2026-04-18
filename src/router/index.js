import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../components/DashboardView.vue";
import MetricsView from "../components/MetricsView.vue";
import TasksView from "../components/TasksView.vue";
import SettingsView from "../components/SettingsView.vue";
import AuthView from "../components/AuthView.vue";
import { fetchAuthSession } from "../utils/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/dashboard",
    },
    {
      path: "/auth",
      name: "auth",
      component: AuthView,
      meta: {
        public: true,
      },
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: DashboardView,
    },
    {
      path: "/metrics",
      name: "metrics",
      component: MetricsView,
    },
    {
      path: "/tasks",
      name: "tasks",
      component: TasksView,
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsView,
    },
  ],
});

router.beforeEach(async (to) => {
  const currentSession = await fetchAuthSession();
  const sessionExists = Boolean(currentSession);
  const isPublicRoute = Boolean(to.meta?.public);

  if (!isPublicRoute && !sessionExists) {
    return {
      name: "auth",
      query: {
        redirect: to.fullPath,
      },
    };
  }

  if (to.name === "auth" && sessionExists) {
    const redirect = typeof to.query.redirect === "string" ? to.query.redirect : "";
    if (redirect.startsWith("/") && redirect !== "/auth") {
      return redirect;
    }
    return { name: "dashboard" };
  }

  return true;
});

export default router;
