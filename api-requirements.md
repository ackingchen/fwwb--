# 后端 API 开发与技术实施需求清单

## 1. API 接口详细需求列表

### 1.1 核心检测模块

| 业务功能描述 | 请求方法 | 请求路径 | 鉴权 | 限流策略 |
| :--- | :--- | :--- | :--- | :--- |
| **实时视频流检测**<br>接收前端 RTSP 地址，后端进行 YOLO 推理，推送 Base64 图像流及检测框 | `Upgrade` (WS) | `ws://<host>/api/v1/stream-detect` | URL Query Token | 单用户最多 2 路并发流 |
| **本地视频上传**<br>上传视频文件（MP4/AVI），返回存储路径或任务ID | `POST` | `/api/v1/detections/video` | Bearer Token | 10 次/分钟 |
| **视频同步推理控制**<br>支持指令控制，实现前端播放进度与后端推理帧精确对齐 | `Upgrade` (WS) | `ws://<host>/api/v1/video-detect` | URL Query Token | 心跳包频控 (最大 10次/秒) |
| **本地图片检测**<br>上传单张图片，实时返回检测到的目标列表及置信度 | `POST` | `/api/v1/detections/image` | Bearer Token | 50 次/分钟 |

### 1.2 监控与统计模块

| 业务功能描述 | 请求方法 | 请求路径 | 鉴权 | 限流策略 |
| :--- | :--- | :--- | :--- | :--- |
| **获取系统资源状态**<br>获取 CPU、GPU、内存使用率及温度 | `GET` | `/api/v1/system/resources` | Bearer Token | 100 次/分钟 |
| **获取目标检测统计摘要**<br>获取 mAP、FPS、延迟及分类占比数据 | `GET` | `/api/v1/metrics/summary` | Bearer Token | 100 次/分钟 |
| **获取系统日志列表**<br>支持分页查询系统运行日志与告警记录 | `GET` | `/api/v1/system/logs` | Bearer Token | 60 次/分钟 |

### 1.3 配置管理模块

| 业务功能描述 | 请求方法 | 请求路径 | 鉴权 | 限流策略 |
| :--- | :--- | :--- | :--- | :--- |
| **更新检测参数配置**<br>更新全局置信度阈值、IoU阈值及启用的检测类别 | `PUT` | `/api/v1/config/detection` | Bearer Token | 30 次/分钟 |

---

## 2. 接口入参/出参规范示例

### 2.1 请求参数 (入参)
- **分页参数**：`page` (默认1, Integer)，`size` (默认20, Max 100, Integer)
- **上传参数**：`file` (Multipart/form-data, 图片 <10MB, 视频 <500MB)
- **WebSocket 指令**：
  ```json
  { "command": "START", "videoPath": "file.mp4" }
  { "command": "SYNC_TIME", "currentTime": 12.5 }
  ```

### 2.2 响应结构 (出参)
所有 HTTP 接口成功必须遵循以下结构：
```json
{
  "code": 0,
  "message": "success",
  "data": { ... } // 业务数据
}
```
所有 WebSocket 消息必须包含时间戳：
```json
{
  "timestamp": 1682390123.456,
  "detections": [
    { "id": "D-01", "label": "Person", "confidence": 0.94, "bbox": [120, 45, 180, 210] }
  ]
}
```

---

## 3. 技术约束与安全规范

### 3.1 鉴权与安全
- **JWT 认证**：支持 Token 无感续期机制（提供 Refresh Token）。
- **数据加密**：敏感字段（密码）使用 Bcrypt/Argon2 单向哈希；生产环境强制 TLS 1.2+。
- **CORS 跨域**：仅允许受信任的域名请求，暴露必要的 Headers（如 `Authorization`）。

### 3.2 异常与熔断处理
- **统一错误码**：
  - `ERR_1001`: 参数校验失败 (HTTP 400)
  - `ERR_2001`: 认证失败 (HTTP 401)
  - `ERR_3002`: 文件体积超限 (HTTP 413)
  - `ERR_4001`: AI 模型推理超时或显存溢出 (HTTP 500)
- **熔断策略**：当 GPU 显存占用 > 95% 或推理延迟连续 10 帧 > 500ms 时，触发熔断，拒绝新的视频流接入请求，返回 `503 Service Unavailable`。

### 3.3 性能要求
- WebSocket 握手响应 < 200ms。
- 单路 RTSP 视频流端到端延迟控制在 50ms 以内。
- 单张图片检测接口 P95 响应时间 < 800ms。

---

## 4. 研发流程与交付标准

### 4.1 文档与 Mock 数据
- **接口文档**：必须使用 Swagger/OpenAPI 3.0 标准生成在线文档。
- **Mock 规则**：
  - 使用 Faker.js 或类似工具。
  - `confidence` 范围：0.40 ~ 0.99，保留两位小数。
  - `bbox`：生成适配前端 1920x1080 坐标系的四位整数数组。

### 4.2 测试标准
- **单元测试覆盖率**：核心业务逻辑（尤其是帧同步算法与权限拦截器）覆盖率需 **> 85%**。
- **Postman 交付**：必须提供完整的 Postman Collection，包含正常流与异常流（如超大文件、非法 Token）的测试用例。

### 4.3 版本管理与维护
- **版本策略**：URL 强制包含版本号（如 `/api/v1`）。废弃接口需提前 3 个月通过 Header `Deprecation` 通知。
- **CI/CD**：代码合并至 Main 分支前，必须通过 SonarQube 代码质量扫描及自动化 API 单元测试。
- **上线验收**：QA 需验证三种输入源（实时流、视频文件、图片）在前后端联调下的并发稳定性与渲染对齐精度。
