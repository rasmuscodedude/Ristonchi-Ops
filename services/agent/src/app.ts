import { APP_NAME, agentInfo, isAgentId, type ChatEvent } from "@ristonchi/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { DEMO_STAFF } from "./auth/mock";
import type { AuthAdapter, AuthSession } from "./auth/types";
import { projectTranscript } from "./chat/project";
import { runApprovalDecision, runChatTurn } from "./chat/loop";
import type { AppConfig } from "./config";
import { HttpError } from "./errors";
import type { LlmProvider } from "./llm/types";
import { log } from "./log";
import type { PlatformAdapter } from "./platform/types";
import { staffCanUseAgent, staffCanViewAudit } from "./policy";
import { sseResponse } from "./sse";
import type { Store } from "./store/types";

export type AppDeps = {
  config: AppConfig;
  store: Store;
  auth: AuthAdapter;
  platform: PlatformAdapter;
  llm: LlmProvider;
  now?: () => Date;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    log("info", "request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin || allowedOrigin(origin, deps.config.webOrigin))
          return origin || deps.config.webOrigin;
        return "";
      },
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status as 400);
    log("error", "request failed", { message: error instanceof Error ? error.message : "error" });
    return c.json({ error: "Something went wrong." }, 500);
  });

  app.get("/api/health", (c) => {
    return c.json({
      ok: true,
      appName: APP_NAME,
      authMode: deps.config.authMode,
      platformMode: deps.config.platformMode,
      llmProvider: deps.config.llmProvider,
      demo:
        deps.config.authMode === "mock"
          ? {
              password: deps.config.mockStaffPassword,
              accounts: DEMO_STAFF.map((person) => ({
                email: person.email,
                name: person.name,
                role: person.role,
                note: demoNote(person.role, person.flags.sales === true),
              })),
            }
          : null,
    });
  });

  app.post("/api/auth/login", async (c) => {
    const body = await readJson(c.req.raw);
    const email = stringField(body, "email");
    const password = stringField(body, "password");
    if (!email || !password) throw new HttpError(400, "Email and password are required.");
    const session = await deps.auth.login(email, password);
    return c.json({ token: session.token, staff: session.staff });
  });

  app.post("/api/auth/logout", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    await deps.auth.logout(session.token);
    return c.json({ ok: true });
  });

  app.get("/api/me", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    return c.json({ staff: session.staff });
  });

  app.get("/api/agents", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    const agents = (["sales-couples", "wedding-day"] as const)
      .filter((id) => staffCanUseAgent(session.staff, id))
      .map((id) => agentInfo(id));
    return c.json({ agents });
  });

  app.get("/api/conversations", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    const rows = await deps.store.listConversations(session.staff.id);
    return c.json({
      conversations: rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        title: row.title,
        updatedAt: row.updatedAt,
      })),
    });
  });

  app.get("/api/conversations/:id", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    const conversation = await deps.store.getConversation(c.req.param("id"));
    if (!conversation || conversation.staffId !== session.staff.id) {
      throw new HttpError(404, "Conversation not found.");
    }
    const approvals = await Promise.all(
      conversation.approvalIds.map((id) => deps.store.getApproval(id)),
    );
    return c.json({
      id: conversation.id,
      agentId: conversation.agentId,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      items: projectTranscript(
        conversation,
        approvals.filter((item) => item !== null),
      ),
    });
  });

  app.post("/api/chat", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    const body = await readJson(c.req.raw);
    const agentId = body.agentId;
    const message = stringField(body, "message");
    const conversationId = stringField(body, "conversationId");
    if (!isAgentId(agentId)) throw new HttpError(400, "Choose an agent.");
    if (!staffCanUseAgent(session.staff, agentId))
      throw new HttpError(403, "Your role cannot use this agent.");
    if (!message) throw new HttpError(400, "Write a message first.");
    if (message.length > 4000) throw new HttpError(400, "That message is too long.");
    return stream(
      runChatTurn(deps, {
        staff: session.staff,
        platformToken: session.platformToken,
        agentId,
        conversationId,
        message,
      }),
    );
  });

  app.post("/api/approvals/:id", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    const body = await readJson(c.req.raw);
    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject") {
      throw new HttpError(400, "Decision must be approve or reject.");
    }
    const existing = await deps.store.getApproval(c.req.param("id"));
    if (!existing || existing.staffId !== session.staff.id)
      throw new HttpError(404, "Approval not found.");
    if (existing.status !== "pending")
      throw new HttpError(409, "This approval is already resolved.");
    return stream(
      runApprovalDecision(deps, {
        staff: session.staff,
        platformToken: session.platformToken,
        approvalId: existing.id,
        decision,
      }),
    );
  });

  app.get("/api/audit", async (c) => {
    const session = await requireSession(c.req.raw, deps.auth);
    if (!staffCanViewAudit(session.staff)) throw new HttpError(403, "The audit log is for admins.");
    const limit = Math.min(Number(c.req.query("limit") ?? "100") || 100, 500);
    const entries = await deps.store.listAudit(limit);
    return c.json({ entries });
  });

  return app;
}

function stream(events: AsyncGenerator<ChatEvent>): Response {
  return sseResponse(events);
}

async function requireSession(request: Request, auth: AuthAdapter): Promise<AuthSession> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Sign in required.");
  const session = await auth.authenticate(token);
  if (!session) throw new HttpError(401, "Sign in required.");
  return session;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Send JSON.");
  }
}

function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function allowedOrigin(origin: string, configured: string): boolean {
  if (origin === configured) return true;
  try {
    const left = new URL(origin);
    const right = new URL(configured);
    const loopback = (host: string) => host === "localhost" || host === "127.0.0.1";
    return (
      loopback(left.hostname) &&
      loopback(right.hostname) &&
      left.port === right.port &&
      left.protocol === right.protocol
    );
  } catch {
    return false;
  }
}

function demoNote(role: string, sales: boolean): string {
  if (role === "admin") return "Both agents, plus the audit log.";
  if (role === "manager" && sales) return "Sales / Couples and Wedding-day.";
  if (role === "event_coordinator") return "Wedding-day coordinator only.";
  return "No agent. Used to show the role gate.";
}
