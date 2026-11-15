import type { AgentId, StaffProfile } from "@ristonchi/shared";

export type ToolKind = "read" | "write" | "high_confirm";

const SALES_READ = [
  "list_reservations",
  "get_reservation_details",
  "get_reservation_pipeline_history",
  "list_customers",
  "get_customer",
  "get_customer_history",
  "list_proposals",
  "get_proposal",
  "list_contracts",
  "get_contract",
  "get_envelope_status",
  "list_follow_ups",
  "list_outbox_messages",
  "outbox_summary",
  "check_availability",
  "list_venue_availability",
  "get_funnel_analytics",
  "get_couple_profile",
  "get_plan_overview",
  "get_price_list",
  "estimate_pricing",
  "list_forms",
  "get_form",
  "search_knowledge",
] as const;

const SALES_WRITE = [
  "create_reservation",
  "update_reservation",
  "update_reservation_status",
  "create_proposal",
  "reissue_proposal",
  "cancel_proposal_send",
  "send_contract_for_signature",
  "send_custom_email",
  "send_email",
  "stop_follow_up",
  "add_couple_memory",
  "add_plan_item",
  "complete_plan_item",
  "assign_form",
  "set_availability_block",
] as const;

const SALES_HIGH_CONFIRM = [
  "generate_proposal_draft",
  "send_proposal",
  "create_contract",
  "release_outbox_message",
  "discard_outbox_message",
  "delete_reservation",
] as const;

const WEDDING_READ = [
  "list_upcoming_events",
  "get_event_sheet",
  "event_health",
  "experience_control_tower",
  "list_control_tower_alerts",
  "list_event_vendors",
  "list_guests",
  "list_guest_requests",
  "get_event_weather",
  "get_venue_weather",
  "preview_department_briefing",
  "list_shifts",
  "list_staff",
  "list_tasks",
  "list_incidents",
  "get_event_debrief",
  "search_knowledge",
] as const;

const WEDDING_WRITE = [
  "event_preparation",
  "invite_vendor",
  "update_event_vendor",
  "update_guest",
  "create_guest_request",
  "update_guest_request_status",
  "send_department_briefing",
  "create_incident",
  "update_incident_status",
  "create_task",
  "update_task",
  "update_task_status",
  "prepare_event_debrief",
] as const;

export const AGENT_TOOLS: Record<AgentId, readonly string[]> = {
  "sales-couples": [...SALES_READ, ...SALES_WRITE, ...SALES_HIGH_CONFIRM],
  "wedding-day": [...WEDDING_READ, ...WEDDING_WRITE],
};

const KIND = new Map<string, ToolKind>();
for (const name of [...SALES_READ, ...WEDDING_READ]) KIND.set(name, "read");
for (const name of [...SALES_WRITE, ...WEDDING_WRITE]) KIND.set(name, "write");
for (const name of SALES_HIGH_CONFIRM) KIND.set(name, "high_confirm");

export function toolKind(name: string): ToolKind | null {
  return KIND.get(name) ?? null;
}

export type ToolClassification =
  | { allowed: false; reason: string }
  | { allowed: true; kind: "read" }
  | { allowed: true; kind: "write"; highConfirm: boolean };

/**
 * Role gate for which agent a staff member may open.
 * Sales: platform role admin or manager, or the sales flag.
 * Coordinator: admin, manager, or event_coordinator.
 */
const AGENT_ACCESS: Record<AgentId, { roles: StaffProfile["role"][]; salesFlag: boolean }> = {
  "sales-couples": { roles: ["admin", "manager"], salesFlag: true },
  "wedding-day": { roles: ["admin", "manager", "event_coordinator"], salesFlag: false },
};

export function staffCanUseAgent(staff: StaffProfile, agentId: AgentId): boolean {
  const rule = AGENT_ACCESS[agentId];
  if (rule.roles.includes(staff.role)) return true;
  if (rule.salesFlag && staff.flags.sales === true) return true;
  return false;
}

export function staffCanViewAudit(staff: StaffProfile): boolean {
  return staff.role === "admin";
}

export function classifyTool(agentId: AgentId, toolName: string): ToolClassification {
  const kind = toolKind(toolName);
  if (!kind) {
    return { allowed: false, reason: `Unknown tool ${toolName}.` };
  }
  if (!AGENT_TOOLS[agentId].includes(toolName)) {
    return { allowed: false, reason: `${toolName} is not available to this agent.` };
  }
  if (kind === "read") return { allowed: true, kind: "read" };
  return { allowed: true, kind: "write", highConfirm: kind === "high_confirm" };
}

/** Drop a model-supplied confirm flag. The app sets it, and only after approval. */
export function argsWithoutConfirm(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  delete next.confirm;
  return next;
}

/** confirm=true is added only for a high-confirm tool that a person has approved. */
export function argsForApprovedCall(
  raw: Record<string, unknown>,
  highConfirm: boolean,
): Record<string, unknown> {
  const args = argsWithoutConfirm(raw);
  if (highConfirm) args.confirm = true;
  return args;
}
