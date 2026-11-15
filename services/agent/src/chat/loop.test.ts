import { describe, expect, it } from "vitest";
import type { StaffProfile } from "@ristonchi/shared";
import { DEMO_STAFF } from "../auth/mock";
import { runApprovalDecision, runChatTurn, type ChatDeps } from "./loop";
import { systemPrompt } from "./prompts";
import { MockLlm } from "../llm/mock";
import type { LlmCompletion, LlmProvider } from "../llm/types";
import { MockPlatform } from "../platform/mock";
import { createVenueData } from "../platform/mock-data";
import type { PlatformAdapter, PlatformToolCall } from "../platform/types";
import { MemoryStore } from "../store/memory";

const stefanie = DEMO_STAFF[0] as StaffProfile;
const coordinator = DEMO_STAFF[1] as StaffProfile;

async function collect<T>(events: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const event of events) out.push(event);
  return out;
}

function scripted(steps: LlmCompletion[]): LlmProvider {
  return {
    async complete() {
      return steps.shift() ?? { text: "Done.", toolCalls: [] };
    },
  };
}

function spyPlatform(): { calls: PlatformToolCall[]; platform: PlatformAdapter } {
  const calls: PlatformToolCall[] = [];
  return {
    calls,
    platform: {
      async callTool(input) {
        calls.push(input);
        return { ok: true, tool: input.name };
      },
      async listSchemas() {
        return null;
      },
    },
  };
}

function deps(partial: Partial<ChatDeps> & Pick<ChatDeps, "llm" | "platform">): ChatDeps {
  return {
    store: partial.store ?? new MemoryStore(),
    now: () => new Date("2026-11-15T12:00:00Z"),
    ...partial,
  };
}

describe("approval gate", () => {
  it("runs a read immediately and never adds confirm", async () => {
    const spy = spyPlatform();
    const store = new MemoryStore();
    const events = await collect(
      runChatTurn(
        deps({
          store,
          platform: spy.platform,
          llm: scripted([
            {
              text: "",
              toolCalls: [
                { id: "c1", name: "list_reservations", arguments: { limit: 5, confirm: true } },
              ],
            },
            { text: "Here they are.", toolCalls: [] },
          ]),
        }),
        {
          staff: stefanie,
          platformToken: "mock:stefanie",
          agentId: "sales-couples",
          message: "Who is in the pipeline?",
        },
      ),
    );
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]?.name).toBe("list_reservations");
    expect(spy.calls[0]?.args.confirm).toBeUndefined();
    expect(events.some((event) => event.type === "tool_result")).toBe(true);
    expect(events.some((event) => event.type === "approval_required")).toBe(false);
  });

  it("does not execute a write until it is approved", async () => {
    const spy = spyPlatform();
    const store = new MemoryStore();
    const chat = deps({
      store,
      platform: spy.platform,
      llm: scripted([
        {
          text: "I need your approval before this goes out.",
          toolCalls: [
            { id: "c1", name: "send_proposal", arguments: { proposal_id: 501, confirm: true } },
          ],
        },
        { text: "It is scheduled.", toolCalls: [] },
      ]),
    });
    const events = await collect(
      runChatTurn(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        agentId: "sales-couples",
        message: "Send proposal 501",
      }),
    );
    expect(spy.calls).toHaveLength(0);
    const card = events.find((event) => event.type === "approval_required");
    expect(card).toMatchObject({
      type: "approval_required",
      tool: "send_proposal",
      highConfirm: true,
      args: { proposal_id: 501 },
    });
    const pending = await store.listAudit(10);
    expect(pending[0]).toMatchObject({ tool: "send_proposal", status: "pending", approved: null });

    const conversationId = events.find((event) => event.type === "meta");
    expect(conversationId?.type).toBe("meta");
    const approvalId = card && card.type === "approval_required" ? card.approvalId : "";
    const after = await collect(
      runApprovalDecision(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        approvalId,
        decision: "approve",
      }),
    );
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({
      name: "send_proposal",
      args: { proposal_id: 501, confirm: true },
    });
    expect(after.some((event) => event.type === "tool_result")).toBe(true);
    const audit = await store.listAudit(10);
    expect(audit[0]).toMatchObject({ status: "executed", approved: true });

    await expect(
      collect(
        runApprovalDecision(chat, {
          staff: stefanie,
          platformToken: "mock:stefanie",
          approvalId,
          decision: "approve",
        }),
      ),
    ).rejects.toThrow(/already resolved/);
    expect(spy.calls).toHaveLength(1);
  });

  it("does not execute a write that is rejected", async () => {
    const spy = spyPlatform();
    const store = new MemoryStore();
    const chat = deps({
      store,
      platform: spy.platform,
      llm: scripted([
        {
          text: "",
          toolCalls: [
            { id: "c1", name: "set_availability_block", arguments: { date: "2027-06-19" } },
          ],
        },
        { text: "Left it as it was.", toolCalls: [] },
      ]),
    });
    const events = await collect(
      runChatTurn(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        agentId: "sales-couples",
        message: "Block 19 June 2027",
      }),
    );
    const card = events.find((event) => event.type === "approval_required");
    expect(card?.type).toBe("approval_required");
    if (card?.type !== "approval_required") return;
    expect(card.highConfirm).toBe(false);
    await collect(
      runApprovalDecision(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        approvalId: card.approvalId,
        decision: "reject",
      }),
    );
    expect(spy.calls).toHaveLength(0);
    const audit = await store.listAudit(5);
    expect(audit[0]).toMatchObject({ status: "rejected", approved: false });
  });

  it("refuses a tool outside the agent allowlist without calling the platform", async () => {
    const spy = spyPlatform();
    const store = new MemoryStore();
    const events = await collect(
      runChatTurn(
        deps({
          store,
          platform: spy.platform,
          llm: scripted([
            {
              text: "",
              toolCalls: [
                {
                  id: "c1",
                  name: "create_incident",
                  arguments: { raw_description: "A chair broke in the hall today." },
                },
              ],
            },
            { text: "I cannot file that from sales.", toolCalls: [] },
          ]),
        }),
        {
          staff: stefanie,
          platformToken: "mock:stefanie",
          agentId: "sales-couples",
          message: "File an incident",
        },
      ),
    );
    expect(spy.calls).toHaveLength(0);
    expect(events.some((event) => event.type === "notice")).toBe(true);
    const audit = await store.listAudit(5);
    expect(audit[0]).toMatchObject({ tool: "create_incident", status: "denied", approved: false });
  });

  it("lets the wedding-day agent file an incident only after approval", async () => {
    const spy = spyPlatform();
    const chat = deps({
      store: new MemoryStore(),
      platform: spy.platform,
      llm: scripted([
        {
          text: "",
          toolCalls: [
            {
              id: "c1",
              name: "create_incident",
              arguments: { raw_description: "A chair broke in the hall today." },
            },
          ],
        },
        { text: "Saved.", toolCalls: [] },
      ]),
    });
    const events = await collect(
      runChatTurn(chat, {
        staff: coordinator,
        platformToken: "mock:coordinator",
        agentId: "wedding-day",
        message: "A chair broke in the hall today.",
      }),
    );
    expect(spy.calls).toHaveLength(0);
    const card = events.find((event) => event.type === "approval_required");
    expect(card).toMatchObject({
      type: "approval_required",
      tool: "create_incident",
      highConfirm: false,
    });
  });
});

describe("mock venue demo", () => {
  it("reads a draft proposal, then sends it only after approval", async () => {
    const platform = new MockPlatform(createVenueData());
    const calls: string[] = [];
    const wrapped: PlatformAdapter = {
      async callTool(input) {
        calls.push(input.name);
        return platform.callTool(input);
      },
      listSchemas: () => platform.listSchemas(""),
    };
    const store = new MemoryStore();
    const chat: ChatDeps = {
      store,
      platform: wrapped,
      llm: new MockLlm(),
      now: () => new Date("2026-11-15T12:00:00Z"),
    };
    const first = await collect(
      runChatTurn(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        agentId: "sales-couples",
        message: "Which couples have a proposal waiting?",
      }),
    );
    expect(calls).toEqual(["list_proposals"]);
    const answer = first
      .filter((event) => event.type === "token")
      .map((event) => (event.type === "token" ? event.text : ""))
      .join("");
    expect(answer).toContain("Varga");
    expect(first.some((event) => event.type === "approval_required")).toBe(false);

    const second = await collect(
      runChatTurn(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        agentId: "sales-couples",
        conversationId:
          first.find((event) => event.type === "meta" && "conversationId" in event)?.type === "meta"
            ? (first.find((event) => event.type === "meta") as { conversationId: string })
                .conversationId
            : undefined,
        message: "Send the Varga proposal",
      }),
    );
    expect(calls).toContain("list_proposals");
    expect(calls).not.toContain("send_proposal");
    const card = second.find((event) => event.type === "approval_required");
    expect(card).toMatchObject({
      type: "approval_required",
      tool: "send_proposal",
      highConfirm: true,
      priorRead: true,
    });
    if (card?.type !== "approval_required") return;
    expect(card.args.confirm).toBeUndefined();

    await collect(
      runApprovalDecision(chat, {
        staff: stefanie,
        platformToken: "mock:stefanie",
        approvalId: card.approvalId,
        decision: "approve",
      }),
    );
    expect(calls.filter((name) => name === "send_proposal")).toEqual(["send_proposal"]);
    expect(platform.data.proposals.find((proposal) => proposal.id === 501)?.status).toBe(
      "scheduled",
    );
  });
});

describe("system prompt", () => {
  it("forbids invented prices and facts in writes", () => {
    for (const agent of ["sales-couples", "wedding-day"] as const) {
      const prompt = systemPrompt(agent);
      expect(prompt).toMatch(/Never put a price/);
      expect(prompt).toMatch(/do not know/i);
      expect(prompt).not.toMatch(/[—–]/);
    }
  });
});
