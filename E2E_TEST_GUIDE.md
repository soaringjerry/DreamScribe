# DreamScribe 端到端测试指南

## 前置条件

1. **PCAS 服务**：确保 PCAS 和 DreamTrans 服务正在运行
   - PCAS 应监听在 `localhost:9090`
   - DreamTrans 应已注册并提供 `capability.streaming.transcribe.v1` 能力

2. **系统要求**：
   - Go 1.24+ 
   - Node.js 18+
   - 支持的浏览器（Chrome/Firefox/Edge）
   - 麦克风权限

## 启动服务

### 1. 启动后端服务

在第一个终端窗口中：

```bash
./start-backend.sh
```

成功启动后，你应该看到：
```
Starting server on :8080
```

### 2. 启动前端服务

在第二个终端窗口中：

```bash
./start-frontend.sh
```

成功启动后，你应该看到：
```
  VITE v7.0.2  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 3. 检查服务状态

在第三个终端窗口中：

```bash
./check-services.sh
```

确保所有服务都显示 ✓

## 执行测试

### 测试步骤

1. **打开浏览器**
   - 访问 http://localhost:5173
   - 打开开发者工具 (F12)
   - 切换到 Network 和 Console 标签页

2. **开始录音**
   - 输入密码：`233333`
   - 点击 "Start Transcription" 按钮
   - 授予麦克风权限（如果提示）

3. **验证连接**
   
   在 Network 标签页中，你应该看到：
   - WebSocket 连接到 `ws://localhost:8080/ws/transcribe`
   - 状态码: 101 Switching Protocols
   
   在后端终端中，你应该看到：
   ```
   New WebSocket connection established from [IP]
   Stream established with ID: [UUID]
   ```

4. **测试转录**
   
   对着麦克风说一句完整的中文句子：
   ```
   "你好世界，今天天气真不错。"
   ```

5. **观察数据流**
   
   **网络面板 (WebSocket Messages)**：
   - 出站消息：二进制数据（音频流）
   - 入站消息：文本数据（转录结果）
   
   **前端页面**：
   - 实时显示转录的文字
   - 句子完成后显示为确认文本
   
   **后端终端**：
   ```
   Published memory event: 你好世界，今天天气真不错。
   ```

6. **停止录音**
   - 点击 "Stop Transcription" 按钮
   - 验证 WebSocket 连接正常关闭

### 预期结果

✅ **成功标志**：
- WebSocket 连接成功建立
- 音频数据持续发送
- 转录文本实时显示
- 完整句子触发事件发布
- 没有错误日志

❌ **常见问题**：
- "Failed to connect to PCAS" - 检查 PCAS 服务
- "WebSocket connection failed" - 检查后端服务
- 没有转录结果 - 检查麦克风权限和 PCAS 配置
- "Published memory event" 未出现 - 检查句子是否完整（以。？！结尾）

## 调试技巧

1. **查看 WebSocket 消息**：
   - Chrome: Network → WS → Messages
   - 查看二进制消息大小是否合理（音频数据）
   - 查看文本消息内容（转录结果）

2. **后端日志**：
   - 添加 `PCAS_DEBUG=true` 环境变量查看更多日志
   - 检查 PCAS 连接状态

3. **前端控制台**：
   - 查看 `AUDIO_CAPTURED` 和 `AUDIO_SENDING` 日志
   - 查看 "Received text from backend" 日志

## 测试检查清单

- [ ] PCAS 服务正在运行
- [ ] 后端服务成功启动
- [ ] 前端服务成功启动
- [ ] WebSocket 连接建立
- [ ] 音频数据发送正常
- [ ] 转录文本接收正常
- [ ] UI 实时更新
- [ ] 句子完成触发事件
- [ ] 停止录音正常工作
- [ ] 无错误日志

## 性能指标

理想情况下：
- WebSocket 连接延迟 < 100ms
- 音频到文本延迟 < 2s
- 句子识别延迟 < 500ms
- 事件发布延迟 < 100ms