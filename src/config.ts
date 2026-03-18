import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { z } from "zod";

export type RuntimeMode = "local" | "assisted" | "agents";
export type TransportMode = "stdio" | "http";

export interface EditableAppConfig {
  runtimeMode: RuntimeMode;
  liveNarration: boolean;
  model: string;
  storePath: string;
  transportMode: TransportMode;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  managerModel: string;
  plannerModel: string;
  implementerModel: string;
  reviewerModel: string;
  testerModel: string;
}

export interface AppConfig extends EditableAppConfig {
  serverName: string;
  serverVersion: string;
}

export type EditableAppConfigKey = keyof EditableAppConfig;

export interface ConfigSnapshot {
  current: AppConfig;
  pending: AppConfig;
  defaults: EditableAppConfig;
  overrides: Partial<EditableAppConfig>;
  lockedKeys: EditableAppConfigKey[];
  changedKeys: EditableAppConfigKey[];
  restartRequired: boolean;
  configPath: string;
  apiKeyConfigured: boolean;
}

export const editableAppConfigKeys: EditableAppConfigKey[] = [
  "runtimeMode",
  "liveNarration",
  "model",
  "storePath",
  "transportMode",
  "httpHost",
  "httpPort",
  "httpPath",
  "managerModel",
  "plannerModel",
  "implementerModel",
  "reviewerModel",
  "testerModel",
];

const configOverrideSchema = z
  .object({
    runtimeMode: z.enum(["local", "assisted", "agents"]),
    liveNarration: z.boolean(),
    model: z.string().min(1),
    storePath: z.string().min(1),
    transportMode: z.enum(["stdio", "http"]),
    httpHost: z.string().min(1),
    httpPort: z.number().int().min(1).max(65535),
    httpPath: z.string().min(1).startsWith("/"),
    managerModel: z.string().min(1),
    plannerModel: z.string().min(1),
    implementerModel: z.string().min(1),
    reviewerModel: z.string().min(1),
    testerModel: z.string().min(1),
  })
  .partial();

const envKeyByConfigKey: Record<EditableAppConfigKey, string> = {
  runtimeMode: "AGENT_TEAM_RUNTIME",
  liveNarration: "AGENT_TEAM_LIVE",
  model: "AGENT_TEAM_MODEL",
  storePath: "AGENT_TEAM_STORE_PATH",
  transportMode: "AGENT_TEAM_TRANSPORT",
  httpHost: "AGENT_TEAM_HTTP_HOST",
  httpPort: "AGENT_TEAM_HTTP_PORT",
  httpPath: "AGENT_TEAM_HTTP_PATH",
  managerModel: "AGENT_TEAM_MANAGER_MODEL",
  plannerModel: "AGENT_TEAM_PLANNER_MODEL",
  implementerModel: "AGENT_TEAM_IMPLEMENTER_MODEL",
  reviewerModel: "AGENT_TEAM_REVIEWER_MODEL",
  testerModel: "AGENT_TEAM_TESTER_MODEL",
};

export function loadConfig(): AppConfig {
  return resolveAppConfig({
    overrides: readConfigOverridesSync(),
  });
}

export function resolveAppConfig(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  overrides?: Partial<EditableAppConfig>;
}): AppConfig {
  const cwd = options?.cwd || process.cwd();
  const env = options?.env || process.env;
  const defaults = getDefaultEditableConfig(cwd);
  const merged = {
    ...defaults,
    ...(options?.overrides || {}),
  } satisfies EditableAppConfig;

  const runtimeMode = resolveRuntimeMode(env, merged.runtimeMode);
  const model = env.AGENT_TEAM_MODEL || merged.model;

  return {
    model,
    runtimeMode,
    liveNarration: resolveBoolean(env.AGENT_TEAM_LIVE, merged.liveNarration) && Boolean(env.OPENAI_API_KEY),
    storePath: path.resolve(env.AGENT_TEAM_STORE_PATH || merged.storePath),
    serverName: "agent-team",
    serverVersion: "0.1.0",
    transportMode: resolveTransportMode(env.AGENT_TEAM_TRANSPORT, merged.transportMode),
    httpHost: env.AGENT_TEAM_HTTP_HOST || merged.httpHost,
    httpPort: resolvePort(env.AGENT_TEAM_HTTP_PORT, merged.httpPort),
    httpPath: env.AGENT_TEAM_HTTP_PATH || merged.httpPath,
    managerModel: env.AGENT_TEAM_MANAGER_MODEL || merged.managerModel || model,
    plannerModel: env.AGENT_TEAM_PLANNER_MODEL || merged.plannerModel || model,
    implementerModel: env.AGENT_TEAM_IMPLEMENTER_MODEL || merged.implementerModel || model,
    reviewerModel: env.AGENT_TEAM_REVIEWER_MODEL || merged.reviewerModel || model,
    testerModel: env.AGENT_TEAM_TESTER_MODEL || merged.testerModel || "gpt-5-mini",
  };
}

export function getConfigOverridePath(cwd: string = process.cwd()): string {
  return path.resolve(
    process.env.AGENT_TEAM_CONFIG_PATH || path.join(cwd, ".agent-team", "config.overrides.json"),
  );
}

export function listLockedConfigKeys(env: NodeJS.ProcessEnv = process.env): EditableAppConfigKey[] {
  return editableAppConfigKeys.filter((key) => {
    const envKey = envKeyByConfigKey[key];
    return typeof env[envKey] === "string" && env[envKey] !== "";
  });
}

export function buildConfigSnapshot(
  current: AppConfig,
  overrides: Partial<EditableAppConfig>,
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    configPath?: string;
  },
): ConfigSnapshot {
  const cwd = options?.cwd || process.cwd();
  const env = options?.env || process.env;
  const defaults = getDefaultEditableConfig(cwd);
  const pending = resolveAppConfig({
    cwd,
    env,
    overrides,
  });
  const changedKeys = editableAppConfigKeys.filter((key) => {
    return current[key] !== pending[key];
  });

  return {
    current,
    pending,
    defaults,
    overrides,
    lockedKeys: listLockedConfigKeys(env),
    changedKeys,
    restartRequired: changedKeys.length > 0,
    configPath: options?.configPath || getConfigOverridePath(cwd),
    apiKeyConfigured: Boolean(env.OPENAI_API_KEY),
  };
}

export function parseConfigOverrideInput(input: unknown): Partial<EditableAppConfig> {
  return configOverrideSchema.parse(input);
}

export async function readConfigOverrides(
  filePath: string = getConfigOverridePath(),
): Promise<Partial<EditableAppConfig>> {
  try {
    const raw = await fsPromises.readFile(filePath, "utf8");
    return parsePersistedConfig(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeConfigOverrides(
  overrides: Partial<EditableAppConfig>,
  filePath: string = getConfigOverridePath(),
): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(overrides, null, 2), "utf8");
}

export function sanitizeConfigOverrides(
  overrides: Partial<EditableAppConfig>,
  cwd: string = process.cwd(),
): Partial<EditableAppConfig> {
  const defaults = getDefaultEditableConfig(cwd);
  return editableAppConfigKeys.reduce<Partial<EditableAppConfig>>((acc, key) => {
    const value = overrides[key];
    if (value === undefined || value === defaults[key]) {
      return acc;
    }

    Object.assign(acc, {
      [key]: value,
    });
    return acc;
  }, {});
}

function readConfigOverridesSync(
  filePath: string = getConfigOverridePath(),
): Partial<EditableAppConfig> {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return parsePersistedConfig(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function getDefaultEditableConfig(cwd: string): EditableAppConfig {
  return {
    model: "gpt-5.4",
    runtimeMode: "local",
    liveNarration: false,
    storePath: path.resolve(path.join(cwd, ".agent-team", "tasks.json")),
    transportMode: "stdio",
    httpHost: "127.0.0.1",
    httpPort: 3000,
    httpPath: "/mcp",
    managerModel: "gpt-5.4",
    plannerModel: "gpt-5.4",
    implementerModel: "gpt-5-codex",
    reviewerModel: "gpt-5.4",
    testerModel: "gpt-5-mini",
  };
}

function parsePersistedConfig(raw: string): Partial<EditableAppConfig> {
  const parsed = JSON.parse(raw) as unknown;
  return configOverrideSchema.parse(parsed);
}

function resolveRuntimeMode(
  env: NodeJS.ProcessEnv,
  configured: RuntimeMode,
): RuntimeMode {
  const requested = env.AGENT_TEAM_RUNTIME;

  if (requested === "agents") {
    return "agents";
  }

  if (requested === "assisted") {
    return "assisted";
  }

  if (requested === "local") {
    return "local";
  }

  if (configured) {
    return configured;
  }

  if (env.OPENAI_API_KEY) {
    return "agents";
  }

  return "local";
}

function resolveTransportMode(value: string | undefined, fallback: TransportMode): TransportMode {
  if (value === "http") {
    return "http";
  }

  if (value === "stdio") {
    return "stdio";
  }

  return fallback;
}

function resolveBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "1" || value === "true") {
    return true;
  }

  if (value === "0" || value === "false") {
    return false;
  }

  return fallback;
}

function resolvePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
