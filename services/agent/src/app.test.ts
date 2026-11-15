import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { MockAuth } from "./auth/mock";
import { configFromEnv } from "./config";
import { MockLlm } from "./llm/mock";
import { MockPlatform } from "./platform/mock";
import { MemoryStore } from "./store/memory";
import { parseSse } from "./sse";

function testApp() {
  const store = new MemoryStore();
  const config = configFromEnv({ AUTH_MODE: "mock", PLATFORM_MODE: "mock", LLM_PROVIDER: "mock" });
  const platform = new MockPlatform();
  const app = createApp({
    config,
    store,
    auth: new MockAuth(store, "ristonchi-demo"),
    platform,
    llm: new MockLlm(),
  });
  return { app, store, platform };
}

async function login(app: ReturnType<typeof testApp>["app"], email: string) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "ristonchi-demo" }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { token: string; staff: { role: string } };
}

describe("http", () => {
  it("rejects a bad password and a missing session", async () => {
    const { app } = testApp();
    const loginResponse = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stefanie@ristonchi.com", password: "nope" }),
    });
    expect(loginResponse.status).toBe(401);
    const chat = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "sales-couples", message: "Hello" }),
    });
    expect(chat.status).toBe(401);
  });

  it("hides agents a role cannot use, and the audit log from non-admins", async () => {
    const { app } = testApp();
    const kitchen = await login(app, "kitchen@ristonchi.com");
    const agents = await app.request("/api/agents", {
      headers: { authorization: `Bearer ${kitchen.token}` },
    });
    expect(await agents.json()).toEqual({ agents: [] });
    const blocked = await app.request("/api/chat", {
      method: "POST",
      headers: { authorization: `Bearer ${kitchen.token}`, "content-type": "application/json" },
      body: JSON.stringify({ agentId: "sales-couples", message: "Hello" }),
    });
    expect(blocked.status).toBe(403);

    const coordinator = await login(app, "coordinator@ristonchi.com");
    const coordinatorAgents = (await (
      await app.request("/api/agents", {
        headers: { authorization: `Bearer ${coordinator.token}` },
      })
    ).json()) as { agents: Array<{ id: string }> };
    expect(coordinatorAgents.agents.map((agent) => agent.id)).toEqual(["wedding-day"]);
    const audit = await app.request("/api/audit", {
      headers: { authorization: `Bearer ${coordinator.token}` },
    });
    expect(audit.status).toBe(403);

    const admin = await login(app, "admin@ristonchi.com");
    const adminAudit = await app.request("/api/audit", {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(adminAudit.status).toBe(200);
  });

  it("streams a read, holds a write, and records both in the audit log", async () => {
    const { app, platform } = testApp();
    const stefanie = await login(app, "stefanie@ristonchi.com");
    const headers = {
      authorization: `Bearer ${stefanie.token}`,
      "content-type": "application/json",
    };
    const read = await app.request("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({ agentId: "sales-couples", message: "Is 19 June 2027 open?" }),
    });
    expect(read.status).toBe(200);
    const readEvents = parseSse(await read.text());
    expect(
      readEvents.some(
        (event) => event.type === "tool_result" && event.tool === "check_availability",
      ),
    ).toBe(true);
    const answer = readEvents
      .filter((event) => event.type === "token")
      .map((event) => (event.type === "token" ? event.text : ""))
      .join("");
    expect(answer.toLowerCase()).toContain("open");

    const write = await app.request("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        agentId: "sales-couples",
        message: "Block the date 2027-06-21",
      }),
    });
    const writeEvents = parseSse(await write.text());
    const card = writeEvents.find((event) => event.type === "approval_required");
    expect(card).toMatchObject({ type: "approval_required", tool: "set_availability_block" });
    expect(platform.data.blocks.find((block) => block.date === "2027-06-21")).toBeUndefined();

    if (card?.type !== "approval_required") return;
    const decision = await app.request(`/api/approvals/${card.approvalId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(decision.status).toBe(200);
    const decisionEvents = parseSse(await decision.text());
    expect(decisionEvents.some((event) => event.type === "tool_result")).toBe(true);
    expect(platform.data.blocks.find((block) => block.date === "2027-06-21")?.status).toBe(
      "blocked",
    );

    const again = await app.request(`/api/approvals/${card.approvalId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(again.status).toBe(409);

    const admin = await login(app, "admin@ristonchi.com");
    const audit = (await (
      await app.request("/api/audit", { headers: { authorization: `Bearer ${admin.token}` } })
    ).json()) as { entries: Array<{ tool: string; status: string; staffEmail: string }> };
    expect(
      audit.entries.some(
        (entry) => entry.tool === "check_availability" && entry.status === "executed",
      ),
    ).toBe(true);
    expect(
      audit.entries.some(
        (entry) =>
          entry.tool === "set_availability_block" &&
          entry.status === "executed" &&
          entry.staffEmail === "stefanie@ristonchi.com",
      ),
    ).toBe(true);
  });
});
