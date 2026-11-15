import type { JsonSchema } from "../tools";

export type PlatformToolCall = {
  name: string;
  args: Record<string, unknown>;
  platformToken: string;
};

export type RemoteToolSchema = {
  name: string;
  description: string;
  parameters: JsonSchema;
};

export interface PlatformAdapter {
  callTool(input: PlatformToolCall): Promise<unknown>;
  /** Live schemas from the platform, or null when the adapter has none. */
  listSchemas(platformToken: string): Promise<RemoteToolSchema[] | null>;
}
