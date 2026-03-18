import crypto from "node:crypto";

export function createTaskId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `task_${timestamp}_${suffix}`;
}
