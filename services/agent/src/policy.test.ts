import { describe, expect, it } from "vitest";
import type { AgentId, StaffProfile } from "@ristonchi/shared";
import {
  AGENT_TOOLS,
  argsForApprovedCall,
  argsWithoutConfirm,
  classifyTool,
  staffCanUseAgent,
  staffCanViewAudit,
  toolKind,
} from "./policy";

const staff = (role: StaffProfile["role"], sales = false): StaffProfile => ({
  id: role,
  email: `${role}@ristonchi.com`,
  name: role,
  role,
  flags: sales ? { sales: true } : {},
});

describe("agent access", () => {
  it("maps sales to admin, manager, and the sales flag", () => {
    expect(staffCanUseAgent(staff("admin"), "sales-couples")).toBe(true);
    expect(staffCanUseAgent(staff("manager"), "sales-couples")).toBe(true);
    expect(staffCanUseAgent(staff("reception", true), "sales-couples")).toBe(true);
    expect(staffCanUseAgent(staff("event_coordinator"), "sales-couples")).toBe(false);
    expect(staffCanUseAgent(staff("chef"), "sales-couples")).toBe(false);
  });

  it("maps the wedding-day agent to admin, manager, and event_coordinator", () => {
    expect(staffCanUseAgent(staff("admin"), "wedding-day")).toBe(true);
    expect(staffCanUseAgent(staff("manager"), "wedding-day")).toBe(true);
    expect(staffCanUseAgent(staff("event_coordinator"), "wedding-day")).toBe(true);
    expect(staffCanUseAgent(staff("reception", true), "wedding-day")).toBe(false);
    expect(staffCanUseAgent(staff("chef"), "wedding-day")).toBe(false);
  });

  it("reserves the audit log for admins", () => {
    expect(staffCanViewAudit(staff("admin"))).toBe(true);
    expect(staffCanViewAudit(staff("manager"))).toBe(false);
  });
});

describe("allowlist", () => {
  const salesOnly = "send_proposal";
  const weddingOnly = "create_incident";

  it("lets each agent call its own reads and writes", () => {
    expect(classifyTool("sales-couples", "list_reservations")).toEqual({
      allowed: true,
      kind: "read",
    });
    expect(classifyTool("sales-couples", "set_availability_block")).toEqual({
      allowed: true,
      kind: "write",
      highConfirm: false,
    });
    expect(classifyTool("sales-couples", salesOnly)).toEqual({
      allowed: true,
      kind: "write",
      highConfirm: true,
    });
    expect(classifyTool("wedding-day", "list_upcoming_events")).toEqual({
      allowed: true,
      kind: "read",
    });
    expect(classifyTool("wedding-day", weddingOnly)).toEqual({
      allowed: true,
      kind: "write",
      highConfirm: false,
    });
  });

  it("refuses tools that belong to the other agent", () => {
    expect(classifyTool("sales-couples", weddingOnly).allowed).toBe(false);
    expect(classifyTool("wedding-day", salesOnly).allowed).toBe(false);
    expect(classifyTool("wedding-day", "delete_reservation").allowed).toBe(false);
  });

  it("refuses unknown tools", () => {
    expect(classifyTool("sales-couples", "list_activity").allowed).toBe(false);
    expect(classifyTool("wedding-day", "drop_database").allowed).toBe(false);
  });

  it("marks every high-confirm sales tool", () => {
    for (const name of [
      "generate_proposal_draft",
      "send_proposal",
      "create_contract",
      "release_outbox_message",
      "discard_outbox_message",
      "delete_reservation",
    ]) {
      expect(toolKind(name)).toBe("high_confirm");
    }
  });

  it("keeps the two allowlists disjoint except shared reads", () => {
    const sales = new Set(AGENT_TOOLS["sales-couples"]);
    const wedding = new Set(AGENT_TOOLS["wedding-day"]);
    const overlap = [...sales].filter((name) => wedding.has(name));
    expect(overlap).toEqual(["search_knowledge"]);
  });

  it("has a kind for every allowlisted tool", () => {
    const agents: AgentId[] = ["sales-couples", "wedding-day"];
    for (const agent of agents) {
      for (const name of AGENT_TOOLS[agent]) {
        expect(toolKind(name), name).not.toBeNull();
      }
    }
  });
});

describe("confirm flag", () => {
  it("strips confirm until a high-confirm tool is approved", () => {
    expect(argsWithoutConfirm({ proposal_id: 501, confirm: true })).toEqual({ proposal_id: 501 });
    expect(argsForApprovedCall({ proposal_id: 501, confirm: true }, true)).toEqual({
      proposal_id: 501,
      confirm: true,
    });
    expect(argsForApprovedCall({ date: "2027-06-19", confirm: true }, false)).toEqual({
      date: "2027-06-19",
    });
  });
});
