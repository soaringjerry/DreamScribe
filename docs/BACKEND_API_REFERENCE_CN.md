# DreamScribe 后端 API 参考（简要）

本文档概述 DreamScribe 后端对前端/工具开放的最小接口集，便于联调与自测。

## 1. 健康检查与测试

- `GET /api/health`：探测 PCAS 能力就绪（transcribe/translate/summarize/chat）。
- `GET /test`：内置测试台（同源页面），可一键验证 WS/SSE/Chat/Admin 四类通路。

## 2. 实时转写（WebSocket）

- `GET /ws/transcribe`
  - 前端发送：二进制 PCM 数据帧（浏览器麦克风捕获）。
  - 后端返回：文本帧（转写结果）。
  - 说明：用于“音频 → 文本”的全双工链路；完整句子会触发 PCAS 记忆事件 `pcas.memory.create.v1`。

## 3. 翻译/摘要（SSE）

SSE（Server-Sent Events）用于服务端→客户端的单向文本流；客户端如需发输入，使用 `POST`。

### 3.1 翻译（Translate）

1) 开始会话
```
POST /api/translate/start
Content-Type: application/json
{ "sessionId": "s1", "targetLang": "en", "attrs": {"k":"v"} }
→ { "streamId": "..." }
```
2) 订阅结果（SSE）
```
GET /api/translate/stream?streamId=...
SSE: data: {"text":"..."}
```
3) 发送分片文本
```
POST /api/streams/{id}/send
Content-Type: application/json
{ "text": "你好世界。" }
```
4) 关闭会话
```
DELETE /api/streams/{id}
```

### 3.2 摘要（Summarize）

同上，路由前缀为 `/api/summarize/*`；`start` 时的请求体字段为 `{ "sessionId": "s1", "mode": "rolling|final" }`。

## 4. Chat（SSE 一次性）

```
POST /api/chat
Content-Type: application/json
{ "sessionId": "s1", "message": "请总结这段话…", "refs": [], "attrs": {}}
→ SSE: data: {"text":"..."}
```

## 5. 管理（可选）

用于通过 Admin 事件快速注册路由（由 PCAS 侧验证并持久化）。

```
POST /api/admin/policy/add_rule
Content-Type: application/json
{ "event_type": "capability.streaming.translate.v1", "provider": "mock-provider", "prompt_template": "...", "name": "(可选)" }
```

- 后端会自动从容器环境注入 `attributes.admin_token`（环境变量 `PCAS_ADMIN_TOKEN`），具体鉴权逻辑由 PCAS 实现。

## 6. 注意事项

- 浏览器端录音与 AudioWorklet 需要**安全上下文**：HTTPS 或 `http://localhost`。
- SSE 为文本流；有二进制需求（音频）请使用 WebSocket。
- 生产部署推荐在入口反向代理中关闭缓冲（例如设置 `X-Accel-Buffering: no`），本服务已在响应头添加。

## 7. 端到端排查顺序

1) `GET /api/health` 看四类能力就绪状态。
2) 打开 `/test` 用“Translate/Summarize/Chat”做最小闭环验证。
3) 验证 `/ws/transcribe` 能握手（101），并在安全上下文下正常录音与回传文本。

