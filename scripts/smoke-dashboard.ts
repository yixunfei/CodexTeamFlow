import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const port = 3200;
const baseUrl = `http://127.0.0.1:${port}`;

async function main(): Promise<void> {
  const child = spawn("node", ["dist/http-index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENT_TEAM_RUNTIME: "local",
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

  let originalOverrides: Record<string, unknown> = {};

  try {
    await waitForHealthy();

    const canvasResponse = await fetch(`${baseUrl}/canvas`);
    const canvasHtml = await canvasResponse.text();
    assert.equal(canvasResponse.status, 200);
    assert(canvasHtml.includes("Agent Team Canvas"), "canvas page did not render");

    const configSnapshot = await fetchJson(`${baseUrl}/api/dashboard/config`);
    originalOverrides = configSnapshot.overrides || {};
    assert(configSnapshot.current, "config snapshot missing current config");
    assert(configSnapshot.pending, "config snapshot missing pending config");

    const updatedConfig = await fetchJson(`${baseUrl}/api/dashboard/config`, {
      method: "PUT",
      body: JSON.stringify({
        plannerModel: "dashboard-test-model",
      }),
    });
    assert.equal(updatedConfig.pending.plannerModel, "dashboard-test-model");
    assert.equal(updatedConfig.restartRequired, true);

    const planTask = await fetchJson(`${baseUrl}/api/dashboard/tasks/plan`, {
      method: "POST",
      body: JSON.stringify({
        goal: "Validate the dashboard canvas and config editor",
        constraints: ["render the canvas page", "persist config overrides"],
      }),
    });
    assert(planTask.id, "dashboard task planning did not return an id");

    const tasksPayload = await fetchJson(`${baseUrl}/api/dashboard/tasks`);
    assert(Array.isArray(tasksPayload.tasks), "tasks endpoint did not return a list");
    assert(
      tasksPayload.tasks.some((task: { id: string }) => task.id === planTask.id),
      "newly planned task missing from tasks list",
    );

    const taskDetail = await fetchJson(`${baseUrl}/api/dashboard/tasks/${planTask.id}`);
    assert.equal(taskDetail.id, planTask.id);
    assert.equal(taskDetail.status, "planned");

    console.log(
      JSON.stringify(
        {
          canvas: `${baseUrl}/canvas`,
          configPath: configSnapshot.configPath,
          taskId: planTask.id,
          dashboardRoutes: ["config", "tasks", "task detail"],
        },
        null,
        2,
      ),
    );
  } finally {
    await fetchJson(`${baseUrl}/api/dashboard/config/reset`, {
      method: "POST",
    }).catch(() => undefined);

    if (Object.keys(originalOverrides).length) {
      await fetchJson(`${baseUrl}/api/dashboard/config`, {
        method: "PUT",
        body: JSON.stringify(originalOverrides),
      }).catch(() => undefined);
    }

    child.kill("SIGTERM");
    await onceExit(child);
  }
}

async function waitForHealthy(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await sleep(300);
  }

  throw new Error(`Dashboard server did not become healthy at ${baseUrl}/healthz`);
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return response.json();
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
