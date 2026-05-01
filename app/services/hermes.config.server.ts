import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type HermesConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

let envFileCache: Record<string, string> | null = null;

function readLocalEnv(name: string) {
  if (!envFileCache) {
    envFileCache = {};
    const candidates = [
      resolve(process.cwd(), ".env"),
      process.env.INIT_CWD ? resolve(process.env.INIT_CWD, ".env") : "",
      resolve(process.cwd(), "..", ".env"),
      resolve(process.cwd(), "..", "..", ".env"),
    ].filter(Boolean);

    for (const path of candidates) {
      try {
        const raw = readFileSync(path, "utf8");
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index <= 0) continue;
          envFileCache[trimmed.slice(0, index)] = trimmed.slice(index + 1);
        }
        envFileCache.__ENV_FILE_PATH = path;
        break;
      } catch {
        // Try the next possible app root.
      }
    }
  }
  return envFileCache[name];
}

export function env(name: string) {
  return process.env[name]?.trim() || readLocalEnv(name)?.trim();
}

export function getHermesConfig(): HermesConfig | null {
  const apiHost = env("API_SERVER_HOST") || "127.0.0.1";
  const apiPort = env("API_SERVER_PORT") || "8642";
  const defaultBaseUrl = `http://${apiHost}:${apiPort}/v1`;
  const enabled = env("API_SERVER_ENABLED");
  const baseUrl = env("HERMES_BASE_URL") || defaultBaseUrl;
  const apiKey = env("HERMES_API_KEY") || env("API_SERVER_KEY");
  const model = env("HERMES_MODEL") || env("API_SERVER_MODEL_NAME") || "hermes-agent";
  const timeoutMs = Number(
    env("HERMES_TIMEOUT_MS") || env("API_SERVER_TIMEOUT_MS") || "15000",
  );

  if (enabled === "false" || !apiKey) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
  };
}

export function hermesEnvDebug() {
  return {
    cwd: process.cwd(),
    envFile: readLocalEnv("__ENV_FILE_PATH") || "not found",
    hasApiServerKey: Boolean(env("API_SERVER_KEY")),
    hasHermesApiKey: Boolean(env("HERMES_API_KEY")),
    host: env("API_SERVER_HOST") || "127.0.0.1",
    port: env("API_SERVER_PORT") || "8642",
    enabled: env("API_SERVER_ENABLED") || "unset",
  };
}
