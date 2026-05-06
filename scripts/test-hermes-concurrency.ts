#!/usr/bin/env node
import {
  formatHermesLoadTestReport,
  runHermesLoadTest,
} from "../app/services/hermes.load-test.server.ts";

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main() {
  const report = await runHermesLoadTest({
    input: readArg("input", "Reply with a short sentence proving this request completed."),
    instructions: readArg("instructions", undefined),
    totalRequests: Number(readArg("requests", "10")),
    concurrency: Number(readArg("concurrency", "5")),
    sharedConversation: hasFlag("shared-conversation"),
    conversationPrefix: readArg("conversation-prefix", `hermes-bench-${Date.now()}`),
    model: readArg("model", undefined),
    timeoutMs: Number(readArg("timeout-ms", "15000")),
    store: hasFlag("store"),
  });

  if (hasFlag("json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatHermesLoadTestReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
