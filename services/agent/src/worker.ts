import { createApp } from "./app";
import { configFromEnv } from "./config";
import { composeServices } from "./compose";
import { KvStore, type KvBinding } from "./store/kv";
import { MemoryStore } from "./store/memory";
import type { Store } from "./store/types";

export interface WorkerEnv {
  AUTH_MODE?: string;
  PLATFORM_MODE?: string;
  LLM_PROVIDER?: string;
  PLATFORM_MCP_URL?: string;
  PLATFORM_AUTH_URL?: string;
  WEB_ORIGIN?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  AZURE_OPENAI_ENDPOINT?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_DEPLOYMENT?: string;
  AZURE_OPENAI_API_VERSION?: string;
  MOCK_STAFF_PASSWORD?: string;
  PORT?: string;
  AUDIT_KV?: KvBinding;
}

let memory: MemoryStore | undefined;

function storeFor(env: WorkerEnv): Store {
  if (env.AUDIT_KV) return new KvStore(env.AUDIT_KV);
  memory ??= new MemoryStore();
  return memory;
}

const worker = {
  fetch(request: Request, env: WorkerEnv): Response | Promise<Response> {
    const config = configFromEnv(env);
    const store = storeFor(env);
    const services = composeServices(config, store);
    return createApp({ config, store, ...services }).fetch(request);
  },
};

export default worker;
