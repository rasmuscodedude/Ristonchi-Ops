import type { LlmCompletion, LlmMessage, LlmProvider, LlmTool, LlmToolCall } from "./types";

type ChatBody = {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  stream: true;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
      azure?: { endpoint: string; deployment: string; apiVersion: string; apiKey: string };
    },
  ) {}

  async complete(input: { messages: LlmMessage[]; tools: LlmTool[] }): Promise<LlmCompletion> {
    const azure = this.options.azure;
    const url = azure
      ? `${azure.endpoint.replace(/\/$/, "")}/openai/deployments/${azure.deployment}/chat/completions?api-version=${azure.apiVersion}`
      : `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "text/event-stream",
    };
    if (azure) headers["api-key"] = azure.apiKey;
    else headers.authorization = `Bearer ${this.options.apiKey}`;

    const body: ChatBody = {
      model: azure ? azure.deployment : this.options.model,
      messages: input.messages.map(toApiMessage),
      stream: true,
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok || !response.body) {
      const detail = await response.text();
      throw new Error(`The model request failed (${response.status}). ${detail.slice(0, 300)}`);
    }
    return readCompletion(response.body);
  }
}

function toApiMessage(message: LlmMessage): unknown {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.callId, content: message.content };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

async function readCompletion(body: ReadableStream<Uint8Array>): Promise<LlmCompletion> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const calls = new Map<number, { id: string; name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const json = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string") text += delta.content;
      for (const call of delta.tool_calls ?? []) {
        const current = calls.get(call.index) ?? { id: "", name: "", arguments: "" };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments += call.function.arguments;
        calls.set(call.index, current);
      }
    }
  }

  const toolCalls: LlmToolCall[] = [...calls.values()].map((call) => ({
    id: call.id || crypto.randomUUID(),
    name: call.name,
    arguments: parseArgs(call.arguments),
  }));
  return { text, toolCalls };
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
