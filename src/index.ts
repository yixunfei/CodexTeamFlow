import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAgentTeamApp } from "./app.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const { config, runtime, orchestrator } = await createAgentTeamApp();
  const server = createMcpServer(orchestrator);
  const transport = new StdioServerTransport();

  console.error(
    `[agent-team] booting with backend=${runtime.backend} model=${config.model} store=${config.storePath}`,
  );

  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[agent-team] fatal error: ${message}`);
  process.exitCode = 1;
});
