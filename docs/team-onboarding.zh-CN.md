# 团队 Onboarding 指南

这份文档用于团队内推广和交接，帮助新同事快速把仓库绑定到 Codex，并理解这套 `Codex + MCP + Agent Team` 工作流。

建议把它和 [docs/user-guide.zh-CN.md](/D:/workspace/CodexTeam/docs/user-guide.zh-CN.md) 一起使用：

- `user-guide.zh-CN.md` 适合个人逐步操作
- `team-onboarding.zh-CN.md` 适合培训、交接和团队统一规范

## 1. 三分钟说明白这套系统

这套仓库不是要替代 Codex，而是给 Codex 提供一个稳定的多代理后端。

日常流程可以理解为：

1. 人在 Codex 里描述任务
2. Codex 通过 MCP 调用 `team.*` 工具
3. 后端按固定顺序执行 `plan -> implement -> review -> test`
4. 如果启用 `agents` 运行时，每个阶段都由 `Responses API + Agents SDK` 驱动
5. 如果启用 `http` 模式，还可以在浏览器画布中查看任务和修改配置

## 2. 新同事第一天该做什么

建议按这个顺序：

1. 阅读 [README.md](/D:/workspace/CodexTeam/README.md)
2. 阅读 [docs/user-guide.zh-CN.md](/D:/workspace/CodexTeam/docs/user-guide.zh-CN.md)
3. 执行 `npm install`
4. 执行 `npm run build`
5. 执行 `npm run doctor:codex`
6. 如需真实 Agents 版，在当前 shell 设置 `OPENAI_API_KEY`
7. 用 Codex 打开并 trust 当前仓库
8. 在 Codex 中执行 `/mcp`
9. 验证 `team.plan` 是否可调用
10. 再试一次完整 `team.run`

## 3. 推荐的团队统一标准

### 默认绑定方式

- Codex 内使用：`stdio`
- 浏览器画布使用：`http`
- 实际多代理执行：`agents`

### 默认模型建议

- manager: `gpt-5.4`
- planner: `gpt-5.4`
- implementer: `gpt-5-codex`
- reviewer: `gpt-5.4`
- tester: `gpt-5-mini`

### 默认提示词模板

```text
Use team.plan first. Then run the full Agent Team workflow with waitForCompletion=true. Do not skip review or test. After the run, call team.status and summarize the backend, trace id, last agent, remaining risk, and readiness.
```

## 4. 团队内推荐的排障顺序

先排环境，再排代码。推荐顺序：

1. `npm run doctor:codex`
2. `npm run build`
3. `npm run smoke:stdio`
4. `npm run smoke:http`
5. 如果已经设置 `OPENAI_API_KEY`，再跑 `npm run smoke:agents`

## 5. 为什么要加 doctor 脚本

新增的自检脚本：

- [scripts/codex-doctor.ts](/D:/workspace/CodexTeam/scripts/codex-doctor.ts)

以及 npm 命令：

```powershell
npm run doctor:codex
```

它会检查：

- `AGENTS.md`
- `.codex/config.toml`
- `dist` 构建产物是否存在
- `OPENAI_API_KEY` 是否已设置
- 画布静态资源是否齐全

这个脚本最适合在团队内作为“先跑这个，再提问题”的第一步。

## 6. 两层代理，不要混淆

### 第一层：Codex

Codex 是主代理，是人直接对话的对象。

它负责：

- 读取仓库
- 读取 `AGENTS.md`
- 调用 MCP 工具
- 整理对人的输出

### 第二层：Agent Team 后端

这是 Codex 调用的 MCP 后端能力。

它负责：

- 计划
- 实现建议
- review
- test 建议
- 运行状态和 trace 元数据

## 7. 推荐的交接方式

如果你要把这个仓库交给别人，建议直接交付下面这些内容：

1. 仓库路径或仓库地址
2. [docs/user-guide.zh-CN.md](/D:/workspace/CodexTeam/docs/user-guide.zh-CN.md)
3. [docs/team-onboarding.zh-CN.md](/D:/workspace/CodexTeam/docs/team-onboarding.zh-CN.md)
4. 一条可直接复用的 Codex 提示词
5. 一句要求：先执行 `npm run doctor:codex`

## 8. 给新同事的最短消息模板

把这段直接发出去就可以：

```text
1. 进入仓库根目录
2. 执行 npm install
3. 执行 npm run build
4. 执行 npm run doctor:codex
5. 如需真实多代理运行，在同一 shell 里设置 OPENAI_API_KEY
6. 用 Codex 打开并 trust 当前仓库
7. 在 Codex 里执行 /mcp，确认有 agent_team 和 team.plan/team.run/team.status/team.review/team.cancel
8. 发送：Use team.plan first. Then run the full Agent Team workflow with waitForCompletion=true. Do not skip review or test.
```

## 9. 管理者建议

如果你是团队负责人，建议：

- 把 `.codex/config.toml` 作为仓库标准模板维护
- 不要让每个人自行改 MCP 工具名
- 统一提示词模板
- 统一排障顺序
- 优先用自检脚本和 smoke 脚本定位问题

这样团队内的使用体验会稳定很多。
