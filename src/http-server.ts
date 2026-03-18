import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentTeamOrchestrator } from "./orchestrator/agent-team-orchestrator.js";
import type { AppConfig } from "./config.js";
import { AppConfigEditor } from "./config-editor.js";
import { createMcpServer } from "./server.js";

interface HttpServerOptions {
  host: string;
  port: number;
  path: string;
}

interface SessionContext {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

export class AgentTeamHttpServer {
  private readonly sessions = new Map<string, SessionContext>();
  private readonly server: http.Server;
  private readonly configEditor: AppConfigEditor;

  constructor(
    private readonly orchestrator: AgentTeamOrchestrator,
    private readonly config: AppConfig,
    private readonly options: HttpServerOptions,
  ) {
    this.configEditor = new AppConfigEditor(config);
    this.server = http.createServer((req, res) => {
      void this.route(req, res);
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      await this.disposeSession(sessionId, session);
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    try {
      if (url.pathname === "/" || url.pathname === "/canvas") {
        await this.servePublicFile(res, "canvas.html");
        return;
      }

      if (url.pathname.startsWith("/assets/")) {
        await this.serveAsset(res, url.pathname);
        return;
      }

      if (url.pathname === "/healthz") {
        this.respondJson(res, 200, {
          ok: true,
          transport: "http",
          endpoint: this.options.path,
          backend: this.config.runtimeMode,
        });
        return;
      }

      if (url.pathname.startsWith("/api/dashboard/")) {
        await this.handleDashboardRoute(req, res, url);
        return;
      }

      if (url.pathname !== this.options.path) {
        this.respondJson(res, 404, {
          error: "Not Found",
        });
        return;
      }

      if (method === "POST") {
        const body = await readJsonBody(req);
        await this.handlePost(req, res, body);
        return;
      }

      if (method === "GET") {
        await this.handleGet(req, res);
        return;
      }

      if (method === "DELETE") {
        await this.handleDelete(req, res);
        return;
      }

      this.respondJson(res, 405, {
        error: "Method Not Allowed",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.respondJson(res, 500, {
        error: message,
      });
    }
  }

  private async handleDashboardRoute(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    const method = req.method || "GET";
    const taskMatch = url.pathname.match(/^\/api\/dashboard\/tasks\/([^/]+)$/);
    const taskCancelMatch = url.pathname.match(/^\/api\/dashboard\/tasks\/([^/]+)\/cancel$/);
    const taskReviewMatch = url.pathname.match(/^\/api\/dashboard\/tasks\/([^/]+)\/review$/);

    if (method === "GET" && url.pathname === "/api/dashboard/config") {
      this.respondJson(res, 200, await this.configEditor.getSnapshot());
      return;
    }

    if (method === "PUT" && url.pathname === "/api/dashboard/config") {
      const body = await readJsonBody(req);
      this.respondJson(res, 200, await this.configEditor.update(body));
      return;
    }

    if (method === "POST" && url.pathname === "/api/dashboard/config/reset") {
      this.respondJson(res, 200, await this.configEditor.reset());
      return;
    }

    if (method === "GET" && url.pathname === "/api/dashboard/tasks") {
      const tasks = await this.orchestrator.listTasks();
      this.respondJson(res, 200, {
        tasks,
        selectedTaskId: tasks[0]?.id,
      });
      return;
    }

    if (method === "GET" && taskMatch) {
      const taskId = decodeURIComponent(taskMatch[1]);
      this.respondJson(res, 200, await this.orchestrator.status(taskId));
      return;
    }

    if (method === "POST" && url.pathname === "/api/dashboard/tasks/plan") {
      const body = (await readJsonBody(req)) as {
        goal?: string;
        constraints?: string[];
      };
      const task = await this.orchestrator.plan(
        body.goal || "No goal provided",
        normalizeConstraints(body.constraints),
      );
      this.respondJson(res, 200, task);
      return;
    }

    if (method === "POST" && url.pathname === "/api/dashboard/tasks/run") {
      const body = (await readJsonBody(req)) as {
        taskId?: string;
        goal?: string;
        constraints?: string[];
        waitForCompletion?: boolean;
      };
      const result = await this.orchestrator.run({
        taskId: body.taskId,
        goal: body.goal,
        constraints: normalizeConstraints(body.constraints),
        waitForCompletion: body.waitForCompletion !== false,
      });
      this.respondJson(res, 200, result);
      return;
    }

    if (method === "POST" && taskCancelMatch) {
      const taskId = decodeURIComponent(taskCancelMatch[1]);
      this.respondJson(res, 200, await this.orchestrator.cancel(taskId));
      return;
    }

    if (method === "POST" && taskReviewMatch) {
      const taskId = decodeURIComponent(taskReviewMatch[1]);
      const review = await this.orchestrator.review({ taskId });
      this.respondJson(res, 200, review);
      return;
    }

    this.respondJson(res, 404, {
      error: `Unknown dashboard route: ${method} ${url.pathname}`,
    });
  }

  private async handlePost(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: unknown,
  ): Promise<void> {
    const sessionId = this.readSessionId(req);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        this.respondJson(res, 404, {
          error: `Unknown session: ${sessionId}`,
        });
        return;
      }

      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      this.respondJson(res, 400, {
        error: "Missing session and body is not an initialize request.",
      });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        this.sessions.set(newSessionId, {
          server,
          transport,
        });
      },
    });

    const server = createMcpServer(this.orchestrator);
    transport.onclose = () => {
      const activeSessionId = transport.sessionId;
      if (!activeSessionId) {
        return;
      }

      const session = this.sessions.get(activeSessionId);
      if (session) {
        void this.disposeSession(activeSessionId, session);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  private async handleGet(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const sessionId = this.readSessionId(req);
    if (!sessionId) {
      this.respondJson(res, 400, {
        error: "Missing Mcp-Session-Id header.",
      });
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.respondJson(res, 404, {
        error: `Unknown session: ${sessionId}`,
      });
      return;
    }

    await session.transport.handleRequest(req, res);
  }

  private async handleDelete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const sessionId = this.readSessionId(req);
    if (!sessionId) {
      this.respondJson(res, 400, {
        error: "Missing Mcp-Session-Id header.",
      });
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.respondJson(res, 404, {
        error: `Unknown session: ${sessionId}`,
      });
      return;
    }

    await session.transport.handleRequest(req, res);
    await this.disposeSession(sessionId, session);
  }

  private readSessionId(req: http.IncomingMessage): string | undefined {
    const header = req.headers["mcp-session-id"];
    if (Array.isArray(header)) {
      return header[0];
    }

    return header;
  }

  private respondJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  }

  private async serveAsset(res: http.ServerResponse, requestPath: string): Promise<void> {
    if (requestPath === "/assets/canvas.css") {
      await this.servePublicFile(res, "canvas.css");
      return;
    }

    if (requestPath === "/assets/canvas.js") {
      await this.servePublicFile(res, "canvas.js");
      return;
    }

    this.respondJson(res, 404, {
      error: "Asset not found",
    });
  }

  private async servePublicFile(res: http.ServerResponse, filename: string): Promise<void> {
    const filePath = path.resolve(process.cwd(), "public", filename);
    const content = await fs.readFile(filePath, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeFor(filename));
    res.end(content);
  }

  private async disposeSession(sessionId: string, session: SessionContext): Promise<void> {
    this.sessions.delete(sessionId);
    await Promise.allSettled([session.server.close(), session.transport.close()]);
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function contentTypeFor(filename: string): string {
  if (filename.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filename.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  return "text/html; charset=utf-8";
}

function normalizeConstraints(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((value) => String(value).trim())
    .filter(Boolean);
}
