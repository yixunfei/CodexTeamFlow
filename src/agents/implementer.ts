import type { ImplementationArtifact, RuntimeStageContext } from "../types.js";

export function createImplementationArtifact(context: RuntimeStageContext): ImplementationArtifact {
  const deliverables = [
    "A runnable MCP server exposing team.plan, team.run, team.status, team.review, and team.cancel.",
    "An orchestrator that runs plan, implement, review, and test in sequence.",
    "A persistent task store so status survives process restarts.",
    "Repository documents and sample Codex integration files.",
  ];

  if (context.profile.includesPlugin) {
    deliverables.push("A documented placeholder for a future IDE or editor plugin surface.");
  }

  const validationNotes = [
    "Prefer a small number of high-level tools so Codex stays in control of the conversation.",
    "Persist enough task state to resume inspection even if the server is restarted.",
    "Keep live OpenAI integration optional so local smoke tests do not require credentials.",
  ];

  return {
    summary:
      "Implement the Agent Team backend as a TypeScript stdio MCP server with a JSON-backed task store and a sequential orchestrator.",
    deliverables,
    suggestedFiles: context.profile.suggestedFiles,
    validationNotes,
  };
}
