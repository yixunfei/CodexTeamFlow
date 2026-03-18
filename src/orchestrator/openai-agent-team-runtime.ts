import { Agent, Runner, generateTraceId } from "@openai/agents";
import { z } from "zod";
import { buildGoalProfile } from "../agents/goal-profile.js";
import type { AppConfig } from "../config.js";
import type {
  AgentAssignment,
  Finding,
  ImplementationArtifact,
  PlanArtifact,
  ReviewArtifact,
  RuntimeBackend,
  RuntimeExecutionOptions,
  RuntimeImplementationResult,
  RuntimePlanResult,
  RuntimeReviewResult,
  RuntimeStageContext,
  RuntimeSummaryResult,
  RuntimeTestResult,
  TaskRuntimeState,
  TestArtifact,
} from "../types.js";
import { nowIso } from "../utils/time.js";
import { AgentTeamRuntime } from "./agent-team-runtime.js";
import { NoopNarrator } from "./narrator.js";

const agentAssignmentSchema = z.object({
  agent: z.enum(["planner", "implementer", "reviewer", "tester"]),
  focus: z.string().min(1),
});

const planArtifactSchema = z.object({
  steps: z.array(z.string().min(1)).min(3).max(10),
  risks: z.array(z.string().min(1)).min(2).max(8),
  acceptanceCriteria: z.array(z.string().min(1)).min(3).max(8),
  agentAssignments: z.array(agentAssignmentSchema).min(4).max(4),
  modelNarrative: z.string().min(1).max(1200).optional(),
});

const implementationArtifactSchema = z.object({
  summary: z.string().min(1).max(2000),
  deliverables: z.array(z.string().min(1)).min(3).max(10),
  suggestedFiles: z.array(z.string().min(1)).min(1).max(16),
  validationNotes: z.array(z.string().min(1)).min(2).max(8),
  modelNarrative: z.string().min(1).max(1200).optional(),
});

const findingSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(1200),
});

const reviewArtifactSchema = z.object({
  confirmedFindings: z.array(findingSchema).max(8),
  focusAreas: z.array(z.string().min(1)).min(2).max(8),
  recommendations: z.array(z.string().min(1)).min(2).max(8),
  modelNarrative: z.string().min(1).max(1200).optional(),
});

const testArtifactSchema = z.object({
  status: z.enum(["ready", "warning"]),
  checks: z.array(z.string().min(1)).min(3).max(10),
  suggestedCommands: z.array(z.string().min(1)).min(1).max(10),
  exitCriteria: z.array(z.string().min(1)).min(3).max(8),
  modelNarrative: z.string().min(1).max(1200).optional(),
});

const summarySchema = z.object({
  summary: z.string().min(1).max(1500),
});

const defaultAssignments: AgentAssignment[] = [
  { agent: "planner", focus: "scope, risks, and checkpoints" },
  { agent: "implementer", focus: "implementation deliverables and file impact" },
  { agent: "reviewer", focus: "correctness, regressions, and missing validation" },
  { agent: "tester", focus: "test strategy, exit criteria, and smoke checks" },
];

export class OpenAiAgentTeamRuntime extends AgentTeamRuntime {
  override get backend(): RuntimeBackend {
    return "agents-sdk";
  }
  private readonly plannerAgent: Agent<RuntimeStageContext, typeof planArtifactSchema>;
  private readonly implementerAgent: Agent<RuntimeStageContext, typeof implementationArtifactSchema>;
  private readonly reviewerAgent: Agent<RuntimeStageContext, typeof reviewArtifactSchema>;
  private readonly testerAgent: Agent<RuntimeStageContext, typeof testArtifactSchema>;
  private readonly summarizerAgent: Agent<RuntimeStageContext, typeof summarySchema>;

  constructor(private readonly config: AppConfig) {
    super(new NoopNarrator());

    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "AGENT_TEAM_RUNTIME=agents requires OPENAI_API_KEY so the Agents SDK can call the Responses API.",
      );
    }

    this.plannerAgent = new Agent({
      name: "Planner",
      handoffDescription: "Plans a software task into stages, risks, and acceptance criteria.",
      instructions: [
        "You are the planning specialist in a Codex + MCP Agent Team.",
        "Return a concrete implementation plan for the repository task.",
        "Keep steps actionable and ordered.",
        "Call out real risks and measurable acceptance criteria.",
        "Always provide planner, implementer, reviewer, and tester assignments.",
      ].join(" "),
      model: this.config.plannerModel,
      modelSettings: {
        reasoning: {
          effort: "high",
          summary: "concise",
        },
        text: {
          verbosity: "low",
        },
      },
      outputType: planArtifactSchema,
    });

    this.implementerAgent = new Agent({
      name: "Implementer",
      handoffDescription: "Turns the plan into concrete implementation deliverables and file targets.",
      instructions: [
        "You are the implementation specialist in a Codex + MCP Agent Team.",
        "You are not applying patches directly in this step.",
        "Return implementation guidance that is concrete, file-aware, and scoped to the repository goal.",
        "Suggested files must stay repository-relative.",
        "Validation notes should focus on what must be true after the implementation.",
      ].join(" "),
      model: this.config.implementerModel,
      modelSettings: {
        reasoning: {
          effort: "medium",
          summary: "concise",
        },
        text: {
          verbosity: "low",
        },
      },
      outputType: implementationArtifactSchema,
    });

    this.reviewerAgent = new Agent({
      name: "Reviewer",
      handoffDescription: "Finds correctness issues, regressions, and missing tests.",
      instructions: [
        "You are the review specialist in a Codex + MCP Agent Team.",
        "Only list confirmed or strongly supported findings.",
        "If there are no confirmed findings, return an empty confirmedFindings array.",
        "Focus on correctness, regressions, safety, and missing validation.",
      ].join(" "),
      model: this.config.reviewerModel,
      modelSettings: {
        reasoning: {
          effort: "high",
          summary: "concise",
        },
        text: {
          verbosity: "low",
        },
      },
      outputType: reviewArtifactSchema,
    });

    this.testerAgent = new Agent({
      name: "Tester",
      handoffDescription: "Defines validation checks, commands, and exit criteria.",
      instructions: [
        "You are the testing specialist in a Codex + MCP Agent Team.",
        "Return the smallest strong set of checks that proves the task is safe.",
        "Use status=warning if review findings materially affect release readiness.",
        "Suggested commands should be realistic for a Node.js or TypeScript repository unless context says otherwise.",
      ].join(" "),
      model: this.config.testerModel,
      modelSettings: {
        reasoning: {
          effort: "medium",
          summary: "concise",
        },
        text: {
          verbosity: "low",
        },
      },
      outputType: testArtifactSchema,
    });

    this.summarizerAgent = new Agent({
      name: "Coordinator",
      handoffDescription: "Summarizes the full multi-agent workflow into an operator-friendly final summary.",
      instructions: [
        "You are the coordinating summarizer for a Codex + MCP Agent Team.",
        "Summarize the completed workflow in a concise operator-facing way.",
        "Mention the strongest remaining risk if one exists.",
        "Do not invent file changes or findings that are not present in the provided artifacts.",
      ].join(" "),
      model: this.config.managerModel,
      modelSettings: {
        reasoning: {
          effort: "medium",
          summary: "concise",
        },
        text: {
          verbosity: "low",
        },
      },
      outputType: summarySchema,
    });
  }

  override async plan(
    input: Pick<RuntimeStageContext, "goal" | "constraints">,
    options?: RuntimeExecutionOptions,
  ): Promise<RuntimePlanResult> {
    const profile = buildGoalProfile(input.goal, input.constraints);
    const { output, metadata } = await this.runStructuredAgent({
      agent: this.plannerAgent,
      schema: planArtifactSchema,
      stage: "plan",
      taskId: options?.taskId,
      signal: options?.signal,
      runtimeState: options?.runtimeState,
      inputText: renderPlannerPrompt(input.goal, input.constraints, profile),
      maxTurns: 10,
    });

    return {
      plan: normalizePlanArtifact(output as z.infer<typeof planArtifactSchema>, profile),
      profile,
      metadata,
    };
  }

  override async implement(
    context: RuntimeStageContext,
    options?: RuntimeExecutionOptions,
  ): Promise<RuntimeImplementationResult> {
    const { output, metadata } = await this.runStructuredAgent({
      agent: this.implementerAgent,
      schema: implementationArtifactSchema,
      stage: "implement",
      taskId: options?.taskId,
      signal: options?.signal,
      runtimeState: options?.runtimeState,
      inputText: renderImplementationPrompt(context),
      maxTurns: 10,
    });

    return {
      implementation: normalizeImplementationArtifact(
        output as z.infer<typeof implementationArtifactSchema>,
        context,
      ),
      metadata,
    };
  }

  override async review(
    context: RuntimeStageContext,
    options?: RuntimeExecutionOptions,
  ): Promise<RuntimeReviewResult> {
    const { output, metadata } = await this.runStructuredAgent({
      agent: this.reviewerAgent,
      schema: reviewArtifactSchema,
      stage: "review",
      taskId: options?.taskId,
      signal: options?.signal,
      runtimeState: options?.runtimeState,
      inputText: renderReviewPrompt(context),
      maxTurns: 10,
    });

    return {
      review: normalizeReviewArtifact(output as z.infer<typeof reviewArtifactSchema>),
      metadata,
    };
  }

  override async test(
    context: RuntimeStageContext,
    options?: RuntimeExecutionOptions,
  ): Promise<RuntimeTestResult> {
    const { output, metadata } = await this.runStructuredAgent({
      agent: this.testerAgent,
      schema: testArtifactSchema,
      stage: "test",
      taskId: options?.taskId,
      signal: options?.signal,
      runtimeState: options?.runtimeState,
      inputText: renderTestPrompt(context),
      maxTurns: 10,
    });

    return {
      test: normalizeTestArtifact(output as z.infer<typeof testArtifactSchema>, context.review),
      metadata,
    };
  }

  override async summarize(
    context: RuntimeStageContext,
    options?: RuntimeExecutionOptions,
  ): Promise<RuntimeSummaryResult> {
    const { output, metadata } = await this.runStructuredAgent({
      agent: this.summarizerAgent,
      schema: summarySchema,
      stage: "test",
      taskId: options?.taskId,
      signal: options?.signal,
      runtimeState: options?.runtimeState,
      inputText: renderSummaryPrompt(context),
      maxTurns: 8,
    });

    return {
      summary: (output as z.infer<typeof summarySchema>).summary.trim(),
      metadata,
    };
  }

  private async runStructuredAgent(args: {
    agent: Agent<RuntimeStageContext, any>;
    schema: z.ZodTypeAny;
    stage: TaskRuntimeState["mode"];
    inputText: string;
    taskId?: string;
    signal?: AbortSignal;
    runtimeState?: TaskRuntimeState;
    maxTurns: number;
  }): Promise<{ output: unknown; metadata: TaskRuntimeState }> {
    const traceId = generateTraceId();
    const runner = new Runner({
      workflowName: `Agent Team ${capitalize(args.stage)}`,
      groupId: args.taskId,
      traceId,
      traceMetadata: {
        taskId: args.taskId || "ad-hoc",
        stage: args.stage,
        backend: this.backend,
      },
    });

    const result = await runner.run(args.agent, args.inputText, {
      maxTurns: args.maxTurns,
      signal: args.signal,
      previousResponseId:
        args.runtimeState?.backend === this.backend ? args.runtimeState.lastResponseId : undefined,
    });

    if (result.finalOutput === undefined) {
      throw new Error(`The ${args.stage} agent completed without a final output.`);
    }

    return {
      output: args.schema.parse(result.finalOutput),
      metadata: {
        mode: args.stage,
        backend: this.backend,
        updatedAt: nowIso(),
        traceId,
        lastResponseId: result.lastResponseId,
        lastAgent: result.lastAgent?.name,
      },
    };
  }
}

function renderPlannerPrompt(
  goal: string,
  constraints: string[],
  profile: ReturnType<typeof buildGoalProfile>,
): string {
  return [
    "Create the plan for this repository task.",
    renderGoalBlock(goal, constraints),
    renderProfileBlock(profile),
    "The plan should assume the work is being performed through Codex and MCP, and should stay grounded in the repository structure implied by the profile.",
  ].join("\n\n");
}

function renderImplementationPrompt(context: RuntimeStageContext): string {
  return [
    "Create the implementation artifact for this task.",
    renderGoalBlock(context.goal, context.constraints),
    renderProfileBlock(context.profile),
    renderArtifactBlock("Plan", context.plan),
    "Focus on concrete implementation deliverables, the files or areas likely to be touched, and the validation notes that matter most.",
  ].join("\n\n");
}

function renderReviewPrompt(context: RuntimeStageContext): string {
  return [
    "Review the proposed task and identify only supported findings.",
    renderGoalBlock(context.goal, context.constraints),
    renderProfileBlock(context.profile),
    renderArtifactBlock("Plan", context.plan),
    renderArtifactBlock("Implementation", context.implementation),
    "If you do not have a confirmed finding, return an empty confirmedFindings list and use recommendations for residual risk and follow-up.",
  ].join("\n\n");
}

function renderTestPrompt(context: RuntimeStageContext): string {
  return [
    "Create the test and validation artifact for this task.",
    renderGoalBlock(context.goal, context.constraints),
    renderProfileBlock(context.profile),
    renderArtifactBlock("Plan", context.plan),
    renderArtifactBlock("Implementation", context.implementation),
    renderArtifactBlock("Review", context.review),
    "Suggested commands should be realistic, concise, and immediately runnable where possible.",
  ].join("\n\n");
}

function renderSummaryPrompt(context: RuntimeStageContext): string {
  return [
    "Summarize the full multi-agent workflow for the operator.",
    renderGoalBlock(context.goal, context.constraints),
    renderArtifactBlock("Plan", context.plan),
    renderArtifactBlock("Implementation", context.implementation),
    renderArtifactBlock("Review", context.review),
    renderArtifactBlock("Test", context.test),
    "The summary should mention the implementation scope, the strongest remaining risk, and whether the task is ready or warning-level.",
  ].join("\n\n");
}

function renderGoalBlock(goal: string, constraints: string[]): string {
  return [
    `Goal: ${goal}`,
    constraints.length ? `Constraints: ${constraints.join("; ")}` : "Constraints: none provided",
  ].join("\n");
}

function renderProfileBlock(profile: ReturnType<typeof buildGoalProfile>): string {
  return [
    profile.keywords.length ? `Detected signals: ${profile.keywords.join(", ")}` : "Detected signals: none",
    profile.suggestedFiles.length
      ? `Suggested files: ${profile.suggestedFiles.join(", ")}`
      : "Suggested files: none",
  ].join("\n");
}

function renderArtifactBlock(label: string, artifact: unknown): string {
  if (!artifact) {
    return `${label}: none`;
  }

  return `${label}:\n${JSON.stringify(artifact, null, 2)}`;
}

function normalizePlanArtifact(
  artifact: z.infer<typeof planArtifactSchema>,
  profile: ReturnType<typeof buildGoalProfile>,
): PlanArtifact {
  return {
    steps: dedupeStrings(artifact.steps),
    risks: dedupeStrings(artifact.risks),
    acceptanceCriteria: dedupeStrings(artifact.acceptanceCriteria),
    agentAssignments: artifact.agentAssignments.length ? artifact.agentAssignments : defaultAssignments,
    modelNarrative: withOptionalText(artifact.modelNarrative, profile.keywords),
  };
}

function normalizeImplementationArtifact(
  artifact: z.infer<typeof implementationArtifactSchema>,
  context: RuntimeStageContext,
): ImplementationArtifact {
  return {
    summary: artifact.summary.trim(),
    deliverables: dedupeStrings(artifact.deliverables),
    suggestedFiles: dedupeStrings([...artifact.suggestedFiles, ...context.profile.suggestedFiles]),
    validationNotes: dedupeStrings(artifact.validationNotes),
    modelNarrative: withOptionalText(artifact.modelNarrative, context.profile.keywords),
  };
}

function normalizeReviewArtifact(artifact: z.infer<typeof reviewArtifactSchema>): ReviewArtifact {
  const confirmedFindings: Finding[] = artifact.confirmedFindings.map((finding) => ({
    severity: finding.severity,
    title: finding.title.trim(),
    detail: finding.detail.trim(),
  }));

  return {
    confirmedFindings,
    focusAreas: dedupeStrings(artifact.focusAreas),
    recommendations: dedupeStrings(artifact.recommendations),
    modelNarrative: withOptionalText(artifact.modelNarrative),
  };
}

function normalizeTestArtifact(
  artifact: z.infer<typeof testArtifactSchema>,
  review?: ReviewArtifact,
): TestArtifact {
  const hasHighFinding = review?.confirmedFindings.some((finding) => finding.severity === "high");
  return {
    status: hasHighFinding ? "warning" : artifact.status,
    checks: dedupeStrings(artifact.checks),
    suggestedCommands: dedupeStrings(artifact.suggestedCommands),
    exitCriteria: dedupeStrings(artifact.exitCriteria),
    modelNarrative: withOptionalText(artifact.modelNarrative),
  };
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function withOptionalText(value?: string, keywords?: string[]): string | undefined {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (!keywords?.length) {
    return undefined;
  }

  return `Generated with focus on: ${keywords.join(", ")}.`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
