export type AppConfig = {
  authMode: "mock" | "platform";
  platformMode: "mock" | "mcp";
  platformMcpUrl: string;
  platformAuthUrl: string;
  llmProvider: "mock" | "openai" | "azure";
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  azureEndpoint: string;
  azureApiKey: string;
  azureDeployment: string;
  azureApiVersion: string;
  webOrigin: string;
  mockStaffPassword: string;
  port: number;
};

export function configFromEnv(env: object): AppConfig {
  const source = env as Record<string, unknown>;
  const read = (key: string) => {
    const value = source[key];
    return typeof value === "string" ? value : undefined;
  };
  const authMode = mode(read("AUTH_MODE"), ["mock", "platform"], "mock");
  const platformMode = mode(read("PLATFORM_MODE"), ["mock", "mcp"], "mock");
  const llmProvider = mode(read("LLM_PROVIDER"), ["mock", "openai", "azure"], "mock");
  return {
    authMode,
    platformMode,
    platformMcpUrl: read("PLATFORM_MCP_URL") || "https://api.ristonchi.com/mcp",
    platformAuthUrl: read("PLATFORM_AUTH_URL") || "https://api.ristonchi.com",
    llmProvider,
    llmApiKey: read("LLM_API_KEY") || "",
    llmBaseUrl: read("LLM_BASE_URL") || "https://api.openai.com/v1",
    llmModel: read("LLM_MODEL") || "gpt-4o-mini",
    azureEndpoint: read("AZURE_OPENAI_ENDPOINT") || "",
    azureApiKey: read("AZURE_OPENAI_API_KEY") || read("LLM_API_KEY") || "",
    azureDeployment: read("AZURE_OPENAI_DEPLOYMENT") || "",
    azureApiVersion: read("AZURE_OPENAI_API_VERSION") || "2024-10-21",
    webOrigin: read("WEB_ORIGIN") || "http://localhost:5173",
    mockStaffPassword: read("MOCK_STAFF_PASSWORD") || "ristonchi-demo",
    port: Number(read("PORT") || "8787"),
  };
}

function mode<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unsupported mode "${value}". Expected ${allowed.join(" or ")}.`);
}
