import assert from "node:assert/strict";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client({
    name: "agent-team-smoke-stdio",
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
      goal: "Validate the stdio Codex MCP integration",
      constraints: ["return a task id", "preserve the fixed workflow"],
    },
  });

  const planPayload = plan.structuredContent as {
    taskId: string;
    status: string;
    steps: string[];
  };

  assert(planPayload.taskId, "team.plan did not return taskId");
  assert.equal(planPayload.status, "planned");
  assert(planPayload.steps.length > 0, "team.plan returned no steps");

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
    summary?: string;
  };

  assert.equal(runPayload.taskId, planPayload.taskId);
  assert.equal(runPayload.status, "completed");

  const status = await client.callTool({
    name: "team.status",
    arguments: {
      taskId: planPayload.taskId,
    },
  });

  const statusPayload = status.structuredContent as {
    taskId: string;
    status: string;
    recentHistory: string[];
  };

  assert.equal(statusPayload.taskId, planPayload.taskId);
  assert.equal(statusPayload.status, "completed");
  assert(statusPayload.recentHistory.length > 0, "team.status returned no history");

  console.log(
    JSON.stringify(
      {
        transport: "stdio",
        tools: toolNames,
        taskId: planPayload.taskId,
        finalStatus: statusPayload.status,
      },
      null,
      2,
    ),
  );

  await transport.close();
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
