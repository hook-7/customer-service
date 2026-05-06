import { getHermesConfig, hermesEnvDebug } from "./hermes.config.server.ts";

type HermesResponseContent = {
  type?: string;
  text?: string;
};

type HermesOutputItem = {
  type?: string;
  role?: string;
  content?: HermesResponseContent[];
};

type HermesResponse = {
  output_text?: string;
  output?: HermesOutputItem[];
};

export type HermesLoadTestOptions = {
  input: string;
  instructions?: string;
  totalRequests?: number;
  concurrency?: number;
  sharedConversation?: boolean;
  conversationPrefix?: string;
  model?: string;
  timeoutMs?: number;
  store?: boolean;
};

export type HermesLoadTestResult = {
  index: number;
  ok: boolean;
  status: number;
  latencyMs: number;
  conversation: string;
  outputText?: string;
  error?: string;
};

export type HermesLoadTestSummary = {
  total: number;
  ok: number;
  failed: number;
  successRate: number;
  latencyMs: {
    min: number;
    avg: number;
    max: number;
    p95: number;
  };
};

export type HermesLoadTestReport = {
  config: {
    baseUrl: string;
    model: string;
    totalRequests: number;
    concurrency: number;
    sharedConversation: boolean;
    conversationPrefix: string;
    timeoutMs: number;
    store: boolean;
  };
  results: HermesLoadTestResult[];
  summary: HermesLoadTestSummary;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function extractText(data: HermesResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of data.output || []) {
    if (item.type !== "message" && item.role !== "assistant") continue;
    for (const content of item.content || []) {
      if (typeof content.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function percentile(sortedValues: number[], ratio: number) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index] || 0;
}

function cleanConversationPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function buildConversationKey(prefix: string, index: number, sharedConversation: boolean) {
  const base = cleanConversationPart(prefix) || "hermes-load-test";
  return sharedConversation ? base : `${base}-${index + 1}`;
}

async function runWorker<T>(queue: number[], worker: (item: number) => Promise<T>) {
  const results: T[] = [];
  for (;;) {
    const next = queue.shift();
    if (typeof next !== "number") return results;
    results.push(await worker(next));
  }
}

export function buildHermesLoadTestSummary(results: HermesLoadTestResult[]): HermesLoadTestSummary {
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const ok = results.filter((result) => result.ok).length;
  const total = results.length;
  const failed = total - ok;
  const avg = total ? round2(latencies.reduce((sum, value) => sum + value, 0) / total) : 0;

  return {
    total,
    ok,
    failed,
    successRate: total ? round2((ok / total) * 100) : 0,
    latencyMs: {
      min: latencies[0] || 0,
      avg,
      max: latencies[latencies.length - 1] || 0,
      p95: percentile(latencies, 0.95),
    },
  };
}

export async function runHermesLoadTest(
  options: HermesLoadTestOptions,
): Promise<HermesLoadTestReport> {
  const cfg = getHermesConfig();
  if (!cfg) {
    throw new Error(`Hermes API is not configured: ${JSON.stringify(hermesEnvDebug())}`);
  }

  const totalRequests = Math.max(1, Math.floor(options.totalRequests || 10));
  const concurrency = Math.max(1, Math.min(totalRequests, Math.floor(options.concurrency || 5)));
  const sharedConversation = options.sharedConversation ?? false;
  const conversationPrefix = cleanConversationPart(
    options.conversationPrefix || `hermes-load-test-${Date.now()}`,
  );
  const timeoutMs = Math.max(1000, Math.floor(options.timeoutMs || cfg.timeoutMs));
  const store = options.store ?? false;

  const queue = Array.from({ length: totalRequests }, (_, index) => index);

  const worker = async (index: number): Promise<HermesLoadTestResult> => {
    const conversation = buildConversationKey(conversationPrefix, index, sharedConversation);
    const startedAt = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${cfg.baseUrl}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model || cfg.model,
            conversation,
            input: options.input,
            instructions: options.instructions,
            store,
          }),
          signal: controller.signal,
        });
        const raw = await res.text();
        const latencyMs = Date.now() - startedAt;

        if (!res.ok) {
          return {
            index,
            ok: false,
            status: res.status,
            latencyMs,
            conversation,
            error: raw.slice(0, 500),
          };
        }

        let outputText = raw;
        try {
          outputText = extractText(JSON.parse(raw) as HermesResponse) || raw;
        } catch {
          outputText = raw;
        }

        return {
          index,
          ok: true,
          status: res.status,
          latencyMs,
          conversation,
          outputText,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      return {
        index,
        ok: false,
        status: 0,
        latencyMs: Date.now() - startedAt,
        conversation,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const workers = Array.from({ length: concurrency }, () => {
    const slice: number[] = [];
    while (queue.length > 0 && slice.length < Math.ceil(totalRequests / concurrency)) {
      const next = queue.shift();
      if (typeof next === "number") slice.push(next);
    }
    return slice;
  }).filter((slice) => slice.length > 0);

  const nestedResults = await Promise.all(workers.map((items) => runWorker(items, worker)));
  const results = nestedResults.flat().sort((a, b) => a.index - b.index);
  const summary = buildHermesLoadTestSummary(results);

  return {
    config: {
      baseUrl: cfg.baseUrl,
      model: options.model || cfg.model,
      totalRequests,
      concurrency,
      sharedConversation,
      conversationPrefix,
      timeoutMs,
      store,
    },
    results,
    summary,
  };
}

export function formatHermesLoadTestReport(report: HermesLoadTestReport) {
  const lines = [
    "Hermes concurrency test",
    `baseUrl: ${report.config.baseUrl}`,
    `model: ${report.config.model}`,
    `requests: ${report.config.totalRequests}`,
    `concurrency: ${report.config.concurrency}`,
    `sharedConversation: ${report.config.sharedConversation}`,
    `conversationPrefix: ${report.config.conversationPrefix}`,
    `success: ${report.summary.ok}/${report.summary.total} (${report.summary.successRate}%)`,
    `latencyMs: min=${report.summary.latencyMs.min} avg=${report.summary.latencyMs.avg} p95=${report.summary.latencyMs.p95} max=${report.summary.latencyMs.max}`,
  ];

  const failures = report.results.filter((result) => !result.ok).slice(0, 5);
  if (failures.length) {
    lines.push("failures:");
    for (const failure of failures) {
      lines.push(
        `  #${failure.index + 1} status=${failure.status} conversation=${failure.conversation} error=${failure.error || "unknown"}`,
      );
    }
  }

  return lines.join("\n");
}
