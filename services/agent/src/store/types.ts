import type { AgentId, AuditEntry, StaffProfile } from "@ristonchi/shared";

export type LlmTurnMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: StoredToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

export type StoredToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  staffId: string;
  agentId: AgentId;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: LlmTurnMessage[];
  approvalIds: string[];
};

export type ApprovalStatus = "pending" | "executing" | "executed" | "rejected" | "error";

export type Approval = {
  id: string;
  conversationId: string;
  staffId: string;
  agentId: AgentId;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  highConfirm: boolean;
  priorRead: boolean;
  status: ApprovalStatus;
  auditId: string;
  createdAt: string;
  resolvedAt?: string;
  result?: unknown;
  error?: string;
};

export type Session = {
  token: string;
  platformToken: string;
  staff: StaffProfile;
  createdAt: string;
};

export interface Store {
  saveSession(session: Session): Promise<void>;
  getSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;

  saveConversation(conversation: Conversation): Promise<void>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(staffId: string): Promise<Conversation[]>;

  saveApproval(approval: Approval): Promise<void>;
  getApproval(id: string): Promise<Approval | null>;

  appendAudit(entry: AuditEntry): Promise<void>;
  updateAudit(id: string, patch: Partial<AuditEntry>): Promise<void>;
  listAudit(limit: number): Promise<AuditEntry[]>;
}
