import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

type CheckStatus = "pass" | "warn" | "fail";

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const checks: CheckResult[] = [];

  for (const relativePath of ["AGENTS.md", ".codex/config.toml", "package.json", "src/index.ts"]) {
    checks.push(await checkFileExists(cwd, relativePath));
  }

  checks.push(await checkBuiltArtifacts(cwd));
  checks.push(await checkCodexConfig(cwd));
  checks.push(checkOpenAiKey());
  checks.push(await checkDashboardAssets(cwd));

  const overall = summarize(checks);

  console.log(
    JSON.stringify(
      {
        cwd,
        overall,
        checks,
        nextSteps: buildNextSteps(checks),
      },
      null,
      2,
    ),
  );

  if (overall === "fail") {
    process.exitCode = 1;
  }
}

async function checkFileExists(cwd: string, relativePath: string): Promise<CheckResult> {
  const target = path.resolve(cwd, relativePath);

  try {
    await fs.access(target);
    return {
      name: `file:${relativePath}`,
      status: "pass",
      detail: `Found ${target}`,
    };
  } catch {
    return {
      name: `file:${relativePath}`,
      status: "fail",
      detail: `Missing ${target}`,
    };
  }
}

async function checkBuiltArtifacts(cwd: string): Promise<CheckResult> {
  const stdioEntry = path.resolve(cwd, "dist", "index.js");
  const httpEntry = path.resolve(cwd, "dist", "http-index.js");

  const hasStdio = await exists(stdioEntry);
  const hasHttp = await exists(httpEntry);

  if (hasStdio && hasHttp) {
    return {
      name: "build:dist",
      status: "pass",
      detail: "Both dist/index.js and dist/http-index.js are present.",
    };
  }

  return {
    name: "build:dist",
    status: "warn",
    detail: "Build artifacts are incomplete. Run npm run build before binding Codex.",
  };
}

async function checkCodexConfig(cwd: string): Promise<CheckResult> {
  const configPath = path.resolve(cwd, ".codex", "config.toml");

  try {
    const raw = await fs.readFile(configPath, "utf8");
    const requiredTools = [
      "team.plan",
      "team.run",
      "team.status",
      "team.review",
      "team.cancel",
    ];
    const missingTools = requiredTools.filter((tool) => !raw.includes(`"${tool}"`));
    const hasKeyForwarding = raw.includes('env_vars = ["OPENAI_API_KEY"]');
    const hasAgentsRuntime = raw.includes('AGENT_TEAM_RUNTIME = "agents"');

    if (!missingTools.length && hasKeyForwarding && hasAgentsRuntime) {
      return {
        name: "codex:config",
        status: "pass",
        detail:
          "Project config forwards OPENAI_API_KEY, pins agents runtime, and exposes the expected MCP tools.",
      };
    }

    const issues = [
      missingTools.length ? `missing tools: ${missingTools.join(", ")}` : "",
      !hasKeyForwarding ? "OPENAI_API_KEY is not forwarded" : "",
      !hasAgentsRuntime ? "AGENT_TEAM_RUNTIME is not pinned to agents" : "",
    ].filter(Boolean);

    return {
      name: "codex:config",
      status: "warn",
      detail: issues.join("; "),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: "codex:config",
      status: "fail",
      detail: `Unable to read .codex/config.toml: ${message}`,
    };
  }
}

function checkOpenAiKey(): CheckResult {
  if (process.env.OPENAI_API_KEY) {
    return {
      name: "env:OPENAI_API_KEY",
      status: "pass",
      detail: "OPENAI_API_KEY is available in the current shell environment.",
    };
  }

  return {
    name: "env:OPENAI_API_KEY",
    status: "warn",
    detail:
      "OPENAI_API_KEY is not set. Codex can still bind locally, but the live agents runtime will not be available.",
  };
}

async function checkDashboardAssets(cwd: string): Promise<CheckResult> {
  const publicFiles = [
    path.resolve(cwd, "public", "canvas.html"),
    path.resolve(cwd, "public", "canvas.css"),
    path.resolve(cwd, "public", "canvas.js"),
  ];

  const missing: string[] = [];
  for (const filePath of publicFiles) {
    if (!(await exists(filePath))) {
      missing.push(path.basename(filePath));
    }
  }

  if (!missing.length) {
    return {
      name: "http:canvas",
      status: "pass",
      detail: "Canvas assets are present for HTTP mode.",
    };
  }

  return {
    name: "http:canvas",
    status: "warn",
    detail: `Missing canvas assets: ${missing.join(", ")}`,
  };
}

function summarize(checks: CheckResult[]): CheckStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }

  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }

  return "pass";
}

function buildNextSteps(checks: CheckResult[]): string[] {
  const nextSteps: string[] = [];

  if (checks.some((check) => check.name === "build:dist" && check.status !== "pass")) {
    nextSteps.push("Run npm run build.");
  }

  if (checks.some((check) => check.name === "env:OPENAI_API_KEY" && check.status !== "pass")) {
    nextSteps.push("Set OPENAI_API_KEY in the same shell before starting Codex.");
  }

  if (checks.some((check) => check.name === "codex:config" && check.status !== "pass")) {
    nextSteps.push("Review .codex/config.toml and compare it with the repository template.");
  }

  if (!nextSteps.length) {
    nextSteps.push("Open the repository in Codex, trust the workspace, and verify MCP with /mcp.");
  }

  return nextSteps;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
