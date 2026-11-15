import { MockAuth } from "./auth/mock";
import { PlatformAuth } from "./auth/platform";
import type { AuthAdapter } from "./auth/types";
import type { AppConfig } from "./config";
import { MockLlm } from "./llm/mock";
import { OpenAiCompatibleProvider } from "./llm/openai";
import type { LlmProvider } from "./llm/types";
import { McpPlatform } from "./platform/mcp";
import { MockPlatform } from "./platform/mock";
import type { PlatformAdapter } from "./platform/types";
import type { Store } from "./store/types";

export type Services = {
  auth: AuthAdapter;
  platform: PlatformAdapter;
  llm: LlmProvider;
};

export function composeServices(config: AppConfig, store: Store): Services {
  const auth =
    config.authMode === "platform"
      ? new PlatformAuth(config.platformAuthUrl)
      : new MockAuth(store, config.mockStaffPassword);
  const platform =
    config.platformMode === "mcp" ? new McpPlatform(config.platformMcpUrl) : new MockPlatform();
  const llm = createLlm(config);
  return { auth, platform, llm };
}

function createLlm(config: AppConfig): LlmProvider {
  if (config.llmProvider === "mock") return new MockLlm();
  if (config.llmProvider === "azure") {
    if (!config.azureEndpoint || !config.azureDeployment || !config.azureApiKey) {
      throw new Error(
        "Azure OpenAI needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT, and AZURE_OPENAI_API_KEY.",
      );
    }
    return new OpenAiCompatibleProvider({
      apiKey: config.azureApiKey,
      baseUrl: config.azureEndpoint,
      model: config.azureDeployment,
      azure: {
        endpoint: config.azureEndpoint,
        deployment: config.azureDeployment,
        apiVersion: config.azureApiVersion,
        apiKey: config.azureApiKey,
      },
    });
  }
  if (!config.llmApiKey) throw new Error("LLM_API_KEY is required when LLM_PROVIDER is openai.");
  return new OpenAiCompatibleProvider({
    apiKey: config.llmApiKey,
    baseUrl: config.llmBaseUrl,
    model: config.llmModel,
  });
}
