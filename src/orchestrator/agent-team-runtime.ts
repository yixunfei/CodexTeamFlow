import { createImplementationArtifact } from "../agents/implementer.js";
import { createPlanArtifact } from "../agents/planner.js";
import { createReviewArtifact } from "../agents/reviewer.js";
import { createTestArtifact } from "../agents/tester.js";
import { nowIso } from "../utils/time.js";
import type {
  RuntimeExecutionOptions,
  RuntimeImplementationResult,
  RuntimePlanResult,
  RuntimeReviewResult,
  RuntimeSummaryResult,
  RuntimeStageContext,
  RuntimeBackend,
  RuntimeTestResult,
  TaskRuntimeState,
} from "../types.js";
import type { StageNarrator } from "./narrator.js";

export class AgentTeamRuntime {
  constructor(private readonly narrator: StageNarrator) {}

  get backend(): RuntimeBackend {
    return this.narrator.backend;
  }

  async plan(
    input: Pick<RuntimeStageContext, "goal" | "constraints">,
    _options?: RuntimeExecutionOptions,
  ): Promise<RuntimePlanResult> {
    const { plan, profile } = createPlanArtifact(input);
    const narrative = await this.narrator.generate("plan", {
      goal: input.goal,
      constraints: input.constraints,
      profile,
    });

    return {
      plan: {
        ...plan,
        modelNarrative: narrative,
      },
      profile,
      metadata: this.createMetadata("plan"),
    };
  }

  async implement(
    context: RuntimeStageContext,
    _options?: RuntimeExecutionOptions,
  ): Promise<RuntimeImplementationResult> {
    const base = createImplementationArtifact(context);
    const narrative = await this.narrator.generate("implement", context);
    return {
      implementation: {
        ...base,
        modelNarrative: narrative,
      },
      metadata: this.createMetadata("implement"),
    };
  }

  async review(
    context: RuntimeStageContext,
    _options?: RuntimeExecutionOptions,
  ): Promise<RuntimeReviewResult> {
    const base = createReviewArtifact(context);
    const narrative = await this.narrator.generate("review", context);
    return {
      review: {
        ...base,
        modelNarrative: narrative,
      },
      metadata: this.createMetadata("review"),
    };
  }

  async test(
    context: RuntimeStageContext,
    _options?: RuntimeExecutionOptions,
  ): Promise<RuntimeTestResult> {
    const base = createTestArtifact(context);
    const narrative = await this.narrator.generate("test", context);
    return {
      test: {
        ...base,
        modelNarrative: narrative,
      },
      metadata: this.createMetadata("test"),
    };
  }

  async summarize(
    context: RuntimeStageContext,
    _options?: RuntimeExecutionOptions,
  ): Promise<RuntimeSummaryResult> {
    const summary = [
      context.plan ? `Plan steps: ${context.plan.steps.length}` : "Plan steps: 0",
      context.implementation
        ? `Implementation deliverables: ${context.implementation.deliverables.length}`
        : "Implementation deliverables: 0",
      context.review
        ? `Confirmed findings: ${context.review.confirmedFindings.length}`
        : "Confirmed findings: 0",
      context.test ? `Test readiness: ${context.test.status}` : "Test readiness: unknown",
    ].join("\n");

    return {
      summary,
      metadata: this.createMetadata("test"),
    };
  }

  protected createMetadata(mode: TaskRuntimeState["mode"]): TaskRuntimeState {
    return {
      mode,
      backend: this.backend,
      updatedAt: nowIso(),
    };
  }
}
