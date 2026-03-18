import { buildGoalProfile } from "../agents/goal-profile.js";
import { JsonTaskStore } from "../storage/json-task-store.js";
import type {
  AgentTeamTask,
  ImplementationArtifact,
  PlanArtifact,
  ReviewArtifact,
  ReviewRequest,
  RunRequest,
  RuntimeStageContext,
  StageName,
  TaskStatus,
  TaskRuntimeState,
  TestArtifact,
} from "../types.js";
import { createTaskId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import { AgentTeamRuntime } from "./agent-team-runtime.js";

export class AgentTeamOrchestrator {
  private readonly activeRuns = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<AgentTeamTask>;
    }
  >();

  constructor(
    private readonly store: JsonTaskStore,
    private readonly runtime: AgentTeamRuntime,
  ) {}

  async plan(goal: string, constraints: string[]): Promise<AgentTeamTask> {
    const task = await this.store.create(
      this.createTask({
        goal,
        constraints,
        status: "pending",
      }),
    );

    return this.generatePlan(task.id);
  }

  async run(request: RunRequest): Promise<{ task: AgentTeamTask; started: boolean }> {
    const task = request.taskId
      ? await this.requireTask(request.taskId)
      : await this.store.create(
          this.createTask({
            goal: request.goal || "No goal provided",
            constraints: request.constraints,
            status: "pending",
          }),
        );

    const existing = this.activeRuns.get(task.id);
    if (existing) {
      return {
        task: await this.requireTask(task.id),
        started: false,
      };
    }

    const controller = new AbortController();
    const runPromise = this.execute(task.id, controller.signal)
      .catch(async (error) => {
        if (isCancellationError(error)) {
          await this.markTaskCancelled(task.id, "Task execution cancelled.");
          return this.requireTask(task.id);
        }

        const message = error instanceof Error ? error.message : String(error);
        await this.store.update(task.id, (current) =>
          this.withHistory(
            {
              ...current,
              status: "failed",
              error: message,
              updatedAt: nowIso(),
            },
            "system",
            `Task execution failed: ${message}`,
          ),
        );

        return this.requireTask(task.id);
      })
      .finally(() => {
        this.activeRuns.delete(task.id);
      });

    this.activeRuns.set(task.id, {
      controller,
      promise: runPromise,
    });

    if (request.waitForCompletion) {
      return {
        task: await runPromise,
        started: true,
      };
    }

    return {
      task: await this.requireTask(task.id),
      started: true,
    };
  }

  async status(taskId: string): Promise<AgentTeamTask> {
    return this.requireTask(taskId);
  }

  async listTasks(): Promise<AgentTeamTask[]> {
    const tasks = await this.store.list();
    return tasks.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async review(request: ReviewRequest): Promise<ReviewArtifact> {
    if (request.taskId) {
      const task = await this.requireTask(request.taskId);
      const { review, metadata } = await this.runtime.review(this.buildContext(task), {
        taskId: task.id,
        runtimeState: task.runtimeState,
      });

      await this.store.update(task.id, (current) =>
        this.withHistory(
          {
            ...current,
            review,
            runtimeState: mergeRuntimeState(current.runtimeState, metadata),
            updatedAt: nowIso(),
          },
          "review",
          "Generated an on-demand review snapshot.",
        ),
      );

      return review;
    }

    if (!request.target) {
      throw new Error("team.review requires either taskId or target.");
    }

    const { review } = await this.runtime.review(
      {
        goal: request.target,
        constraints: [],
        profile: buildGoalProfile(request.target, []),
        implementation: {
          summary: request.target,
          deliverables: [],
          suggestedFiles: [],
          validationNotes: [],
        },
      },
      {},
    );

    return review;
  }

  async cancel(taskId: string): Promise<AgentTeamTask> {
    const activeRun = this.activeRuns.get(taskId);
    activeRun?.controller.abort(`Task cancelled by operator: ${taskId}`);

    return this.store.update(taskId, (task) =>
      this.withHistory(
        {
          ...task,
          cancelRequested: true,
          updatedAt: nowIso(),
        },
        "system",
        "Cancellation requested.",
      ),
    );
  }

  private async execute(taskId: string, signal?: AbortSignal): Promise<AgentTeamTask> {
    let task = await this.ensurePlan(taskId);
    await this.throwIfCancelled(task, signal);

    task = await this.runStage(task.id, "implement", signal, async (context, runtimeState) => {
      const { implementation, metadata } = await this.runtime.implement(context, {
        taskId: task.id,
        signal,
        runtimeState,
      });
      return (current) => ({
        ...current,
        implementation,
        runtimeState: mergeRuntimeState(current.runtimeState, metadata),
      });
    });

    await this.throwIfCancelled(task, signal);

    task = await this.runStage(task.id, "review", signal, async (context, runtimeState) => {
      const { review, metadata } = await this.runtime.review(context, {
        taskId: task.id,
        signal,
        runtimeState,
      });
      return (current) => ({
        ...current,
        review,
        runtimeState: mergeRuntimeState(current.runtimeState, metadata),
      });
    });

    await this.throwIfCancelled(task, signal);

    task = await this.runStage(task.id, "test", signal, async (context, runtimeState) => {
      const { test, metadata } = await this.runtime.test(context, {
        taskId: task.id,
        signal,
        runtimeState,
      });
      return (current) => ({
        ...current,
        test,
        runtimeState: mergeRuntimeState(current.runtimeState, metadata),
      });
    });

    await this.throwIfCancelled(task, signal);

    const { summary, metadata } = await this.runtime.summarize(this.buildContext(task), {
      taskId: task.id,
      signal,
      runtimeState: task.runtimeState,
    });

    return this.store.update(task.id, (current) =>
      this.withHistory(
        {
          ...current,
          status: "completed",
          currentStage: undefined,
          updatedAt: nowIso(),
          summary,
          runtimeState: mergeRuntimeState(current.runtimeState, metadata),
        },
        "system",
        "Task completed.",
      ),
    );
  }

  private async ensurePlan(taskId: string): Promise<AgentTeamTask> {
    const task = await this.requireTask(taskId);
    if (task.plan) {
      return task;
    }

    return this.generatePlan(task.id);
  }

  private async generatePlan(taskId: string): Promise<AgentTeamTask> {
    const task = await this.requireTask(taskId);
    const { plan, profile, metadata } = await this.runtime.plan(
      {
        goal: task.goal,
        constraints: task.constraints,
      },
      {
        taskId: task.id,
        runtimeState: task.runtimeState,
      },
    );

    return this.store.update(taskId, (current) =>
      this.withHistory(
        {
          ...current,
          backend: this.runtime.backend,
          status: "planned",
          currentStage: "plan",
          plan,
          runtimeState: mergeRuntimeState(current.runtimeState, metadata),
          updatedAt: nowIso(),
        },
        "plan",
        `Plan generated with ${profile.keywords.length || 1} workflow signals.`,
      ),
    );
  }

  private async runStage(
    taskId: string,
    stage: Exclude<StageName, "plan">,
    signal: AbortSignal | undefined,
    executor: (
      context: RuntimeStageContext,
      runtimeState: TaskRuntimeState | undefined,
    ) => Promise<(task: AgentTeamTask) => AgentTeamTask>,
  ): Promise<AgentTeamTask> {
    const current = await this.store.update(taskId, (task) =>
      this.withHistory(
        {
          ...task,
          status: "running",
          currentStage: stage,
          updatedAt: nowIso(),
        },
        stage,
        `Started ${stage} stage.`,
      ),
    );

    try {
      const context = this.buildContext(current);
      const updater = await executor(context, current.runtimeState);

      return this.store.update(taskId, (task) =>
        this.withHistory(
          {
            ...updater(task),
            status: "running",
            currentStage: stage,
            backend: this.runtime.backend,
            updatedAt: nowIso(),
          },
          stage,
          `Finished ${stage} stage.`,
        ),
      );
    } catch (error) {
      if (isCancellationError(error) || signal?.aborted) {
        await this.markTaskCancelled(taskId, `Stage ${stage} cancelled.`);
        throw new CancelledTaskError(taskId);
      }

      const message = error instanceof Error ? error.message : String(error);
      return this.store.update(taskId, (task) =>
        this.withHistory(
          {
            ...task,
            status: "failed",
            error: message,
            updatedAt: nowIso(),
          },
          stage,
          `Stage failed: ${message}`,
        ),
      );
    }
  }

  private async throwIfCancelled(task: AgentTeamTask, signal?: AbortSignal): Promise<void> {
    if (!task.cancelRequested && !signal?.aborted) {
      return;
    }

    await this.markTaskCancelled(task.id, "Task cancelled before continuing to the next stage.");

    throw new CancelledTaskError(task.id);
  }

  private buildContext(task: AgentTeamTask): RuntimeStageContext {
    return {
      goal: task.goal,
      constraints: task.constraints,
      profile: buildGoalProfile(task.goal, task.constraints),
      plan: task.plan,
      implementation: task.implementation,
      review: task.review,
      test: task.test,
      runtimeState: task.runtimeState,
    };
  }

  private createTask(input: {
    goal: string;
    constraints: string[];
    status: TaskStatus;
  }): AgentTeamTask {
    const createdAt = nowIso();
    return {
      id: createTaskId(),
      goal: input.goal,
      constraints: input.constraints,
      status: input.status,
      cancelRequested: false,
      backend: this.runtime.backend,
      createdAt,
      updatedAt: createdAt,
      history: [
        {
          at: createdAt,
          stage: "system",
          message: "Task created.",
        },
      ],
    };
  }

  private withHistory(
    task: AgentTeamTask,
    stage: StageName | "system",
    message: string,
  ): AgentTeamTask {
    return {
      ...task,
      history: [
        ...task.history,
        {
          at: nowIso(),
          stage,
          message,
        },
      ],
    };
  }

  private async requireTask(taskId: string): Promise<AgentTeamTask> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return task;
  }

  private async markTaskCancelled(taskId: string, message: string): Promise<void> {
    await this.store.update(taskId, (current) =>
      this.withHistory(
        {
          ...current,
          status: "cancelled",
          currentStage: undefined,
          updatedAt: nowIso(),
        },
        "system",
        message,
      ),
    );
  }
}

function buildSummary(
  plan?: PlanArtifact,
  implementation?: ImplementationArtifact,
  review?: ReviewArtifact,
  test?: TestArtifact,
): string {
  const lines = [
    plan ? `Plan steps: ${plan.steps.length}` : "Plan steps: 0",
    implementation
      ? `Implementation deliverables: ${implementation.deliverables.length}`
      : "Implementation deliverables: 0",
    review
      ? `Confirmed findings: ${review.confirmedFindings.length}`
      : "Confirmed findings: 0",
    test ? `Test readiness: ${test.status}` : "Test readiness: unknown",
  ];

  return lines.join("\n");
}

class CancelledTaskError extends Error {
  constructor(taskId: string) {
    super(`Task cancelled: ${taskId}`);
  }
}

function mergeRuntimeState(
  current: TaskRuntimeState | undefined,
  next: TaskRuntimeState | undefined,
): TaskRuntimeState | undefined {
  if (!next) {
    return current;
  }

  return {
    ...current,
    ...next,
  };
}

function isCancellationError(error: unknown): boolean {
  if (error instanceof CancelledTaskError) {
    return true;
  }

  if (error instanceof Error && (error.name === "AbortError" || /cancel|abort/i.test(error.message))) {
    return true;
  }

  return false;
}
