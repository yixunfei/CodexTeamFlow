import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTeamTask } from "../types.js";

interface PersistedTasks {
  tasks: AgentTeamTask[];
}

export class JsonTaskStore {
  private readonly tasks = new Map<string, AgentTeamTask>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedTasks;

      for (const task of parsed.tasks || []) {
        this.tasks.set(task.id, task);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }

      await this.persist();
    }
  }

  async create(task: AgentTeamTask): Promise<AgentTeamTask> {
    this.tasks.set(task.id, structuredClone(task));
    await this.persist();
    return structuredClone(task);
  }

  async get(taskId: string): Promise<AgentTeamTask | undefined> {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : undefined;
  }

  async list(): Promise<AgentTeamTask[]> {
    return [...this.tasks.values()].map((task) => structuredClone(task));
  }

  async update(
    taskId: string,
    updater: (task: AgentTeamTask) => AgentTeamTask,
  ): Promise<AgentTeamTask> {
    const existing = this.tasks.get(taskId);

    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated = updater(structuredClone(existing));
    this.tasks.set(taskId, structuredClone(updated));
    await this.persist();
    return structuredClone(updated);
  }

  private async persist(): Promise<void> {
    const payload: PersistedTasks = {
      tasks: [...this.tasks.values()],
    };

    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
    });

    await this.writeQueue;
  }
}
