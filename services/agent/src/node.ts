import { serve } from "@hono/node-server";
import { loadEnvFile } from "./env-file";
import { createApp } from "./app";
import { configFromEnv } from "./config";
import { composeServices } from "./compose";
import { log } from "./log";
import { MemoryStore } from "./store/memory";

loadEnvFile(new URL("../../../.env", import.meta.url));

const config = configFromEnv(process.env);
const store = new MemoryStore();
const services = composeServices(config, store);
const app = createApp({ config, store, ...services });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log("info", "agent listening", {
    port: info.port,
    authMode: config.authMode,
    platformMode: config.platformMode,
    llmProvider: config.llmProvider,
  });
});
