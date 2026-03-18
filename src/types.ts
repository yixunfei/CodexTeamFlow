export type StageName = "plan" | "implement" | "review" | "test";

export type TaskStatus =
  | "pending"
  | "planned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type RuntimeBackend = "local" | "openai-assisted" | "agents-sdk";

export type FindingSeverity = "low" | "medium" | "high";

export interface AgentAssignment {
  agent: "planner" | "implementer" | "reviewer" | "tester";
  focus: string;
}

export interface PlanArtifact {
  steps: string[];
  risks: string[];
  acceptanceCriteria: string[];
  agentAssignments: AgentAssignment[];
  modelNarrative?: string;
}

export interface ImplementationArtifact {
  summary: string;
  deliverables: string[];
  suggestedFiles: string[];
  validationNotes: string[];
  modelNarrative?: string;
}

export interface Finding {
  severity: FindingSeverity;
  title: string;
  detail: string;
}

export interface ReviewArtifact {
  confirmedFindings: Finding[];
  focusAreas: string[];
  recommendations: string[];
  modelNarrative?: string;
}

export interface TestArtifact {
  status: "ready" | "warning";
  checks: string[];
  suggestedCommands: string[];
  exitCriteria: string[];
  modelNarrative?: string;
}

export interface TaskHistoryEntry {
  at: string;
  stage: StageName | "system";
  message: string;
}

export interface TaskRuntimeState {
  mode: "plan" | "implement" | "review" | "test";
  backend: RuntimeBackend;
  updatedAt: string;
  traceId?: string;
  lastResponseId?: string;
  lastAgent?: string;
}

export interface AgentTeamTask {
  id: string;
  goal: string;
  constraints: string[];
  status: TaskStatus;
  currentStage?: StageName;
  cancelRequested: boolean;
  backend: RuntimeBackend;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  error?: string;
  runtimeState?: TaskRuntimeState;
  plan?: PlanArtifact;
  implementation?: ImplementationArtifact;
  review?: ReviewArtifact;
  test?: TestArtifact;
  history: TaskHistoryEntry[];
}

export interface RunRequest {
  taskId?: string;
  goal?: string;
  constraints: string[];
  waitForCompletion: boolean;
}

export interface ReviewRequest {
  taskId?: string;
  target?: string;
}

export interface GoalProfile {
  keywords: string[];
  includesCodex: boolean;
  includesMcp: boolean;
  includesDocs: boolean;
  includesPlugin: boolean;
  includesApi: boolean;
  includesConfig: boolean;
  includesTests: boolean;
  includesFrontend: boolean;
  includesBackend: boolean;
  suggestedFiles: string[];
}

export interface RuntimeStageContext {
  goal: string;
  constraints: string[];
  profile: GoalProfile;
  plan?: PlanArtifact;
  implementation?: ImplementationArtifact;
  review?: ReviewArtifact;
  test?: TestArtifact;
  runtimeState?: TaskRuntimeState;
}

export interface RuntimeExecutionOptions {
  taskId?: string;
  signal?: AbortSignal;
  runtimeState?: TaskRuntimeState;
}

export interface RuntimePlanResult {
  plan: PlanArtifact;
  profile: GoalProfile;
  metadata?: TaskRuntimeState;
}

export interface RuntimeImplementationResult {
  implementation: ImplementationArtifact;
  metadata?: TaskRuntimeState;
}

export interface RuntimeReviewResult {
  review: ReviewArtifact;
  metadata?: TaskRuntimeState;
}

export interface RuntimeTestResult {
  test: TestArtifact;
  metadata?: TaskRuntimeState;
}

export interface RuntimeSummaryResult {
  summary: string;
  metadata?: TaskRuntimeState;
}
