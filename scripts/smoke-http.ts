import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const port = 3100;
const endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
const healthUrl = `http://127.0.0.1:${port}/healthz`;

async function main(): Promise<void> {
  const child = spawn("node", ["dist/http-index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_TEAM_TRANSPORT: "http",
      AGENT_TEAM_HTTP_HOST: "127.0.0.1",
      AGENT_TEAM_HTTP_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  try {
    await waitForHealthy();

    const transport = new StreamableHTTPClientTransport(endpoint);
    const client = new Client({
      name: "agent-team-smoke-http",
      version: "0.1.0",
    });

    await client.connect(transport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    const expectedTools = ["team.cancel", "team.plan", "team.review", "team.run", "team.status"];

    for (const name of expectedTools) {
      assert(toolNames.includes(name), `missing tool: ${name}`);
    }

    const plan = await client.callTool({
      name: "team.plan",
      arguments: {
        goal: "Validate the streamable HTTP Codex MCP integration",
        constraints: ["return a task id", "preserve the fixed workflow"],
      },
    });

    const planPayload = plan.structuredContent as {
      taskId: string;
      status: string;
    };

    assert(planPayload.taskId, "team.plan did not return taskId");
    assert.equal(planPayload.status, "planned");

    const run = await client.callTool({
      name: "team.run",
      arguments: {
        taskId: planPayload.taskId,
        constraints: [],
        waitForCompletion: true,
      },
    });

    const runPayload = run.structuredContent as {
      taskId: string;
      status: string;
    };

    assert.equal(runPayload.taskId, planPayload.taskId);
    assert.equal(runPayload.status, "completed");

    await transport.terminateSession().catch(() => undefined);
    await transport.close();

    console.log(
      JSON.stringify(
        {
          transport: "http",
          endpoint: endpoint.toString(),
          tools: toolNames,
          taskId: planPayload.taskId,
          finalStatus: runPayload.status,
        },
        null,
        2,
      ),
    );
  } finally {
    child.kill("SIGTERM");
    await onceExit(child);
  }
}

async function waitForHealthy(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await sleep(300);
  }

  throw new Error(`HTTP MCP server did not become healthy at ${healthUrl}`);
}

async function onceExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
