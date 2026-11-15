import type { AuditEntry } from "@ristonchi/shared";
import type { Approval, Conversation, Session, Store } from "./types";

export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * A Store on a key-value binding.
 * KV is eventually consistent, so this is not a safe lock for approvals in production.
 * Swap in a strongly consistent Store (D1, a Durable Object, or Azure) before real use.
 */
export class KvStore implements Store {
  constructor(private readonly kv: KvBinding) {}

  private async read<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  private async index(name: string): Promise<string[]> {
    return (await this.read<string[]>(`index:${name}`)) ?? [];
  }

  private async pushIndex(name: string, id: string): Promise<void> {
    const current = await this.index(name);
    if (!current.includes(id)) current.push(id);
    await this.kv.put(`index:${name}`, JSON.stringify(current.slice(-500)));
  }

  async saveSession(session: Session): Promise<void> {
    await this.kv.put(`session:${session.token}`, JSON.stringify(session));
  }

  async getSession(token: string): Promise<Session | null> {
    return this.read(`session:${token}`);
  }

  async deleteSession(token: string): Promise<void> {
    await this.kv.delete(`session:${token}`);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    await this.kv.put(`conversation:${conversation.id}`, JSON.stringify(conversation));
    await this.pushIndex(`staff-conversations:${conversation.staffId}`, conversation.id);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.read(`conversation:${id}`);
  }

  async listConversations(staffId: string): Promise<Conversation[]> {
    const ids = await this.index(`staff-conversations:${staffId}`);
    const rows = await Promise.all(ids.map((id) => this.getConversation(id)));
    return rows
      .filter((row): row is Conversation => row !== null)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async saveApproval(approval: Approval): Promise<void> {
    await this.kv.put(`approval:${approval.id}`, JSON.stringify(approval));
  }

  async getApproval(id: string): Promise<Approval | null> {
    return this.read(`approval:${id}`);
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await this.kv.put(`audit:${entry.id}`, JSON.stringify(entry));
    await this.pushIndex("audit", entry.id);
  }

  async updateAudit(id: string, patch: Partial<AuditEntry>): Promise<void> {
    const current = await this.read<AuditEntry>(`audit:${id}`);
    if (!current) return;
    await this.kv.put(`audit:${id}`, JSON.stringify({ ...current, ...patch, id }));
  }

  async listAudit(limit: number): Promise<AuditEntry[]> {
    const ids = (await this.index("audit")).slice(-limit).reverse();
    const rows = await Promise.all(ids.map((id) => this.read<AuditEntry>(`audit:${id}`)));
    return rows.filter((row): row is AuditEntry => row !== null);
  }
}
