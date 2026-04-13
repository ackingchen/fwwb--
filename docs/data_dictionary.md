# UAV 目标检测系统 - 数据字典与业务指标口径规范

## 目录

1. [数据项清单 (物理表/实体映射)](#1-数据项清单)
2. [业务含义说明与场景示例](#2-业务含义说明与场景示例)
3. [计算逻辑与派生指标口径](#3-计算逻辑与派生指标口径)
4. [维度表与统一枚举规范](#4-维度表与统一枚举规范)

---

## 1. 数据项清单

### 1.1 目标检测结果实体 (`DetectionResult`)

来源: `DashboardView.vue` 中 WebSocket 或 HTTP 请求返回的实时数据解析逻辑。
存储模型单次推理后输出的识别框与分类数据。

| 字段英文名             | 字段中文名 | 数据类型     | 长度/精度 | 主键 | 可空 | 默认值   | 枚举值及含义                                      |
| :--------------------- | :--------- | :----------- | :-------- | :--- | :--- | :------- | :------------------------------------------------ |
| `id`                   | 检测结果ID | String       | 64        | 是   | 否   | 无       | 唯一 UUID 或 自增哈希                             |
| `labelKey`             | 分类标识键 | String       | 32        | 否   | 否   | 无       | 对应系统预设的检测分类键值，如 `person` (见4.1)   |
| `label`                | 分类显示名 | String       | 32        | 否   | 否   | 无       | UI 面板及 Canvas 框上直接展示的名字               |
| `score` / `confidence` | 置信度     | Float        | (2,4)     | 否   | 否   | 无       | `0.00` ~ `1.00`，表示模型认为该目标为真的概率     |
| `bbox`                 | 边界框坐标 | Array[Float] | 4         | 否   | 否   | 无       | `[x1, y1, x2, y2]`，原始视频流/图像的绝对像素坐标 |
| `timestamp`            | 检测时间戳 | Float        | (8,3)     | 否   | 是   | 无       | 视频流场景中特有，记录当前帧相对视频起始点的秒数  |
| `level`                | 告警级别   | String       | 16        | 否   | 否   | `normal` | 结合业务规则衍生的告警级别，如 `danger`/`warning` |

### 1.2 历史任务/视频处理任务实体 (`VideoTask`)

来源: `TasksView.vue` 及对应 Store 数据模型，用于展示历史及当前的视频/离线检测任务。

| 字段英文名     | 字段中文名    | 数据类型        | 长度/精度 | 主键 | 可空 | 默认值    | 枚举值及含义                                     |
| :------------- | :------------ | :-------------- | :-------- | :--- | :--- | :-------- | :----------------------------------------------- |
| `id`           | 任务ID        | String          | 64        | 是   | 否   | 无        | 任务唯一标识                                     |
| `name`         | 任务名称      | String          | 128       | 否   | 否   | 无        | 例如："秦岭林区搜救巡检"                         |
| `scene`        | 业务场景      | String          | 32        | 否   | 否   | `城市`    | 表示数据采集的场景环境，如 `山地`/`农田` (见4.4) |
| `source`       | 输入源/媒体源 | String          | 64        | 否   | 否   | 无        | 例如摄像头编号 `drone-cam-01` 或 本地文件名      |
| `createdAt`    | 创建时间      | Datetime/String | 0         | 否   | 否   | 无        | 格式 `YYYY-MM-DD HH:mm`                          |
| `targetCount`  | 目标总数      | Integer         | 8         | 否   | 否   | 0         | 任务运行至今累计检测出的所有目标总数             |
| `warningCount` | 告警数        | Integer         | 8         | 否   | 否   | 0         | 其中被判定为 `danger` 或 `warning` 的总数        |
| `fps`          | 平均FPS       | Float           | (4,1)     | 否   | 否   | 0.0       | 该任务整体运行的平均帧率                         |
| `map50`        | 综合准确率    | Float           | (3,2)     | 否   | 否   | 0.0       | 针对该任务验证的 mAP@0.5 精度(百分比)            |
| `status`       | 任务状态      | String          | 16        | 否   | 否   | `pending` | `running`/`finished`/`error` (见4.3)             |

### 1.3 性能与质量指标实体 (`MetricsSummary`)

来源: `MetricsView.vue` 中渲染的核心指标（Core Metrics）及 KPI 栏位，反映整个系统的宏观运行状态。

| 字段英文名       | 字段中文名      | 数据类型 | 长度/精度 | 主键 | 可空 | 默认值 | 枚举值及含义                      |
| :--------------- | :-------------- | :------- | :-------- | :--- | :--- | :----- | :-------------------------------- |
| `precision`      | 准确率(%)       | Float    | (3,2)     | 否   | 否   | 0.00   | Precision, 误报控制能力           |
| `recall`         | 召回率(%)       | Float    | (3,2)     | 否   | 否   | 0.00   | Recall, 目标召回能力              |
| `map50`          | mAP@0.5(%)      | Float    | (3,2)     | 否   | 否   | 0.00   | 目标定位准确率                    |
| `map75`          | mAP@0.75(%)     | Float    | (3,2)     | 否   | 否   | 0.00   | 严格 IoU 指标下的准确率           |
| `map5095`        | mAP@0.5:0.95(%) | Float    | (3,2)     | 否   | 否   | 0.00   | 综合检测能力评估                  |
| `f1`             | F1 Score(%)     | Float    | (3,2)     | 否   | 否   | 0.00   | 精确率与召回率的调和平均值        |
| `fps`            | 实时推理帧率    | Float    | (4,1)     | 否   | 否   | 0.0    | 每秒处理的帧数                    |
| `latency`        | 端到端时延(ms)  | Integer  | 4         | 否   | 否   | 0      | 从推流到结果渲染的端到端耗时      |
| `jitter`         | 时延抖动(ms)    | Float    | (4,1)     | 否   | 否   | 0.0    | 衡量网络/计算稳定性的时延方差指标 |
| `throughput`     | 每分钟目标吞吐  | Integer  | 8         | 否   | 否   | 0      | `obj/min`                         |
| `falseAlarmRate` | 误报率(%)       | Float    | (3,2)     | 否   | 否   | 0.00   | 误检占所有预测正例的比例          |
| `missRate`       | 漏检率(%)       | Float    | (3,2)     | 否   | 否   | 0.00   | 漏检占所有真实正例的比例          |
| `totalFrames`    | 累计分析帧数    | Integer  | 16        | 否   | 否   | 0      | Dashboard KPI 面板指标            |
| `totalTargets`   | 累计检测目标    | Integer  | 16        | 否   | 否   | 0      | Dashboard KPI 面板指标            |
| `totalWarnings`  | 累计告警数      | Integer  | 16        | 否   | 否   | 0      | Dashboard KPI 面板指标            |
| `avgScore`       | 平均置信度(%)   | Float    | (3,2)     | 否   | 否   | 0.00   | Dashboard KPI 面板指标            |
| `stability`      | 系统稳定性(%)   | Float    | (3,2)     | 否   | 否   | 0.00   | Dashboard KPI 面板指标            |

---

## 2. 业务含义说明与场景示例

### 2.1 实时检测场景 (DashboardView)

- **业务含义**：负责接入 RTSP 视频流或接收已上传的录像视频流，接收后端的实时推理数据，并负责坐标还原与前端 Canvas 框绘制。
- **业务场景示例**：
  - 用户在 `DashboardView` 中上传一个 MP4 视频，系统调用 `axios.post` 拿到 `videoTaskId`。接着，前端通过 WebSocket 传入该 ID 并发送 `START` 命令；随着视频播放，前端每隔 200ms 发送 `SYNC_TIME` 以对齐时间轴。此时接收到的每一个 `DetectionResult` 都会在播放器上层 Canvas 按照 `score` 和配置阈值过滤后绘制出来。

### 2.2 宏观监控与性能评估 (MetricsView)

- **业务含义**：以图表和 KPI 卡片的形式汇总过去一段时间内，算法在各类环境和阈值下的综合表现。
- **业务场景示例**：
  - `map50` 达到 85%，但 `map75` 只有 60%，意味着模型能识别出物体在哪，但预测框与真实框重合度要求极高时表现欠佳。`Latency`（时延）与 `Jitter`（抖动）配合监控网络和 GPU 渲染的瓶颈：若 Jitter 很高，说明帧率极不稳定，可能触发了丢帧策略。

### 2.3 历史回溯场景 (TasksView)

- **业务含义**：记录和归档所有的分析任务，方便管理者查阅每次巡检作业产生的总目标数、总体评价精度（mAP）和状态。
- **业务场景示例**：
  - 任务 "秦岭林区搜救巡检" (`status=running`) 正在执行中，该任务在 `TasksView` 中会被标蓝或以特定的 UI (`pill` class) 渲染，用户点击该行会更新 `selectedTaskId`，并在其他面板联动显示该任务的详细画面。

---

## 3. 计算逻辑与派生指标口径

### 3.1 算法精度核心指标 (Core Metrics)

以下指标在 `MetricsView.vue` 的顶部详细网格中呈现。

#### 准确率 (Precision) 与 召回率 (Recall)

- **准确率业务含义**：预测为目标的框中，真正是目标的比例。衡量误报控制。
- **召回率业务含义**：画面中真实存在的目标，被模型正确圈出的比例。衡量漏报控制。
- **SQL / 伪代码公式**：

  ```sql
  -- Precision = TP / (TP + FP)
  SELECT (SUM(TP) / (SUM(TP) + SUM(FP))) * 100 AS precision FROM eval_logs;

  -- Recall = TP / (TP + FN)
  SELECT (SUM(TP) / (SUM(TP) + SUM(FN))) * 100 AS recall FROM eval_logs;
  ```

#### F1 Score (综合F1分数)

- **业务含义**：衡量精确率和召回率的平衡度，在 `confidenceBands` 敏感度分析图中，系统往往寻找 F1 最高点作为默认置信度阈值。
- **计算公式**：
  $$ F1 = 2 \times \frac{Precision \times Recall}{Precision + Recall} $$

#### 吞吐量 (Throughput)

- **业务含义**：衡量系统并发承载能力的业务指标。
- **计算口径**：
  ```sql
  -- 时间窗口: 最近1分钟
  -- 单位换算: 从 帧/秒 (FPS) 转换为 目标/分钟
  SELECT SUM(detected_targets_count)
  FROM frame_logs
  WHERE log_time >= CURRENT_TIMESTAMP - INTERVAL 1 MINUTE;
  ```

### 3.2 UI 过滤指标 (Filtered Detections)

- **业务含义**：最终呈现在 Canvas 画布和右侧列表中的有效告警数据。
- **过滤口径** (源自 `useDataStore.js` / `DashboardView.vue`)：
  - `score >= configStore.confidence` (用户设定的全局阈值，如 0.60)
  - `labelKey IN (configStore.enabledLabels)` (用户在过滤面板勾选的分类，如开启人员、关闭动物)
  - 坐标越界过滤：计算出的 `bbox` 在还原到 `renderWidth` 和 `renderHeight` 时必须处于可见区域。

---

## 4. 维度表与统一枚举规范

### 4.1 目标分类字典 (`dim_label_type`)

| 编码 (labelKey) | 含义 (label)  | 默认告警级别 | UI 渲染颜色 (图表/画框) |
| :-------------- | :------------ | :----------- | :---------------------- |
| `person`        | 受困人员/人员 | `danger`     | `#ff7b7b` (红色系)      |
| `vehicle`       | 异常车辆/车辆 | `warning`    | `#f6cf68` (黄色系)      |
| `animal`        | 珍稀动物/动物 | `normal`     | `#41d98f` (绿色系)      |
| `facility`      | 设施破损/设施 | `warning`    | `#61d9e8` (青色系)      |

### 4.2 告警级别字典 (`dim_alert_level`)

| 编码 (level) | 含义     | 对应 Dashboard 渲染样式  | 触发场景                       |
| :----------- | :------- | :----------------------- | :----------------------------- |
| `danger`     | 严重危险 | `<span class="danger">`  | 发现高危目标（如禁区人员入侵） |
| `warning`    | 异常警告 | `<span class="warning">` | 发现次级违规或设备异常         |
| `normal`     | 常规记录 | `<span class="normal">`  | 常规监测目标记录               |

### 4.3 任务状态字典 (`dim_task_status`)

用于 `TasksView.vue` 历史任务表格。

| 编码 (status) | 含义     | UI 渲染 (`pill` 类) |
| :------------ | :------- | :------------------ |
| `pending`     | 等待中   | 灰色 / 默认         |
| `uploading`   | 上传中   | 蓝色脉冲            |
| `running`     | 运行中   | 绿色高亮            |
| `finished`    | 已完成   | 蓝色实底            |
| `error`       | 异常错误 | 红色实底            |

### 4.4 业务场景字典 (`dim_scene_type`)

用于 `MetricsView.vue` 鲁棒性对比（Funnel Chart）及任务分类。

| 编码 (scene) | 含义       | 典型特征与影响                           |
| :----------- | :--------- | :--------------------------------------- |
| `城市`       | 城市/高架  | 背景复杂，目标密集，易产生 False Alarm   |
| `农田`       | 农田病虫害 | 目标微小，依赖高分辨率，FPS 可能下降     |
| `山地`       | 山地/林区  | 遮挡严重，Recall 指标面临挑战            |
| `夜间`       | 夜间红外   | 图像信噪比低，Score 整体均值下降         |
| `雨雾`       | 恶劣天气   | 对比度差，依赖特定增强算法，Latency 增加 |
