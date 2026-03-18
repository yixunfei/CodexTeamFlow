# Official OpenAI Reference Notes

These notes summarize the official OpenAI documentation used to justify the repository design and implementation. They were rechecked on `2026-03-17`.

## 1. Codex is already the operator UI

OpenAI positions `Codex` as the coding agent, which means you do not need to build a custom editor first just to run an Agent Team. For this repository, Codex is the human-facing shell and the MCP server is the backend extension point.

Sources:

- [Codex](https://developers.openai.com/codex)
- [Codex CLI](https://developers.openai.com/codex/cli)

## 2. `AGENTS.md` is the right repository instruction layer

OpenAI documents that Codex reads `AGENTS.md`, and that instructions are layered from global to local scope. That is why this repository uses `AGENTS.md` to tell Codex when to call the Agent Team tools instead of inventing a separate prompt-loader.

Sources:

- [AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Config basics](https://developers.openai.com/codex/config-basic)

## 3. MCP is the stable integration surface

OpenAI documents Codex support for MCP servers over both `STDIO` and `Streamable HTTP`, and the MCP config supports forwarding environment variables into child processes. That is why the repository preserves a small tool surface instead of asking Codex to orchestrate shell commands directly.

Sources:

- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk)

Repo mapping:

- `.codex/config.toml` forwards `OPENAI_API_KEY`
- `.codex/config.toml` pins `AGENT_TEAM_RUNTIME=agents`
- The server exposes only `team.plan`, `team.run`, `team.status`, `team.review`, `team.cancel`

## 4. Responses API is the correct backend for new agentic work

OpenAI's current migration guidance recommends the `Responses API` for new projects. The same docs also explain conversation state, including continuation via `previous_response_id`.

Sources:

- [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [Conversation state](https://platform.openai.com/docs/guides/conversation-state)

Repo mapping:

- The live runtime uses `@openai/agents`, which runs on top of the Responses stack
- `src/orchestrator/openai-agent-team-runtime.ts` reuses `lastResponseId` as `previousResponseId`

## 5. Agents SDK is the correct orchestration library

OpenAI documents the `Agents SDK` as the toolkit for tools, handoffs, guardrails, streaming, and traces. This repository uses that SDK directly for the live runtime, but deliberately keeps the stage scheduler deterministic in the app layer.

Sources:

- [Agents SDK](https://developers.openai.com/api/docs/guides/agents-sdk)
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk)

Repo mapping:

- Every live role is a real `Agent`
- Each stage runs through `Runner.run(...)`
- The runtime assigns a `traceId` per stage
- `team.status` exposes `traceId`, `lastResponseId`, and `lastAgent`

This means the project is truly using the `Agents SDK`, but without letting a free-form manager model decide whether to skip required workflow stages.

## 6. Model guidance for this repository

OpenAI's model guidance changes over time, so the repository keeps model choice configurable with environment variables. Current docs say to start with `gpt-5.4` when unsure, and OpenAI also documents Codex-oriented coding models such as `GPT-5-Codex`.

Sources:

- [Models](https://developers.openai.com/api/docs/models)
- [Code generation](https://developers.openai.com/api/docs/guides/code-generation)
- [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)
- [GPT-5-Codex](https://developers.openai.com/api/docs/models/gpt-5-codex)

Repo mapping:

- Shared default model: `gpt-5.4`
- Default implementer model: `gpt-5-codex`
- All role models can be overridden through `.env` or `.codex/config.toml`

## 7. Why the implementation keeps a local fallback

The official docs support a fully online stack, but a local fallback remains useful for:

- deterministic smoke tests
- repository demos
- running without credentials

That is why the project supports three runtime modes:

- `local`
- `assisted`
- `agents`

The live path is now real, but the local path remains valuable for verification and development ergonomics.
