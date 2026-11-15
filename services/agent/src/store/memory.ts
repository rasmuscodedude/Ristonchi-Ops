import type { AuditEntry } from "@ristonchi/shared";
import type { Approval, Conversation, Session, Store } from "./types";

export class MemoryStore implements Store {
  readonly sessions = new Map<string, Session>();
  readonly conversations = new Map<string, Conversation>();
  readonly approvals = new Map<string, Approval>();
  readonly audit: AuditEntry[] = [];

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.token, session);
  }

  async getSession(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async listConversations(staffId: string): Promise<Conversation[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.staffId === staffId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async saveApproval(approval: Approval): Promise<void> {
    this.approvals.set(approval.id, approval);
  }

  async getApproval(id: string): Promise<Approval | null> {
    return this.approvals.get(id) ?? null;
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.audit.push(entry);
  }

  async updateAudit(id: string, patch: Partial<AuditEntry>): Promise<void> {
    const index = this.audit.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    this.audit[index] = { ...this.audit[index], ...patch, id };
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    return [...this.audit].reverse().slice(0, limit);
  }
}
