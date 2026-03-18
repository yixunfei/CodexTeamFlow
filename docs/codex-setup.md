# Codex Setup

This guide explains how to connect the repository to Codex as a real MCP backend, with the live `Responses API + Agents SDK` runtime enabled.

If you want a full step-by-step operator guide in Chinese, including trust checks, MCP validation, prompt templates, config precedence, and canvas usage, see [user-guide.zh-CN.md](/D:/workspace/CodexTeam/docs/user-guide.zh-CN.md).

For team rollout, onboarding, and a repeatable first-day setup checklist, also see [team-onboarding.zh-CN.md](/D:/workspace/CodexTeam/docs/team-onboarding.zh-CN.md).

As of `2026-03-17`, OpenAI documents that Codex supports MCP over both `STDIO` and `Streamable HTTP`.  
Source: [Codex MCP](https://developers.openai.com/codex/mcp)

OpenAI also notes in the Codex CLI docs that Windows support is experimental and recommends WSL for the smoothest experience. If you stay on native Windows, this repository still works, but WSL remains the safer choice for longer sessions.  
Source: [Codex CLI](https://developers.openai.com/codex/cli)

## Requirements

1. `Node.js` installed
2. `npm install`
3. `npm run build`
4. `OPENAI_API_KEY` set if you want the live `agents` runtime

## Recommended mode: STDIO

The project already includes a working stdio config at [.codex/config.toml](../.codex/config.toml).

Important details in that file:

- `env_vars = ["OPENAI_API_KEY"]` forwards your API key into the MCP child process
- `AGENT_TEAM_RUNTIME = "agents"` forces the live multi-agent backend
- Per-role model env vars are set in the MCP config itself

### Steps

1. Build the project:

```bash
npm install
npm run build
```

2. Set your API key before launching Codex:

```bash
$env:OPENAI_API_KEY="sk-..."
```

3. Open the repository in Codex and trust the workspace.

4. Let Codex read:

- `AGENTS.md`
- `.codex/config.toml`

5. In Codex, confirm that the following tools are available:

- `team.plan`
- `team.run`
- `team.status`
- `team.review`
- `team.cancel`

## Alternative mode: Streamable HTTP

Use this when you want a long-running local backend or when another local UI should share the same service.

Start the server manually:

```bash
$env:OPENAI_API_KEY="sk-..."
$env:AGENT_TEAM_RUNTIME="agents"
$env:AGENT_TEAM_TRANSPORT="http"
npm run start:http
```

By default the endpoint is:

```text
http://127.0.0.1:3000/mcp
```

Health endpoint:

```text
http://127.0.0.1:3000/healthz
```

Visual canvas:

```text
http://127.0.0.1:3000/canvas
```

The canvas is intended for operator workflows outside Codex itself: it shows recent tasks, stage artifacts, runtime metadata, and a full config editor for the HTTP deployment. Config changes are persisted to `.agent-team/config.overrides.json` and the page shows when a restart is needed.

Use the sample config at [.codex/config.http.example.toml](../.codex/config.http.example.toml).

## How to tell the live runtime is active

When the real Agents SDK path is active:

- `team.plan` and `team.run` report `backend = "agents-sdk"`
- `team.status` returns `traceId`
- `team.status` returns `lastResponseId`
- `team.status` often returns `lastAgent`

If you instead see `backend = "local"`, Codex started the fallback runtime instead of the live one.

## Verification commands

Deterministic offline checks:

```bash
$env:AGENT_TEAM_RUNTIME="local"
npm run smoke:stdio
npm run smoke:http
```

Live Agents SDK check:

```bash
$env:OPENAI_API_KEY="sk-..."
npm run smoke:agents
```

HTTP canvas check:

```bash
npm run smoke:dashboard
```

General compile checks:

```bash
npm run check
npm run build
```

## Recommended Codex prompts

Use prompts that keep Codex in control while delegating long-running orchestration:

```text
Use team.plan first. Then run the full Agent Team workflow with waitForCompletion=true. Do not skip review or test. After the run, call team.status and report the trace id, last agent, remaining risk, and whether the task is ready or warning-level.
```

## Troubleshooting

### Codex sees the MCP server but the backend falls back to local

Check:

1. `OPENAI_API_KEY` is set in the shell before Codex starts
2. `.codex/config.toml` still forwards `OPENAI_API_KEY`
3. `AGENT_TEAM_RUNTIME` is not being overridden to `local`

### The server fails at startup

The live runtime will fail fast if:

- `AGENT_TEAM_RUNTIME=agents`
- but `OPENAI_API_KEY` is missing

That failure is intentional so Codex does not silently claim to be using the live backend when it is not.

### You want deterministic test output

Set:

```bash
$env:AGENT_TEAM_RUNTIME="local"
```

That disables live model calls and keeps the existing smoke tests deterministic.
