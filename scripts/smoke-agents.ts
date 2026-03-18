import assert from "node:assert/strict";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("smoke:agents requires OPENAI_API_KEY and runs the live Agents SDK runtime.");
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_TEAM_RUNTIME: "agents",
    },
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client({
    name: "agent-team-smoke-agents",
    version: "0.1.0",
  });

  await client.connect(transport);

  try {
    const plan = await client.callTool({
      name: "team.plan",
      arguments: {
        goal: "Validate the live Responses API + Agents SDK Agent Team runtime",
        constraints: ["preserve the MCP tool contracts", "emit runtime metadata for status"],
      },
    });

    const planPayload = plan.structuredContent as {
      taskId: string;
      status: string;
      backend: string;
    };

    assert(planPayload.taskId, "team.plan did not return taskId");
    assert.equal(planPayload.status, "planned");
    assert.equal(planPayload.backend, "agents-sdk");

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
      backend: string;
    };

    assert.equal(runPayload.taskId, planPayload.taskId);
    assert.equal(runPayload.status, "completed");
    assert.equal(runPayload.backend, "agents-sdk");

    const status = await client.callTool({
      name: "team.status",
      arguments: {
        taskId: planPayload.taskId,
      },
    });

    const statusPayload = status.structuredContent as {
      taskId: string;
      status: string;
      backend: string;
      traceId?: string;
      lastResponseId?: string;
      lastAgent?: string;
    };

    assert.equal(statusPayload.taskId, planPayload.taskId);
    assert.equal(statusPayload.status, "completed");
    assert.equal(statusPayload.backend, "agents-sdk");
    assert(statusPayload.traceId, "team.status did not expose traceId");
    assert(statusPayload.lastResponseId, "team.status did not expose lastResponseId");

    console.log(
      JSON.stringify(
        {
          transport: "stdio",
          backend: statusPayload.backend,
          taskId: statusPayload.taskId,
          finalStatus: statusPayload.status,
          traceId: statusPayload.traceId,
          lastResponseId: statusPayload.lastResponseId,
          lastAgent: statusPayload.lastAgent,
        },
        null,
        2,
      ),
    );
  } finally {
    await transport.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
