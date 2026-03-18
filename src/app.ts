import { loadConfig, type AppConfig } from "./config.js";
import { AgentTeamOrchestrator } from "./orchestrator/agent-team-orchestrator.js";
import { AgentTeamRuntime } from "./orchestrator/agent-team-runtime.js";
import { OpenAiAgentTeamRuntime } from "./orchestrator/openai-agent-team-runtime.js";
import { NoopNarrator, OpenAiResponsesNarrator } from "./orchestrator/narrator.js";
import { JsonTaskStore } from "./storage/json-task-store.js";

export interface AgentTeamApp {
  config: AppConfig;
  store: JsonTaskStore;
  runtime: AgentTeamRuntime;
  orchestrator: AgentTeamOrchestrator;
}

export async function createAgentTeamApp(config: AppConfig = loadConfig()): Promise<AgentTeamApp> {
  const store = new JsonTaskStore(config.storePath);
  await store.init();

  const runtime =
    config.runtimeMode === "agents"
      ? new OpenAiAgentTeamRuntime(config)
      : new AgentTeamRuntime(
          config.runtimeMode === "assisted" || config.liveNarration
            ? new OpenAiResponsesNarrator(config.model)
            : new NoopNarrator(),
        );
  const orchestrator = new AgentTeamOrchestrator(store, runtime);

  return {
    config,
    store,
    runtime,
    orchestrator,
  };
}
