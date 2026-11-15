import type { JsonSchema } from "../tools";

export type LlmTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

export type LlmCompletion = {
  text: string;
  toolCalls: LlmToolCall[];
};

export interface LlmProvider {
  complete(input: { messages: LlmMessage[]; tools: LlmTool[] }): Promise<LlmCompletion>;
}
