import type { AppConfig, ConfigSnapshot, EditableAppConfig } from "./config.js";
import {
  buildConfigSnapshot,
  getConfigOverridePath,
  listLockedConfigKeys,
  parseConfigOverrideInput,
  readConfigOverrides,
  sanitizeConfigOverrides,
  writeConfigOverrides,
} from "./config.js";

export class AppConfigEditor {
  private readonly configPath: string;

  constructor(
    private readonly currentConfig: AppConfig,
    private readonly cwd: string = process.cwd(),
  ) {
    this.configPath = getConfigOverridePath(cwd);
  }

  async getSnapshot(): Promise<ConfigSnapshot> {
    const overrides = await readConfigOverrides(this.configPath);
    return buildConfigSnapshot(this.currentConfig, overrides, {
      cwd: this.cwd,
      configPath: this.configPath,
    });
  }

  async update(input: unknown): Promise<ConfigSnapshot> {
    const update = parseConfigOverrideInput(input);
    const lockedKeys = listLockedConfigKeys();
    const attemptedLockedKeys = Object.keys(update).filter((key) =>
      lockedKeys.includes(key as keyof EditableAppConfig),
    );

    if (attemptedLockedKeys.length) {
      throw new Error(
        `These settings are locked by environment variables: ${attemptedLockedKeys.join(", ")}`,
      );
    }

    const currentOverrides = await readConfigOverrides(this.configPath);
    const nextOverrides = sanitizeConfigOverrides(
      {
        ...currentOverrides,
        ...update,
      },
      this.cwd,
    );

    await writeConfigOverrides(nextOverrides, this.configPath);

    return buildConfigSnapshot(this.currentConfig, nextOverrides, {
      cwd: this.cwd,
      configPath: this.configPath,
    });
  }

  async reset(): Promise<ConfigSnapshot> {
    await writeConfigOverrides({}, this.configPath);
    return buildConfigSnapshot(this.currentConfig, {}, {
      cwd: this.cwd,
      configPath: this.configPath,
    });
  }
}
