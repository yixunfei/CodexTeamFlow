import type { RuntimeStageContext, TestArtifact } from "../types.js";

export function createTestArtifact(context: RuntimeStageContext): TestArtifact {
  const hasBlockingFinding = context.review?.confirmedFindings.some(
    (finding) => finding.severity === "high",
  );

  const checks = [
    "Build the TypeScript project successfully.",
    "Run the type checker without errors.",
    "Smoke-test team.plan, team.run, team.status, and team.cancel with a sample goal.",
  ];

  const suggestedCommands = ["npm run build", "npm run check"];

  if (context.profile.includesPlugin) {
    checks.push("Verify the documented editor or IDE integration path against the MCP server.");
  }

  return {
    status: hasBlockingFinding ? "warning" : "ready",
    checks,
    suggestedCommands,
    exitCriteria: [
      "The MCP server boots and advertises the expected tools.",
      "A task can be planned, executed, inspected, and cancelled.",
      "The repository documentation matches the implemented workflow.",
    ],
  };
}
