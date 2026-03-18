import { z } from "zod";

export const planInputSchema = z.object({
  goal: z.string().min(1).describe("The objective the Agent Team should plan."),
  constraints: z
    .array(z.string())
    .default([])
    .describe("Optional constraints, preferences, or non-goals."),
});

export const runInputSchema = z.object({
  taskId: z.string().optional().describe("An existing task to continue."),
  goal: z.string().optional().describe("A new goal to execute if taskId is omitted."),
  constraints: z
    .array(z.string())
    .default([])
    .describe("Optional constraints, preferences, or non-goals."),
  waitForCompletion: z
    .boolean()
    .default(false)
    .describe("When true, wait for the full plan-implement-review-test loop to finish."),
});

export const statusInputSchema = z.object({
  taskId: z.string().min(1).describe("The task identifier returned by team.plan or team.run."),
});

export const reviewInputSchema = z.object({
  taskId: z.string().optional().describe("Review an existing task."),
  target: z.string().optional().describe("Review an arbitrary target summary or diff description."),
});

export const cancelInputSchema = z.object({
  taskId: z.string().min(1).describe("The task to cancel."),
});

export const planOutputSchema = z.object({
  taskId: z.string(),
  status: z.string(),
  backend: z.string(),
  goal: z.string(),
  steps: z.array(z.string()),
  risks: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
});

export const runOutputSchema = z.object({
  taskId: z.string(),
  status: z.string(),
  backend: z.string(),
  started: z.boolean(),
  currentStage: z.string().optional(),
  summary: z.string().optional(),
});

export const statusOutputSchema = z.object({
  taskId: z.string(),
  status: z.string(),
  backend: z.string(),
  goal: z.string(),
  currentStage: z.string().optional(),
  summary: z.string().optional(),
  updatedAt: z.string(),
  traceId: z.string().optional(),
  lastResponseId: z.string().optional(),
  lastAgent: z.string().optional(),
  recentHistory: z.array(z.string()),
});

export const reviewOutputSchema = z.object({
  taskId: z.string().optional(),
  findings: z.array(
    z.object({
      severity: z.string(),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  recommendations: z.array(z.string()),
});

export const cancelOutputSchema = z.object({
  taskId: z.string(),
  status: z.string(),
  cancelled: z.boolean(),
});
