import { buildGoalProfile } from "./goal-profile.js";
import type { PlanArtifact, RuntimeStageContext } from "../types.js";

export function createPlanArtifact(input: Pick<RuntimeStageContext, "goal" | "constraints">): {
  plan: PlanArtifact;
  profile: RuntimeStageContext["profile"];
} {
  const profile = buildGoalProfile(input.goal, input.constraints);
  const steps = [
    `Confirm the exact scope, success criteria, and boundaries for: ${input.goal}`,
    "Map the workflow into planner, implementer, reviewer, and tester responsibilities.",
    profile.includesMcp
      ? "Define the MCP tool contracts and how Codex should invoke them."
      : "Define the external tool contracts the team will rely on.",
    profile.includesCodex
      ? "Document repository instructions in AGENTS.md and Codex configuration."
      : "Document operator instructions and repository conventions.",
    "Plan the execution order, checkpoints, and rollback or cancellation path.",
  ];

  if (profile.includesDocs) {
    steps.push("Write architecture and usage documents that match the implemented workflow.");
  }

  if (profile.includesTests || profile.includesBackend) {
    steps.push("Add type-check and smoke-test gates before the task is considered complete.");
  }

  const risks = [
    "Codex prompt flow and MCP tool granularity can drift if tool names become too low-level.",
    "Long-running executions need a clear status and cancellation path to avoid stale sessions.",
    "If live OpenAI narration is enabled, model access and environment setup can block execution.",
  ];

  if (profile.includesPlugin) {
    risks.push("Editor or IDE integration may add UI work that is out of scope for the backend MVP.");
  }

  const acceptanceCriteria = [
    "Codex can invoke a stable set of Agent Team MCP tools.",
    "The team workflow always includes plan, implement, review, and test phases.",
    "Operators can inspect status and cancel in-flight work without losing task history.",
    "The repository contains usage guidance and official reference links.",
  ];

  const plan: PlanArtifact = {
    steps,
    risks,
    acceptanceCriteria,
    agentAssignments: [
      { agent: "planner", focus: "scope, risks, and checkpoints" },
      { agent: "implementer", focus: "deliver the orchestration and server wiring" },
      { agent: "reviewer", focus: "look for integration and regression risks" },
      { agent: "tester", focus: "define validation gates and smoke checks" },
    ],
  };

  return { plan, profile };
}
