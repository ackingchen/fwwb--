import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../components/DashboardView.vue";
import MetricsView from "../components/MetricsView.vue";
import TasksView from "../components/TasksView.vue";
import SettingsView from "../components/SettingsView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/dashboard",
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

export default router;
