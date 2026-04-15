<script setup>
import { useDataStore } from '../stores/useDataStore';
import { useConfigStore } from '../stores/useConfigStore';
import { storeToRefs } from 'pinia';

const dataStore = useDataStore();
const configStore = useConfigStore();

const { tasks } = storeToRefs(dataStore);
const { selectedTaskId } = storeToRefs(configStore);

function selectTask(id) {
  selectedTaskId.value = id;
}
</script>

<template>
  <section class="panel tasks-panel">
    <div class="panel-header">
      <h3>历史任务</h3>
      <span class="pill">共 {{ tasks.length }} 条</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>任务名称</th>
            <th>场景</th>
            <th>输入源</th>
            <th>时间</th>
            <th>目标数</th>
            <th>FPS</th>
            <th>mAP</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in tasks"
            :key="task.id"
            :class="{ selected: task.id === selectedTaskId }"
            @click="selectTask(task.id)"
          >
            <td>{{ task.name }}</td>
            <td>{{ task.scene }}</td>
            <td>{{ task.source }}</td>
            <td>{{ task.createdAt }}</td>
            <td>{{ task.targetCount }}</td>
            <td>{{ task.fps }}</td>
            <td>{{ task.map50 }}%</td>
            <td><span :class="['pill', task.status]">{{ task.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
