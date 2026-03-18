# Codex 绑定与用户指南

本文是一份面向实际使用的中文指南，目标是让你把当前仓库完整绑定到 Codex，并稳定使用这套 `Codex + MCP + Responses API + Agents SDK + Agent Team` 工作流。

本文档基于 `2026-03-17` 时可访问的 OpenAI 官方文档整理，关键依据如下：

- [Codex](https://developers.openai.com/codex)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Config basics](https://developers.openai.com/codex/config-basic)
- [Model Context Protocol](https://developers.openai.com/codex/mcp)
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk)
- [Migrate to the Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [Agents SDK](https://developers.openai.com/api/docs/guides/agents-sdk)
- [Models](https://developers.openai.com/api/docs/models)
- [GPT-5-Codex](https://developers.openai.com/api/docs/models/gpt-5-codex)

## 1. 你会得到什么

这个仓库现在已经不是一个“概念设计稿”，而是一个可直接绑定到 Codex 的后端工程，提供两条使用路径：

1. 在 Codex 中作为 MCP 服务使用
2. 在浏览器中通过 `/canvas` 作为运维和观察面板使用

对外稳定暴露的 MCP 工具是：

- `team.plan`
- `team.run`
- `team.status`
- `team.review`
- `team.cancel`

内部实现是：

- MCP 服务层
- 固定阶段编排器
- `Responses API + Agents SDK` 多代理运行时
- 本地兜底运行时
- 任务持久化
- HTTP 画布与配置编辑器

## 2. 先理解 Codex 绑定到底绑定了什么

按 OpenAI 官方文档：

- Codex 会读取 `AGENTS.md` 作为项目指令源
- Codex 可以通过 `.codex/config.toml` 读取项目级配置
- 这些项目配置只有在“项目被信任”时才会生效
- Codex CLI 和 IDE Extension 共用同一套配置层
- Codex 可以连接 MCP 服务，且同时支持 `STDIO` 和 `Streamable HTTP`

这也是本仓库的设计前提：

1. 用 `AGENTS.md` 告诉 Codex 何时优先调用 Agent Team
2. 用 `.codex/config.toml` 自动把本仓库 MCP 服务挂进 Codex
3. 用 MCP 工具作为 Codex 与 Agent Team 的稳定契约
4. 用 `Responses API + Agents SDK` 负责真正的多代理执行

## 3. 推荐绑定方式：项目级 STDIO 绑定

这是最适合日常开发的方式，也是本仓库默认推荐方式。

官方依据：

- OpenAI 文档说明 Codex 支持 `STDIO` MCP server
- `env_vars` 可用于“允许并转发”环境变量
- `required = true` 可用于要求 MCP 服务启动失败时直接报错，而不是静默降级

本仓库已经准备好了项目配置文件：

- [.codex/config.toml](/D:/workspace/CodexTeam/.codex/config.toml)

它已经做了这些事：

- 用 `node ./dist/index.js` 启动 MCP 服务
- 允许把 `OPENAI_API_KEY` 转发给 MCP 子进程
- 把 `AGENT_TEAM_RUNTIME` 固定为 `agents`
- 把可用工具限制为 `team.plan/team.run/team.status/team.review/team.cancel`
- 设置 `required = true`

### 3.1 前置条件

你需要先满足这些条件：

1. 本机已安装 Node.js
2. 当前目录是仓库根目录
3. 已执行过 `npm install`
4. 已执行过 `npm run build`
5. 如果要跑真实 Agents 版，已准备 `OPENAI_API_KEY`

PowerShell 示例：

```powershell
cd D:\workspace\CodexTeam
npm install
npm run build
```

### 3.2 设置 API Key

如果你希望 Codex 启动的是“真实 `agents-sdk` 后端”，需要先在启动 Codex 的同一个 shell 环境里设置：

```powershell
$env:OPENAI_API_KEY="sk-..."
```

原因是 `.codex/config.toml` 里使用的是：

- `env_vars = ["OPENAI_API_KEY"]`

这表示 Codex 只会转发当前环境里已经存在的这个变量，而不是替你生成它。

### 3.3 打开 Codex 并信任项目

这是经常被忽略的一步。

OpenAI 官方在 `Config basics` 中明确说明，项目级 `.codex/config.toml` 只有在项目被信任时才会加载。因此：

1. 用 Codex 打开 `D:\workspace\CodexTeam`
2. 确认该工作区被标记为可信任
3. 让 Codex 进入仓库根目录工作

如果项目未被信任，Codex 会跳过本仓库的 `.codex/config.toml`，最终表现通常是：

- MCP 工具没有出现
- 或者出现的是用户级配置，而不是仓库内配置

### 3.4 验证 Codex 真的已经绑定成功

建议按下面顺序验证。

#### 方法 A：检查指令源

OpenAI 在 `AGENTS.md` 文档中给出的推荐验证方式，是直接让 Codex列出它加载过的指令源。

你可以向 Codex 发送：

```text
List the instruction sources you loaded for this repository.
```

正常情况下，你至少应该看到：

- 仓库根目录的 `AGENTS.md`
- 项目级 `.codex/config.toml` 的配置效果

#### 方法 B：检查 MCP 工具

如果你在 Codex CLI / TUI 中工作，可以使用官方文档提到的：

```text
/mcp
```

这会显示当前激活的 MCP server。

成功时，你应该能看到一个名为 `agent_team` 的 MCP 服务，并且工具列表里有：

- `team.plan`
- `team.run`
- `team.status`
- `team.review`
- `team.cancel`

#### 方法 C：直接让 Codex调用工具

你可以直接发送：

```text
Use team.plan for the current repository and summarize the returned task id, risks, and acceptance criteria.
```

如果 Codex 能成功调用，就说明绑定已经完成。

## 4. 另一种绑定方式：HTTP 绑定

如果你想让浏览器画布和 Codex 共用同一个后端，或者希望 MCP 服务长驻运行，可以使用 HTTP 模式。

示例配置文件：

- [.codex/config.http.example.toml](/D:/workspace/CodexTeam/.codex/config.http.example.toml)

### 4.1 启动 HTTP 服务

真实 Agents 版：

```powershell
cd D:\workspace\CodexTeam
$env:OPENAI_API_KEY="sk-..."
$env:AGENT_TEAM_RUNTIME="agents"
$env:AGENT_TEAM_TRANSPORT="http"
npm run start:http
```

默认地址：

- MCP: `http://127.0.0.1:3000/mcp`
- 健康检查: `http://127.0.0.1:3000/healthz`
- 画布: `http://127.0.0.1:3000/canvas`

### 4.2 让 Codex 使用 HTTP MCP

如果你用的是 HTTP 模式，则应让 Codex 读取：

- [.codex/config.http.example.toml](/D:/workspace/CodexTeam/.codex/config.http.example.toml)

你可以把其中的服务块合并到你的用户级 `~/.codex/config.toml`，或者作为项目级 `.codex/config.toml` 使用。

HTTP 模式更适合：

- 浏览器画布和 Codex 一起使用
- 本地持久服务
- 后续接 VS Code / JetBrains 面板

## 5. 推荐工作流

### 5.1 在 Codex 中的标准工作流

推荐你在 Codex 中固定使用下面这类提示词：

```text
Use team.plan first. Then run the full Agent Team workflow with waitForCompletion=true. Do not skip review or test. After it finishes, call team.status and summarize the trace id, last agent, remaining risk, and final readiness.
```

这条提示词的意图是：

1. 强制先规划
2. 强制完整执行
3. 不跳过 review 和 test
4. 让 Codex 最后把运行元数据也一起报告出来

### 5.2 对应的 MCP 工具顺序

标准顺序建议保持为：

1. `team.plan`
2. `team.run`
3. `team.status`
4. `team.review`
5. `team.cancel`

其中：

- `team.plan` 适合先做风险和范围确认
- `team.run` 适合完整跑固定编排链路
- `team.status` 适合检查 `traceId / lastResponseId / lastAgent`
- `team.review` 适合单独补一次复核
- `team.cancel` 适合终止长任务

### 5.3 何时算已经进入真实 Agents 运行时

你可以通过以下信号判断当前是不是 live backend：

- `team.plan` 返回 `backend = "agents-sdk"`
- `team.run` 返回 `backend = "agents-sdk"`
- `team.status` 里出现 `traceId`
- `team.status` 里出现 `lastResponseId`

如果看到的是：

- `backend = "local"`

那说明当前运行的是本地兜底模式，不是 Responses + Agents SDK 的 live 版本。

## 6. 浏览器画布怎么用

HTTP 模式启动后，打开：

```text
http://127.0.0.1:3000/canvas
```

页面上有三块核心区域：

### 6.1 左侧：任务入口

这里可以：

- 新建任务
- 输入 goal
- 输入 constraints
- 选择只 `Plan` 还是直接 `Run workflow`
- 查看最近任务列表

### 6.2 中间：执行画布

这里会按阶段展示：

- Planner
- Implementer
- Reviewer
- Tester

同时显示：

- 当前状态
- 当前阶段
- 摘要
- Telemetry
- 历史事件

### 6.3 右侧：配置编辑器

这里可以编辑：

- runtime mode
- 是否开启 live narration
- shared model
- manager/planner/implementer/reviewer/tester 的模型
- transport 模式
- HTTP host/port/path
- task store path

配置编辑器的保存不是“假保存”：

- 实际写入 `.agent-team/config.overrides.json`
- 页面会显示哪些字段需要重启后才生效
- 被环境变量锁定的字段会显示为锁定态

## 7. 配置优先级一定要弄清楚

这是最容易引起“为什么我明明改了配置却没生效”的地方。

根据 OpenAI 官方 `Config basics` 文档，Codex 配置优先级从高到低是：

1. CLI flags 和 `--config`
2. profile
3. 项目级 `.codex/config.toml`
4. 用户级 `~/.codex/config.toml`
5. 系统级配置
6. 内建默认值

本仓库自身服务的配置还叠加了一层：

1. 运行进程的环境变量
2. `.agent-team/config.overrides.json`
3. `src/config.ts` 中的默认值

因此你需要区分两件事：

- Codex 客户端怎么决定“连接哪个 MCP 服务”
- MCP 服务进程自己怎么决定“用哪个 runtime/model/transport”

### 7.1 环境变量会锁定字段

比如你已经在启动服务的环境中设置：

```powershell
$env:AGENT_TEAM_RUNTIME="agents"
```

那画布里的 `runtimeMode` 虽然仍会显示，但会被锁定，保存时也不会覆盖它。

这是故意设计的，避免“页面看起来改成功了，但进程层其实不可能改掉”。

## 8. 模型选择建议

根据 OpenAI 当前模型文档：

- 如果不确定从哪里开始，用 `gpt-5.4`
- 如果要做 Codex/agentic coding，`gpt-5-codex` 是专门面向这类任务的模型
- `GPT-5-Codex` 当前是 Responses API only

因此本仓库默认策略是：

- 管理和规划侧：`gpt-5.4`
- 实现侧：`gpt-5-codex`
- 测试侧：`gpt-5-mini`

如果你更关注成本，可以把：

- `plannerModel`
- `reviewerModel`
- `testerModel`

下调到更轻量的模型，但一般不建议先把 `implementerModel` 从 Codex 型号换掉。

## 9. 为什么本仓库同时保留 local / assisted / agents 三种模式

这不是重复设计，而是为了不同使用场景：

### `local`

适合：

- 离线验证
- CI
- 冒烟测试
- 无 key 场景

### `assisted`

适合：

- 保持本地产物结构稳定
- 但又希望拿到来自 Responses 的简短叙述

### `agents`

适合：

- 真正的多代理编排
- 实际接入 Responses API
- 追踪 `traceId` / `previous_response_id`
- 作为 Codex 的正式后端

## 10. 与 Codex 绑定后的推荐提示词模板

### 模板 A：标准实现任务

```text
Use team.plan first for this repository task. Then run the full Agent Team workflow with waitForCompletion=true. Do not skip review or test. After completion, call team.status and summarize the backend, trace id, last agent, final readiness, and remaining risk.
```

### 模板 B：只做规划

```text
Use team.plan only. Return the task id, ordered steps, top risks, and acceptance criteria. Do not start execution yet.
```

### 模板 C：只看运行状态

```text
Call team.status for the latest task and explain whether the backend is local or agents-sdk, which stage ran last, and whether I should continue, review, or cancel.
```

### 模板 D：让 Codex 基于仓库规则工作

```text
Read the repository instructions, use the available Agent Team MCP tools, and follow the fixed order: plan, implement, review, test. Do not skip review or tests.
```

## 11. 常见故障排查

### 11.1 Codex 看不到 `team.*` 工具

优先检查：

1. 项目是否被 trust
2. `npm run build` 是否已经执行
3. `.codex/config.toml` 是否在仓库根目录
4. Codex 当前工作目录是不是这个仓库
5. 在 CLI/TUI 中执行 `/mcp` 看当前是否有 `agent_team`

### 11.2 工具在，但返回 `backend = "local"`

通常说明：

1. `OPENAI_API_KEY` 没有在启动 Codex 的同一个环境里设置
2. `AGENT_TEAM_RUNTIME` 被外部设成了 `local`
3. 你在跑 HTTP 服务时没有显式设 `AGENT_TEAM_RUNTIME=agents`

### 11.3 画布里改了配置，但行为没变化

先看右上角 banner。

如果提示“需要重启”，那是正常现象，因为当前实现会把覆盖项持久化，但不会强制热重启服务进程。

### 11.4 HTTP 页面能打开，但 Codex 不认

说明你只启动了 HTTP 服务，还没有让 Codex 使用对应的 HTTP MCP 配置。需要把：

- [.codex/config.http.example.toml](/D:/workspace/CodexTeam/.codex/config.http.example.toml)

接到你的 Codex 配置层里。

### 11.5 Windows 上偶发行为不稳定

OpenAI 官方 Codex CLI 文档对 Windows 的态度是“支持但偏实验性”，并建议优先使用 WSL。若你后续遇到长任务、路径或进程行为异常，优先建议迁移到 WSL 工作目录。

## 12. 一条最短成功路径

如果你只想最快跑通一次，按下面做：

1. 进入仓库根目录
2. 执行 `npm install`
3. 执行 `npm run build`
4. 在启动 Codex 的 shell 中设置：

```powershell
$env:OPENAI_API_KEY="sk-..."
```

5. 用 Codex 打开仓库并 trust 项目
6. 让 Codex 读取仓库里的 `AGENTS.md` 和 `.codex/config.toml`
7. 在 Codex 中发送：

```text
Use team.plan first. Then run the full Agent Team workflow with waitForCompletion=true. Do not skip review or test. After it finishes, call team.status and summarize the trace id, last agent, final readiness, and remaining risk.
```

如果返回里出现：

- `backend = "agents-sdk"`
- `traceId`

就说明你已经完成了和 Codex 的真实绑定。

## 13. 本仓库内最相关的文件

- 绑定配置：[.codex/config.toml](/D:/workspace/CodexTeam/.codex/config.toml)
- HTTP MCP 示例：[.codex/config.http.example.toml](/D:/workspace/CodexTeam/.codex/config.http.example.toml)
- 项目指令：[AGENTS.md](/D:/workspace/CodexTeam/AGENTS.md)
- Codex 接入说明：[docs/codex-setup.md](/D:/workspace/CodexTeam/docs/codex-setup.md)
- 官方依据汇总：[docs/official-openai-reference.md](/D:/workspace/CodexTeam/docs/official-openai-reference.md)
- 画布页面：[public/canvas.html](/D:/workspace/CodexTeam/public/canvas.html)
- 配置编辑逻辑：[src/config-editor.ts](/D:/workspace/CodexTeam/src/config-editor.ts)
- HTTP 画布与 API：[src/http-server.ts](/D:/workspace/CodexTeam/src/http-server.ts)
