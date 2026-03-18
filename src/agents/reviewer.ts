import type { Finding, ReviewArtifact, RuntimeStageContext } from "../types.js";

export function createReviewArtifact(context: RuntimeStageContext): ReviewArtifact {
  const confirmedFindings: Finding[] = [];
  const focusAreas = [
    "MCP tool names and arguments stay stable and easy for Codex to invoke.",
    "The orchestrator never skips review or test unless an operator chooses to.",
    "Cancellation and persisted history are available for long-running tasks.",
  ];

  if (context.profile.includesPlugin) {
    confirmedFindings.push({
      severity: "low",
      title: "Plugin UI is not part of the backend MVP",
      detail:
        "The current implementation provides the backend integration surface and documents where a future editor or IDE panel should attach, but it does not ship a GUI plugin.",
    });
  }

  if (context.goal.toLowerCase().includes("production")) {
    confirmedFindings.push({
      severity: "medium",
      title: "Single-process storage is intended for local MVP usage",
      detail:
        "The JSON task store is simple and durable enough for a demo or single-operator workflow, but a shared deployment would want a multi-user datastore and stronger locking.",
    });
  }

  return {
    confirmedFindings,
    focusAreas,
    recommendations: [
      "Keep the MCP surface small and push detailed workflow logic into the orchestrator.",
      "Treat the JSON store as an MVP persistence layer and swap it for a database before multi-user rollout.",
      "Add repository-specific test runners or issue tracker adapters only after the core team loop is stable.",
    ],
  };
}
