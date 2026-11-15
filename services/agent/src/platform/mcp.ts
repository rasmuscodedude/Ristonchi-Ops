import type { JsonSchema } from "../tools";
import type { PlatformAdapter, PlatformToolCall, RemoteToolSchema } from "./types";

type JsonRpc = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { message?: string };
};

/**
 * Minimal MCP streamable-HTTP client.
 * Authenticates each call with the staff member's Norberto token.
 */
export class McpPlatform implements PlatformAdapter {
  private readonly sessions = new Map<string, { id: string; at: number }>();

  constructor(private readonly url: string) {}

  async listSchemas(platformToken: string): Promise<RemoteToolSchema[] | null> {
    const result = await this.rpc(platformToken, "tools/list", {});
    const tools = (result as { tools?: unknown }).tools;
    if (!Array.isArray(tools)) return null;
    return tools.flatMap((tool) => {
      if (!tool || typeof tool !== "object") return [];
      const record = tool as Record<string, unknown>;
      if (typeof record.name !== "string") return [];
      const parameters = isSchema(record.inputSchema)
        ? record.inputSchema
        : { type: "object" as const, properties: {} };
      return [
        {
          name: record.name,
          description: typeof record.description === "string" ? record.description : record.name,
          parameters,
        },
      ];
    });
  }

  async callTool(input: PlatformToolCall): Promise<unknown> {
    const result = await this.rpc(input.platformToken, "tools/call", {
      name: input.name,
      arguments: input.args,
    });
    const record = result as {
      isError?: boolean;
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    };
    if (record.isError) {
      const text = record.content?.find((item) => item.type === "text")?.text;
      throw new Error(text || `${input.name} failed.`);
    }
    if (record.structuredContent !== undefined) return record.structuredContent;
    const text = record.content?.find((item) => item.type === "text")?.text;
    if (typeof text === "string") {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return { text };
      }
    }
    return result;
  }

  private async rpc(token: string, method: string, params: unknown): Promise<unknown> {
    const sessionId = await this.session(token);
    const message = await this.post(token, sessionId, {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    });
    if (message.error) {
      throw new Error(message.error.message || `MCP ${method} failed.`);
    }
    return message.result ?? {};
  }

  private async session(token: string): Promise<string | undefined> {
    const cached = this.sessions.get(token);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.id;
    const init = await this.post(token, undefined, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "ristonchi-staff", version: "0.1.0" },
      },
    });
    if (init.error) throw new Error(init.error.message || "MCP initialize failed.");
    if (init.sessionId) {
      await this.post(
        token,
        init.sessionId,
        { jsonrpc: "2.0", method: "notifications/initialized" },
        true,
      );
      this.sessions.set(token, { id: init.sessionId, at: Date.now() });
    }
    return init.sessionId;
  }

  private async post(
    token: string,
    sessionId: string | undefined,
    body: unknown,
    notification = false,
  ): Promise<JsonRpc & { sessionId?: string }> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const nextSession = response.headers.get("mcp-session-id") ?? sessionId;
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`MCP ${response.status}: ${detail.slice(0, 300)}`);
    }
    if (notification) return { sessionId: nextSession };
    const parsed = await readRpc(response);
    return { ...parsed, sessionId: nextSession };
  }
}

async function readRpc(response: Response): Promise<JsonRpc> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    return (await response.json()) as JsonRpc;
  }
  const text = await response.text();
  let last: JsonRpc | null = null;
  for (const block of text.split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    last = JSON.parse(data) as JsonRpc;
  }
  if (!last) throw new Error("MCP stream ended without a message.");
  return last;
}

function isSchema(value: unknown): value is JsonSchema {
  return Boolean(
    value && typeof value === "object" && (value as { type?: string }).type === "object",
  );
}
