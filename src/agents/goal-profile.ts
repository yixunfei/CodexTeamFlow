import type { GoalProfile } from "../types.js";

const keywordMap = [
  "codex",
  "mcp",
  "agent",
  "team",
  "plugin",
  "extension",
  "editor",
  "docs",
  "documentation",
  "config",
  "test",
  "testing",
  "api",
  "frontend",
  "backend",
  "review",
];

export function buildGoalProfile(goal: string, constraints: string[]): GoalProfile {
  const source = `${goal} ${constraints.join(" ")}`.toLowerCase();
  const keywords = keywordMap.filter((keyword) => source.includes(keyword));
  const suggestedFiles = new Set<string>();

  const includesCodex = source.includes("codex");
  const includesMcp = source.includes("mcp");
  const includesDocs = source.includes("docs") || source.includes("documentation");
  const includesPlugin =
    source.includes("plugin") || source.includes("extension") || source.includes("editor");
  const includesApi = source.includes("api");
  const includesConfig = source.includes("config") || source.includes("configuration");
  const includesTests = source.includes("test");
  const includesFrontend =
    source.includes("frontend") || source.includes("ui") || source.includes("web");
  const includesBackend =
    source.includes("backend") ||
    source.includes("server") ||
    source.includes("orchestrator") ||
    source.includes("service");

  if (includesCodex) {
    suggestedFiles.add("AGENTS.md");
    suggestedFiles.add(".codex/config.toml");
  }

  if (includesMcp || includesBackend) {
    suggestedFiles.add("src/index.ts");
    suggestedFiles.add("src/orchestrator/agent-team-orchestrator.ts");
    suggestedFiles.add("src/storage/json-task-store.ts");
  }

  if (includesDocs || includesCodex) {
    suggestedFiles.add("README.md");
    suggestedFiles.add("docs/architecture.md");
    suggestedFiles.add("docs/official-openai-reference.md");
  }

  if (includesPlugin || includesFrontend) {
    suggestedFiles.add("extensions/README.md");
  }

  if (!suggestedFiles.size) {
    suggestedFiles.add("README.md");
    suggestedFiles.add("src/index.ts");
  }

  return {
    keywords,
    includesCodex,
    includesMcp,
    includesDocs,
    includesPlugin,
    includesApi,
    includesConfig,
    includesTests,
    includesFrontend,
    includesBackend,
    suggestedFiles: [...suggestedFiles],
  };
}
