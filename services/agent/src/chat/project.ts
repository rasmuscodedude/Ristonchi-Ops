import type { TranscriptItem } from "@ristonchi/shared";
import type { Approval, Conversation } from "../store/types";

export function projectTranscript(
  conversation: Conversation,
  approvals: Approval[],
): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  conversation.messages.forEach((message, index) => {
    if (message.role === "system") return;
    if (message.role === "user") {
      items.push({
        kind: "user",
        id: `m-${index}`,
        text: message.content,
        at: conversation.updatedAt,
      });
      return;
    }
    if (message.role === "assistant") {
      if (message.content.trim()) {
        items.push({
          kind: "assistant",
          id: `m-${index}`,
          text: message.content,
          at: conversation.updatedAt,
        });
      }
      for (const toolCall of message.toolCalls ?? []) {
        const approval = approvals.find((item) => item.callId === toolCall.id);
        if (!approval) continue;
        items.push({
          kind: "approval",
          id: approval.id,
          approvalId: approval.id,
          tool: approval.tool,
          args: approval.args,
          highConfirm: approval.highConfirm,
          status: approval.status,
          priorRead: approval.priorRead,
          at: approval.createdAt,
        });
      }
      return;
    }
    let result: unknown = message.content;
    try {
      result = JSON.parse(message.content) as unknown;
    } catch {
      result = message.content;
    }
    items.push({
      kind: "tool",
      id: message.callId,
      tool: message.name,
      result,
      at: conversation.updatedAt,
    });
  });
  return items;
}
