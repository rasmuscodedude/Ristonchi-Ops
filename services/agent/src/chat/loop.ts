import type { AgentId, AuditEntry, ChatEvent, StaffProfile } from "@ristonchi/shared";
import { HttpError } from "../errors";
import type { LlmProvider, LlmTool, LlmToolCall } from "../llm/types";
import {
  AGENT_TOOLS,
  argsForApprovedCall,
  argsWithoutConfirm,
  classifyTool,
  toolKind,
} from "../policy";
import type { PlatformAdapter } from "../platform/types";
import type { Approval, Conversation, Store } from "../store/types";
import { schemaForModel, TOOL_DEFINITIONS } from "../tools";
import { systemPrompt } from "./prompts";

const MAX_ROUNDS = 6;

export type ChatDeps = {
  store: Store;
  platform: PlatformAdapter;
  llm: LlmProvider;
  now?: () => Date;
};

type Actor = {
  staff: StaffProfile;
  platformToken: string;
};

export async function* runChatTurn(
  deps: ChatDeps,
  input: Actor & { agentId: AgentId; conversationId?: string; message: string },
): AsyncGenerator<ChatEvent> {
  const now = deps.now ?? (() => new Date());
  let conversation = input.conversationId
    ? await deps.store.getConversation(input.conversationId)
    : null;
  if (input.conversationId && (!conversation || conversation.staffId !== input.staff.id)) {
    throw new HttpError(404, "Conversation not found.");
  }
  if (conversation && conversation.agentId !== input.agentId) {
    throw new HttpError(400, "This conversation belongs to a different agent.");
  }
  if (!conversation) {
    conversation = {
      id: crypto.randomUUID(),
      staffId: input.staff.id,
      agentId: input.agentId,
      title: input.message.slice(0, 80),
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
      messages: [{ role: "system", content: systemPrompt(input.agentId) }],
      approvalIds: [],
    };
  }

  const pending = await pendingApproval(deps.store, conversation);
  yield { type: "meta", conversationId: conversation.id };
  if (pending) {
    yield {
      type: "notice",
      text: "There is still an action waiting for your approval.",
    };
    yield approvalEvent(pending, conversation.id);
    yield { type: "done", conversationId: conversation.id };
    return;
  }

  conversation.messages.push({ role: "user", content: input.message });
  conversation.updatedAt = now().toISOString();
  await deps.store.saveConversation(conversation);
  yield* runModelLoop(deps, conversation, input);
  yield { type: "done", conversationId: conversation.id };
}

export async function* runApprovalDecision(
  deps: ChatDeps,
  input: Actor & { approvalId: string; decision: "approve" | "reject" },
): AsyncGenerator<ChatEvent> {
  const now = (deps.now ?? (() => new Date()))();
  const approval = await deps.store.getApproval(input.approvalId);
  if (!approval || approval.staffId !== input.staff.id) {
    throw new HttpError(404, "Approval not found.");
  }
  if (approval.status !== "pending") {
    throw new HttpError(409, "This approval is already resolved.");
  }
  const conversation = await deps.store.getConversation(approval.conversationId);
  if (!conversation || conversation.staffId !== input.staff.id) {
    throw new HttpError(404, "Conversation not found.");
  }

  yield { type: "meta", conversationId: conversation.id };

  if (input.decision === "reject") {
    approval.status = "rejected";
    approval.resolvedAt = now.toISOString();
    await deps.store.saveApproval(approval);
    await deps.store.updateAudit(approval.auditId, { approved: false, status: "rejected" });
    conversation.messages.push({
      role: "tool",
      callId: approval.callId,
      name: approval.tool,
      content: JSON.stringify({
        rejected: true,
        message: "The staff member rejected this action. Do not retry it unless they ask again.",
      }),
    });
    conversation.updatedAt = now.toISOString();
    await deps.store.saveConversation(conversation);
    yield* runModelLoop(deps, conversation, input);
    yield { type: "done", conversationId: conversation.id };
    return;
  }

  approval.status = "executing";
  await deps.store.saveApproval(approval);
  const args = argsForApprovedCall(approval.args, approval.highConfirm);
  try {
    const result = await deps.platform.callTool({
      name: approval.tool,
      args,
      platformToken: input.platformToken,
    });
    approval.status = "executed";
    approval.result = result;
    approval.resolvedAt = now.toISOString();
    await deps.store.saveApproval(approval);
    await deps.store.updateAudit(approval.auditId, {
      approved: true,
      status: "executed",
      args,
      result,
    });
    conversation.messages.push({
      role: "tool",
      callId: approval.callId,
      name: approval.tool,
      content: JSON.stringify(result),
    });
    yield { type: "tool_result", callId: approval.callId, tool: approval.tool, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The tool failed.";
    approval.status = "error";
    approval.error = message;
    approval.resolvedAt = now.toISOString();
    await deps.store.saveApproval(approval);
    await deps.store.updateAudit(approval.auditId, {
      approved: true,
      status: "error",
      args,
      error: message,
    });
    conversation.messages.push({
      role: "tool",
      callId: approval.callId,
      name: approval.tool,
      content: JSON.stringify({ error: message }),
    });
    yield {
      type: "tool_result",
      callId: approval.callId,
      tool: approval.tool,
      result: { error: message },
    };
  }

  conversation.updatedAt = now.toISOString();
  await deps.store.saveConversation(conversation);
  yield* runModelLoop(deps, conversation, input);
  yield { type: "done", conversationId: conversation.id };
}

async function* runModelLoop(
  deps: ChatDeps,
  conversation: Conversation,
  actor: Actor,
): AsyncGenerator<ChatEvent> {
  const now = deps.now ?? (() => new Date());
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const tools = await toolsFor(deps.platform, conversation.agentId, actor.platformToken);
    const completion = await deps.llm.complete({ messages: conversation.messages, tools });
    const calls = callsUntilWrite(conversation.agentId, completion.toolCalls);

    if (completion.text) {
      for (const piece of chunkText(completion.text)) yield { type: "token", text: piece };
    }
    if (completion.text || calls.length) {
      conversation.messages.push({
        role: "assistant",
        content: completion.text,
        toolCalls: calls,
      });
    }
    if (!calls.length) {
      conversation.updatedAt = now().toISOString();
      await deps.store.saveConversation(conversation);
      return;
    }

    for (const toolCall of calls) {
      const decision = classifyTool(conversation.agentId, toolCall.name);
      const args = argsWithoutConfirm(toolCall.arguments);
      if (!decision.allowed) {
        await recordAudit(deps, conversation, actor, {
          tool: toolCall.name,
          args,
          approved: false,
          status: "denied",
          error: decision.reason,
        });
        conversation.messages.push({
          role: "tool",
          callId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify({ error: decision.reason }),
        });
        yield { type: "notice", text: decision.reason };
        continue;
      }

      if (decision.kind === "write") {
        const audit = await recordAudit(deps, conversation, actor, {
          tool: toolCall.name,
          args,
          approved: null,
          status: "pending",
        });
        const approval: Approval = {
          id: crypto.randomUUID(),
          conversationId: conversation.id,
          staffId: actor.staff.id,
          agentId: conversation.agentId,
          callId: toolCall.id,
          tool: toolCall.name,
          args,
          highConfirm: decision.highConfirm,
          priorRead: hasPriorRead(conversation),
          status: "pending",
          auditId: audit.id,
          createdAt: now().toISOString(),
        };
        conversation.approvalIds.push(approval.id);
        conversation.updatedAt = approval.createdAt;
        await deps.store.saveApproval(approval);
        await deps.store.saveConversation(conversation);
        yield approvalEvent(approval, conversation.id);
        return;
      }

      yield { type: "tool_start", callId: toolCall.id, tool: toolCall.name };
      try {
        const result = await deps.platform.callTool({
          name: toolCall.name,
          args,
          platformToken: actor.platformToken,
        });
        await recordAudit(deps, conversation, actor, {
          tool: toolCall.name,
          args,
          approved: true,
          status: "executed",
          result,
        });
        conversation.messages.push({
          role: "tool",
          callId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(result),
        });
        yield { type: "tool_result", callId: toolCall.id, tool: toolCall.name, result };
      } catch (error) {
        const message = error instanceof Error ? error.message : "The tool failed.";
        await recordAudit(deps, conversation, actor, {
          tool: toolCall.name,
          args,
          approved: true,
          status: "error",
          error: message,
        });
        const result = { error: message };
        conversation.messages.push({
          role: "tool",
          callId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(result),
        });
        yield { type: "tool_result", callId: toolCall.id, tool: toolCall.name, result };
      }
    }

    conversation.updatedAt = now().toISOString();
    await deps.store.saveConversation(conversation);
  }

  yield {
    type: "notice",
    text: "I paused after several steps. Ask me to continue if you want more.",
  };
  await deps.store.saveConversation(conversation);
}

function callsUntilWrite(agentId: AgentId, calls: LlmToolCall[]): LlmToolCall[] {
  const kept: LlmToolCall[] = [];
  for (const toolCall of calls) {
    kept.push(toolCall);
    const decision = classifyTool(agentId, toolCall.name);
    if (decision.allowed && decision.kind === "write") break;
  }
  return kept;
}

function hasPriorRead(conversation: Conversation): boolean {
  return conversation.messages.some((message) => {
    if (message.role !== "tool" || toolKind(message.name) !== "read") return false;
    try {
      const payload = JSON.parse(message.content) as { error?: unknown };
      return typeof payload.error !== "string";
    } catch {
      return true;
    }
  });
}

async function toolsFor(
  platform: PlatformAdapter,
  agentId: AgentId,
  platformToken: string,
): Promise<LlmTool[]> {
  let live: Awaited<ReturnType<PlatformAdapter["listSchemas"]>> = null;
  try {
    live = await platform.listSchemas(platformToken);
  } catch {
    live = null;
  }
  const allowed = new Set(AGENT_TOOLS[agentId]);
  const bundled = AGENT_TOOLS[agentId].flatMap((name) => {
    const definition = TOOL_DEFINITIONS[name];
    return definition ? [definition] : [];
  });
  const defs = live ? live.filter((tool) => allowed.has(tool.name)) : bundled;
  return defs.map((definition) => {
    const kind = toolKind(definition.name);
    const gate =
      kind === "read"
        ? ""
        : " Staff must approve before this runs. Do not include a price or fact that did not come from a read tool result in this conversation. Do not set confirm.";
    return {
      name: definition.name,
      description: `${definition.description}${gate}`,
      parameters: schemaForModel(definition.parameters),
    };
  });
}

async function recordAudit(
  deps: ChatDeps,
  conversation: Conversation,
  actor: Actor,
  fields: Pick<AuditEntry, "tool" | "args" | "approved" | "status"> &
    Partial<Pick<AuditEntry, "result" | "error">>,
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    at: (deps.now ?? (() => new Date()))().toISOString(),
    staffId: actor.staff.id,
    staffName: actor.staff.name,
    staffEmail: actor.staff.email,
    agentId: conversation.agentId,
    conversationId: conversation.id,
    tool: fields.tool,
    args: fields.args,
    approved: fields.approved,
    status: fields.status,
    result: fields.result,
    error: fields.error,
  };
  await deps.store.appendAudit(entry);
  return entry;
}

async function pendingApproval(store: Store, conversation: Conversation): Promise<Approval | null> {
  for (const id of conversation.approvalIds) {
    const approval = await store.getApproval(id);
    if (approval?.status === "pending") return approval;
  }
  return null;
}

function approvalEvent(approval: Approval, conversationId: string): ChatEvent {
  return {
    type: "approval_required",
    approvalId: approval.id,
    conversationId,
    tool: approval.tool,
    args: approval.args,
    highConfirm: approval.highConfirm,
    priorRead: approval.priorRead,
  };
}

function chunkText(text: string): string[] {
  const parts = text.split(/(\s+)/);
  const chunks: string[] = [];
  let buffer = "";
  for (const part of parts) {
    buffer += part;
    if (buffer.length >= 48) {
      chunks.push(buffer);
      buffer = "";
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length ? chunks : [text];
}
