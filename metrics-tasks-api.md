# 后端 API 开发需求文档 —— 指标与任务模块专项

## 1. 模块概述
本文档专门针对无人机目标检测系统中的 **指标（Metrics）** 与 **任务（Tasks）** 模块，基于前端全量数据结构（包括 ECharts 图表渲染所需的多维度分析数据）进行了极度详细的提炼与规范。该文档是后端开发、数据库设计以及数据统计分析作业的**唯一执行标准**。

---

## 2. API 接口详细需求列表

### 2.1 指标模块 (Metrics)
本模块不仅提供基础统计，还需支持深度可视化图表所需的高维数据（如 P-R 曲线、场景鲁棒性对比等）。

| 业务功能描述 | 请求方法 | 请求路径 | 鉴权 | 限流策略 |
| :--- | :--- | :--- | :--- | :--- |
| **获取目标检测核心指标概览**<br>包含 19 项核心数据（FPS, mAP, 延迟, 吞吐量等） | `GET` | `/api/v1/metrics/summary` | Bearer Token | 100 次/分钟 |
| **获取指标系列与分析趋势**<br>获取用于图表渲染的多维数组（P-R曲线、类别表现、场景对比等） | `GET` | `/api/v1/metrics/series` | Bearer Token | 60 次/分钟 |

### 2.2 任务模块 (Tasks)
负责历史视频流或批处理任务的生命周期管理。

| 业务功能描述 | 请求方法 | 请求路径 | 鉴权 | 限流策略 |
| :--- | :--- | :--- | :--- | :--- |
| **分页获取任务列表**<br>包含任务状态、来源、创建时间及基础运行指标 | `GET` | `/api/v1/tasks` | Bearer Token | 60 次/分钟 |
| **获取指定任务详情**<br>获取单一任务的详细配置与完整执行日志 | `GET` | `/api/v1/tasks/{taskId}` | Bearer Token | 100 次/分钟 |
| **创建新检测任务**<br>下发 RTSP/视频文件处理任务 | `POST` | `/api/v1/tasks` | Bearer Token | 10 次/分钟 |

---

## 3. 接口出参规范与全量字段定义 (JSON 结构)

### 3.1 获取目标检测核心指标概览 (`GET /api/v1/metrics/summary`)

该接口要求后端提供**极其详尽**的聚合统计数据，出参结构必须严格包含以下所有字段：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "precision": 91.6,       // 整体精确率 (百分比，误报控制能力)
    "recall": 88.2,          // 整体召回率 (百分比，目标发现能力)
    "map50": 82.4,           // 平均精度均值 (IoU=0.5)
    "map75": 74.8,           // 平均精度均值 (IoU=0.75，更严格)
    "map5095": 68.3,         // mAP @ [0.5:0.95] 综合指标
    "f1": 89.8,              // F1 Score
    "fps": 27.8,             // 实时推理帧率
    "latency": 36,           // 端到端推理时延 (ms)
    "jitter": 4.6,           // 时延抖动范围 (ms)
    "throughput": 946,       // 吞吐量 (每分钟处理目标数)
    "falseAlarmRate": 6.1,   // 误报率 (%)
    "missRate": 4.4,         // 漏检率 (%)
    "stability": 97.2,       // 系统运行稳定性百分比
    "totalFrames": 28450,    // 累计分析的总帧数
    "totalTargets": 9623,    // 累计检测到的目标总数
    "totalWarnings": 438,    // 累计触发的告警总数
    "activeTargets": 4,      // 当前画面中的活跃目标数
    "avgScore": 86.2,        // 平均检测置信度得分 (%)
    "avgInference": 28.9     // 平均单帧推理耗时 (ms)
  }
}
```

---

### 3.2 获取指标系列与分析趋势 (`GET /api/v1/metrics/series`)

此接口的数据结构最为复杂，包含 7 个维度的数组数据，供前端 ECharts 渲染使用：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    // 1. 类别表现分布 (用于甜甜圈图与分类雷达)
    "classes": [
      { "name": "人员", "value": 89, "precision": 93.2, "recall": 90.4, "f1": 91.8, "support": 1250, "missRate": 2.1, "falseAlarm": 3.4 },
      { "name": "车辆", "value": 84, "precision": 89.1, "recall": 86.3, "f1": 87.7, "support": 840, "missRate": 4.5, "falseAlarm": 5.1 }
    ],
    
    // 2. 多场景鲁棒性对比 (用于漏斗图或对比柱状图)
    "sceneComparison": [
      { "scene": "城市", "precision": 92.4, "recall": 89.1, "map50": 85.2, "fps": 29.5, "latency": 34, "warningRate": 12.5, "samples": 5400 },
      { "scene": "夜间", "precision": 85.1, "recall": 81.3, "map50": 76.8, "fps": 30.1, "latency": 33, "warningRate": 18.2, "samples": 3200 }
    ],

    // 3. P-R 曲线点集 (二维数组: [Recall, Precision])
    "prCurve": [
      [0.0, 1.0], [0.1, 0.99], [0.5, 0.95], [0.8, 0.88], [0.95, 0.65], [1.0, 0.1]
    ],

    // 4. IoU 阈值趋势 (不同重叠率要求下的表现)
    "iouMetrics": [
      { "iou": "0.50", "map": 82.4, "precision": 91.6, "recall": 88.2 },
      { "iou": "0.75", "map": 74.8, "precision": 88.5, "recall": 82.1 }
    ],

    // 5. 实时性能波动趋势 (数组长度固定，如最近 60 秒)
    "fpsTrend": [27.8, 28.1, 27.5, 29.0, 27.8],
    "latencyTrend": [36, 35, 38, 34, 36],

    // 6. 置信度阈值敏感性分析
    "confidenceBands": [
      { "threshold": 0.25, "precision": 75.2, "recall": 95.1, "f1": 84.0 },
      { "threshold": 0.50, "precision": 88.5, "recall": 89.2, "f1": 88.8 }
    ],

    // 7. 分时检测质量 (用于热力图或柱状图)
    "hourlyQuality": [
      { "period": "09:00-10:00", "targets": 1250, "warnings": 45, "avgScore": 88.5, "map50": 83.2 },
      { "period": "10:00-11:00", "targets": 1420, "warnings": 62, "avgScore": 87.1, "map50": 81.5 }
    ]
  }
}
```

---

### 3.3 任务列表分页查询 (`GET /api/v1/tasks`)

**入参结构 (Query Params)**:
| 字段名 | 必填 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | 否 | Integer | 当前页码，默认 1 |
| `size` | 否 | Integer | 每页条数，默认 20，最大 100 |
| `status` | 否 | String | 状态过滤: `running` 或 `finished` |

**出参结构 (Response)**:
每个任务对象必须包含完整的状态与基础性能指标。
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 45,
    "page": 1,
    "size": 20,
    "list": [
      {
        "id": "T-240311-01",
        "name": "秦岭林区搜救巡检",
        "scene": "山地",
        "source": "drone-cam-01",
        "createdAt": "2026-03-11 14:31:00",
        "targetCount": 18,      // 任务累计检测目标数
        "warningCount": 3,      // 任务累计触发告警数
        "fps": 28.1,            // 任务平均运行帧率
        "map50": 83.1,          // 任务平均检测精度
        "status": "running"     // 状态枚举: running, finished
      }
    ]
  }
}
```

---

## 4. 后端技术实现与性能约束

### 4.1 数据聚合与缓存策略 (关键)
鉴于 `metrics/summary` 和 `metrics/series` 包含大量高维度的统计运算（如计算所有样本的 P-R 曲线、不同场景的 mAP），**严禁在每次 HTTP 请求时直接对业务全量表执行 `GROUP BY` 或 `COUNT` 等聚合查询。**
- **解决方案要求**：
  1. 必须引入 Redis 或 ClickHouse 构建实时统计视图。
  2. 采用**定时离线计算 + 实时增量更新**的架构：P-R 曲线、IoU 趋势等复杂图表数据建议每 5~15 分钟通过定时任务（如 XXL-JOB）计算并写入缓存；`totalFrames`、`activeTargets` 等计数器可利用 Redis 的 `INCR` 指令实时维护。

### 4.2 联动过滤约束
- 前端会维护全局的 `confidence`（置信度阈值）和 `enabledLabels`（启用类别）。
- 虽然当前前端具备二次过滤能力，但在查询任务历史统计（如 `targetCount`, `warningCount`）时，后端 API 应当支持接收这些 Query 参数进行**动态过滤计算**，以保证前后端数据展示的严谨性与一致性。

---

## 5. 单元测试与 Mock 数据验收规范

1. **浮点数精度控制**：所有返回的浮点数指标（如百分比、帧率），后端序列化时必须**统一保留 1 位小数**（P-R 曲线坐标除外，可保留 2 位），避免前端出现超长尾数。
2. **状态机测试**：针对 Task 模块，单元测试必须覆盖任务从 `pending -> running -> finished / failed` 的完整状态机流转。
3. **空边界处理**：当系统处于初始化状态（无任何检测数据）时，`metrics/series` 下的所有数组必须返回空数组 `[]`，严禁返回 `null` 或抛出空指针异常，确保前端 ECharts 不报错。
