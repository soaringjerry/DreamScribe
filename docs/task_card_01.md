# 任务卡 01: DreamScribe - 基础框架搭建

**致 Claude:**

你好，我是 Roo，这个项目的架构师。我将指导你完成 `DreamScribe` 的开发。请仔细阅读并执行以下任务。

## 1. 项目背景与目标

我们的目标是构建一个名为 `DreamScribe` 的 Go 应用。它是一个“智能端点”，其核心职责是：
*   消费一个名为 PCAS 的平台提供的“实时语音转录”能力。
*   将转录后的非结构化文本流，智能地提炼成结构化的“记忆”事件。
*   将这些“记忆”事件再发布回 PCAS。

本次任务的目标是**搭建项目的骨架**，为后续的功能开发奠定坚实的基础。我们不实现任何核心业务逻辑，只关注项目结构、配置加载和命令行入口。

## 2. 项目结构

请严格按照以下结构创建项目目录和文件。这是我们后续所有工作的基础。

```
/dreamscribe
├── cmd/
│   └── dreams-cli/
│       └── main.go
├── internal/
│   ├── app/
│   │   └── app.go
│   ├── audio/
│   │   ├── capture.go
│   │   └── file.go
│   ├── config/
│   │   └── config.go
│   ├── pcas/
│   │   ├── client.go
│   │   ├── consumer.go
│   │   └── publisher.go
│   └── distiller/
│       └── distiller.go
├── go.mod
└── configs/
    └── config.example.yaml
```

## 3. 执行步骤

### 步骤 A: 初始化项目
1.  在项目根目录 (`/root/DreamScribe`) 下，执行 `go mod init github.com/pcas/dreams-cli` 来初始化 Go 模块。
2.  创建上述“项目结构”中规划的所有目录 (`cmd/dreams-cli`, `internal/app`, etc.)。

### 步骤 B: 实现配置模块
1.  在 `configs/` 目录下创建一个名为 `config.example.yaml` 的文件。内容如下：
    ```yaml
    pcas:
      address: "localhost:50051"
    user:
      id: "default-user"
    ```
2.  在 `internal/config/config.go` 中，定义一个 `Config` 结构体来映射上述 YAML 的结构。
3.  实现一个 `LoadConfig(path string) (*Config, error)` 函数。我推荐使用 `viper` 库来处理配置文件的读取和解析，它非常强大。这个函数应该能读取指定路径的 YAML 文件并将其内容填充到 `Config` 结构体中。

### 步骤 C: 构建命令行入口
1.  在 `cmd/dreams-cli/main.go` 中，实现程序的入口。
2.  我建议使用 `cobra` 库来构建我们的命令行应用，它能让未来的扩展（如添加 `record` 和 `transcribe` 子命令）变得非常简单。
3.  在 `main` 函数中，执行以下操作：
    *   调用 `config.LoadConfig()` 函数加载配置。如果加载失败，程序应打印错误并退出。
    *   如果配置加载成功，打印一条欢迎信息，并显示加载到的 PCAS 地址，以验证配置模块工作正常。例如: `DreamScribe is starting... Connecting to PCAS at localhost:50051`.

### 步骤 D: 创建模块占位符
1.  在 `internal/pcas/client.go`, `internal/app/app.go` 等我们创建的其他 `.go` 文件中，暂时只写入包声明 (`package pcas`, `package app` 等)，确保项目可以通过 `go build` 编译即可。我们将在后续任务中填充它们的具体实现。

## 4. 验收标准

当你完成以上所有步骤后，项目应满足以下条件：
*   项目文件结构与规划完全一致。
*   在项目根目录执行 `go mod tidy` 不会报错。
*   执行 `go run ./cmd/dreams-cli/main.go` 后，程序能够成功运行，并在控制台打印出从 `config.example.yaml` 文件中读取到的 PCAS 地址。

请在完成后告知我。我会审查你的工作，然后分配下一个任务。