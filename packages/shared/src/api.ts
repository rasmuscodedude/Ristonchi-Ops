import type { AgentId } from "./agents";
import type { StaffProfile } from "./roles";

export type HealthResponse = {
  ok: true;
  appName: string;
  authMode: "mock" | "platform";
  platformMode: "mock" | "mcp";
  llmProvider: "mock" | "openai" | "azure";
  demo: {
    password: string;
    accounts: Array<{
      email: string;
      name: string;
      role: StaffProfile["role"];
      note: string;
    }>;
  } | null;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  staff: StaffProfile;
};

export type AgentsResponse = {
  agents: Array<{
    id: AgentId;
    title: string;
    blurb: string;
    suggestions: string[];
  }>;
};

export type ChatRequest = {
  agentId: AgentId;
  conversationId?: string;
  message: string;
};

export type ApprovalDecisionRequest = {
  decision: "approve" | "reject";
};

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; at: string }
  | { kind: "assistant"; id: string; text: string; at: string }
  | { kind: "tool"; id: string; tool: string; result: unknown; at: string }
  | {
      kind: "approval";
      id: string;
      approvalId: string;
      tool: string;
      args: Record<string, unknown>;
      highConfirm: boolean;
      status: "pending" | "executing" | "executed" | "rejected" | "error";
      priorRead: boolean;
      at: string;
    };

export type ConversationSummary = {
  id: string;
  agentId: AgentId;
  title: string;
  updatedAt: string;
};

export type ConversationResponse = {
  id: string;
  agentId: AgentId;
  title: string;
  updatedAt: string;
  items: TranscriptItem[];
};

export type AuditEntry = {
  id: string;
  at: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  agentId: AgentId;
  conversationId: string;
  tool: string;
  args: Record<string, unknown>;
  /** True when a read ran, or a write ran after approval. False when denied or rejected. Null while waiting. */
  approved: boolean | null;
  status: "executed" | "pending" | "executing" | "rejected" | "denied" | "error";
  result?: unknown;
  error?: string;
};

export type AuditResponse = {
  entries: AuditEntry[];
};

export type ChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; callId: string; tool: string }
  | { type: "tool_result"; callId: string; tool: string; result: unknown }
  | {
      type: "approval_required";
      approvalId: string;
      conversationId: string;
      tool: string;
      args: Record<string, unknown>;
      highConfirm: boolean;
      priorRead: boolean;
    }
  | { type: "notice"; text: string }
  | { type: "error"; message: string }
  | { type: "done"; conversationId: string };
