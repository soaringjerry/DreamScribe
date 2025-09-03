# DreamScribe 前端 UI 设计与多模态扩展构想

最后更新：2025-09-03

## 1. 目标与范围

本设计旨在在现有“实时转录”基础上，扩展三个核心区域：
- 译文区域：与原文并行的实时翻译显示（可选目标语言、多语言切换）。
- 摘要区域：滚动式增量摘要 + 关键要点/行动项卡片。
- 提问区域（Chat）：与 AI 的问答对话，支持引用选中的转录片段，进行上下文增强。

同时预留多模态能力入口：上传课件（PDF/图片）、摄像头画面接入、幻灯片联动（自动翻页）。

本方案覆盖信息架构、组件拆分、数据流与 API 草案、状态管理、MVP 里程碑与后续演进。

## 2. 信息架构与布局

推荐三栏布局，右侧为可切换的“摘要/提问”双栈：

1) 顶部工具栏（HeaderToolbar）
- 左侧：启动/停止、录制计时、连接状态（WS/PCAS）、音量与采样率指示。
- 中间：语言设置（原文语言/目标语言）、打字机效果开关、自动滚动开关。
- 右侧：会话管理（保存/清空）、导出（文本/JSON/SRT）、上传入口（PDF/图片/摄像头）。

2) 主体区（水平三栏）
- 左栏：原文（TranscriptPane）
  - 复用现有行/片段模型，支持选择文本并“引用到问题”。
- 中栏：译文（TranslationPane）
  - 与原文对齐显示；支持逐句流式落地；显示目标语言切换与延迟/质量提示。
- 右栏：摘要/提问（SummaryAndChatPanel）
  - 上部：摘要卡片（要点、术语表、行动项），支持“生成/刷新/导出”。
  - 下部：ChatPanel（消息列表 + 输入框 + 发送按钮 + 附件入口），消息可引用原文/译文片段。

3) 底部状态栏（可选）
- 显示带宽/延迟、CPU/内存、音频丢包、后端/PCAS健康等。

响应式：宽屏为三栏；中屏合并“译文/摘要/提问”为 Tab；窄屏使用 Tab 切换各区域。

## 3. 组件与职责划分

- HeaderToolbar：全局控制与状态展示。
- TranscriptPane（已存在）：
  - 新增：选择引用（将选中的句子 ID 注入 Chat 输入框提示）。
- TranslationPane：
  - Props：`language`, `streaming`, `segments`（与原文时间戳对齐）。
  - Hook：`useTranslationStream`（SSE/WS 接收译文增量）。
- SummaryPanel：
  - 展示“滚动摘要”（依据时间窗口/段落）与“结构化要点”；
  - Hook：`useSummaryStream`（SSE/WS），支持“生成/刷新/暂停”。
- ChatPanel：
  - 消息列表（用户/AI），输入框，发送按钮；
  - 支持“引用转录片段”（插入消息上下文 metadata）。
  - Hook：`useChatClient`（优先 SSE 流式返回，降级长轮询）。
- AssetSidebar / UploadDialog（可并入 Header 工具）：
  - 上传 PDF/图片/幻灯片；摄像头开启；
  - 展示当前课件并与转录时间轴建立对齐关系。
- SlideViewer（预留）：
  - 支持上一页/下一页/跳页；
  - 暴露 `goTo(page)` API 供“自动翻页”控制。
- StatusBar（可选）：
  - 展示运行指标；错误 toast/告警。

## 4. 数据流与接口草案

现有：
- `WS /ws/transcribe`：前端发送 PCM 音频（Binary），接收转写文本（Text）。

新增建议（占位 API，便于前端先行对接 Mock/后端后续实现）：
- 翻译
  - `POST /api/translate/start` { sessionId, targetLang } → { streamId }
  - `GET  /api/translate/stream?streamId=...`（SSE）→ data: { segmentId, text }
- 摘要
  - `POST /api/summarize/start` { sessionId, mode: "rolling|final" } → { streamId }
  - `GET  /api/summarize/stream?streamId=...`（SSE）→ data: { kind: "bullet|action|term", text }
- 提问（Chat）
  - `POST /api/chat` { sessionId, message, refs?: [{lineId, segmentId}]} → SSE 流响应（分片）
- 资产（多模态）
  - `POST /api/assets/upload` form-data(file, kind: "pdf|image", title?) → { assetId, pages? }
  - `POST /api/slides/bind` { sessionId, assetId } → { ok }
  - `POST /api/slides/auto-advance` { sessionId, enable: bool }

数据对齐：
- 关键是“转录时间戳”与“课件页码/时间”的对齐。建议在客户端维护 `time -> page` 的映射（手动/自动），后端可持久化映射表以供回放与二次学习。

## 5. 状态管理与持久化

- 继续使用 IndexedDB（已存在的 saveSession/loadSession），扩展存储：
  - `translations`：按 segmentId 存译文；
  - `summary`：滚动摘要快照；
  - `chat`：消息历史（含引用 source meta）；
  - `assets`：已上传课件元数据（assetId, pages, bound sessionId）。
- 跨组件共享：建议引入轻量状态方案（Zustand/Recoil）或扩展现有 Context，避免 props drilling。

## 6. UI 草图（文字版）

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Header: Start | Stop | Timer 00:23 | WS:OK | PCAS:OK | Lang[ZH→EN] | Upload │
├───────────────────────────────────────────────────────────────────────────────┤
│ Transcript (left)      │ Translation (middle)           │ Summary / Chat (right) │
│ - [Speaker] ...        │ - [EN] ...                     │ ┌ Summary  ───────────┐│
│ - [Speaker] ...        │ - [EN] ...                     │ │ • Key point ...     ││
│ (select to quote →)    │ (aligned by sentence)          │ │ • Action ...         ││
│                        │                                │ └──────────────────────┘│
│                        │                                │ ┌ Chat ───────────────┐ │
│                        │                                │ │ You:  ...           │ │
│                        │                                │ │ AI:   ...           │ │
│                        │                                │ │ [引用片段] [发送]    │ │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 7. 多模态扩展（路线图）

- V0：上传 PDF/图片，提供 SlideViewer 预览与手动翻页；与时间轴松耦合。
- V1：OCR/版面解析，提取标题/要点并与转录对齐；摘要中自动引用课件要点。
- V2：摄像头/屏幕共享接入，识别当前投影页；实现“自动翻页”（按识别的页码驱动 SlideViewer）。
- V3：多模态 QA（图文问答），在 Chat 中支持图片/页码引用；可回溯到具体课件坐标。

## 8. MVP 切分与实施顺序

M1（UI 骨架）
- 新增三大区域：TranslationPane、SummaryPanel、ChatPanel（静态/占位数据）。
- Header 增加语言/上传入口，右栏 Tab 切换“摘要/提问”。

M2（接口打通）
- 接入 `useTranslationStream`（对接后端 SSE/WS，或先用 Mock 服务）。
- 接入 `useSummaryStream`（滚动摘要）；
- 接入 `useChatClient`（流式回答，支持引用片段）。

M3（多模态基础）
- 上传 PDF/图片并在 SlideViewer 预览；手动翻页；与会话绑定。

M4（智能联动）
- 文本-课件对齐；摘要与 QA 引用课件要点；实验性“自动翻页”。

## 9. 开发注意点

- 性能：长列表虚拟化（转录/译文）；增量渲染；节流/去抖；Web Worker（重负载解析）。
- 可用性：键盘快捷键（开始/停止、发送、翻页）；文本搜索；高对比/夜间模式。
- 可靠性：网络断线重连（已有）；SSE 断开重试；错误提示与降级策略。
- 可观测：前端埋点与简单指标面板；导出调试包（日志与会话快照）。
- 安全：上传文件白名单/大小限制；本地预处理；脱敏；权限与隐私 UI 提示。

## 10. 与后端的协作约定（初稿）

- 采用 SSE 优先（低延迟、后端实现简单），必要时升级为 WS；
- 所有新接口返回统一错误格式：`{ error: { code, message } }`；
- 长会话使用 `sessionId` 作为关联键；
- 后端无能力时，前端允许 `?mock=true` 切入 Mock 服务，保障 UI 可先行联调与演示。

---

附：命名建议
- 目录：`frontend/src/panes/{Transcript,Translation,Summary,Chat}`
- Hooks：`frontend/src/hooks/{useTranslationStream,useSummaryStream,useChatClient}`
- 资产：`frontend/src/components/{SlideViewer,UploadDialog}`

