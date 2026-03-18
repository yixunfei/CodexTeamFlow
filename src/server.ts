import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { AgentTeamOrchestrator } from "./orchestrator/agent-team-orchestrator.js";
import {
  cancelInputSchema,
  cancelOutputSchema,
  planInputSchema,
  planOutputSchema,
  reviewInputSchema,
  reviewOutputSchema,
  runInputSchema,
  runOutputSchema,
  statusInputSchema,
  statusOutputSchema,
} from "./schemas.js";

export function createMcpServer(orchestrator: AgentTeamOrchestrator): McpServer {
  const server = new McpServer({
    name: "agent-team",
    version: "0.1.0",
  });

  server.registerTool(
    "team.plan",
    {
      title: "Plan Agent Team Work",
      description: "Create a new Agent Team task plan for a goal and its constraints.",
      inputSchema: planInputSchema,
      outputSchema: planOutputSchema,
    },
    async ({ goal, constraints }) => {
      try {
        const task = await orchestrator.plan(goal, constraints);
        const payload = {
          taskId: task.id,
          status: task.status,
          backend: task.backend,
          goal: task.goal,
          steps: task.plan?.steps || [],
          risks: task.plan?.risks || [],
          acceptanceCriteria: task.plan?.acceptanceCriteria || [],
        };
        return toolSuccess(planOutputSchema, payload, `Planned task ${task.id}.`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "team.run",
    {
      title: "Run Agent Team Work",
      description: "Execute the plan-implement-review-test sequence for an Agent Team task.",
      inputSchema: runInputSchema.superRefine((value, ctx) => {
        if (!value.taskId && !value.goal) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either taskId or goal.",
            path: ["goal"],
          });
        }
      }),
      outputSchema: runOutputSchema,
    },
    async ({ taskId, goal, constraints, waitForCompletion }) => {
      try {
        const result = await orchestrator.run({
          taskId,
          goal,
          constraints,
          waitForCompletion,
        });
        const payload = {
          taskId: result.task.id,
          status: result.task.status,
          backend: result.task.backend,
          started: result.started,
          currentStage: result.task.currentStage,
          summary: result.task.summary,
        };
        return toolSuccess(
          runOutputSchema,
          payload,
          result.started
            ? `Execution started for ${result.task.id}.`
            : `Execution was already in progress for ${result.task.id}.`,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "team.status",
    {
      title: "Check Agent Team Status",
      description: "Inspect the latest status, stage, and recent history for a task.",
      inputSchema: statusInputSchema,
      outputSchema: statusOutputSchema,
    },
    async ({ taskId }) => {
      try {
        const task = await orchestrator.status(taskId);
        const payload = {
          taskId: task.id,
          status: task.status,
          backend: task.backend,
          goal: task.goal,
          currentStage: task.currentStage,
          summary: task.summary,
          updatedAt: task.updatedAt,
          traceId: task.runtimeState?.traceId,
          lastResponseId: task.runtimeState?.lastResponseId,
          lastAgent: task.runtimeState?.lastAgent,
          recentHistory: task.history.slice(-5).map((entry) => `[${entry.stage}] ${entry.message}`),
        };
        return toolSuccess(statusOutputSchema, payload, `Fetched status for ${task.id}.`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "team.review",
    {
      title: "Review Agent Team Work",
      description: "Generate a review snapshot for an existing task or an arbitrary target.",
      inputSchema: reviewInputSchema.superRefine((value, ctx) => {
        if (!value.taskId && !value.target) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide either taskId or target.",
            path: ["target"],
          });
        }
      }),
      outputSchema: reviewOutputSchema,
    },
    async ({ taskId, target }) => {
      try {
        const review = await orchestrator.review({ taskId, target });
        const payload = {
          taskId,
          findings: review.confirmedFindings,
          recommendations: review.recommendations,
        };
        return toolSuccess(
          reviewOutputSchema,
          payload,
          review.confirmedFindings.length
            ? `Review completed with ${review.confirmedFindings.length} findings.`
            : "Review completed with no confirmed findings.",
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "team.cancel",
    {
      title: "Cancel Agent Team Work",
      description: "Request cancellation for an in-flight Agent Team task.",
      inputSchema: cancelInputSchema,
      outputSchema: cancelOutputSchema,
    },
    async ({ taskId }) => {
      try {
        const task = await orchestrator.cancel(taskId);
        const payload = {
          taskId: task.id,
          status: task.status,
          cancelled: task.cancelRequested,
        };
        return toolSuccess(cancelOutputSchema, payload, `Cancellation requested for ${task.id}.`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

function toolSuccess<T extends ZodTypeAny>(
  schema: T,
  payload: z.infer<T>,
  label: string,
): CallToolResult {
  const parsed = schema.parse(payload);
  const structuredContent =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  return {
    content: [
      {
        type: "text",
        text: `${label}\n\n${JSON.stringify(parsed, null, 2)}`,
      },
    ],
    structuredContent,
  };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Agent Team tool failed: ${message}`,
      },
    ],
    structuredContent: {
      error: message,
    },
  };
}
