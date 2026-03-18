import "dotenv/config";
import { createAgentTeamApp } from "./app.js";
import { AgentTeamHttpServer } from "./http-server.js";

async function main(): Promise<void> {
  const { config, runtime, orchestrator } = await createAgentTeamApp();
  const httpServer = new AgentTeamHttpServer(orchestrator, config, {
    host: config.httpHost,
    port: config.httpPort,
    path: config.httpPath,
  });

  await httpServer.start();

  console.error(
    `[agent-team] http server listening on http://${config.httpHost}:${config.httpPort}${config.httpPath} backend=${runtime.backend} model=${config.model} store=${config.storePath}`,
  );

  const shutdown = async () => {
    await httpServer.close();
    process.exitCode = 0;
  };

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[agent-team] fatal error: ${message}`);
  process.exitCode = 1;
});
