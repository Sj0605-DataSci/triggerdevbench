const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;

if (!SECRET_KEY) {
  throw new Error("TRIGGER_SECRET_KEY env var is required");
}

function headers() {
  return {
    Authorization: `Bearer ${SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

// Tracks every 429 hit so evals can report real rate-limit behavior instead
// of treating it as harness noise.
export const rateLimitEvents = [];

async function fetchWithRateLimitRetry(url, fetchOpts, { maxRetries = 5, context = "" } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, fetchOpts);
    if (res.status !== 429) return res;
    const body = await res.json().catch(() => ({}));
    const waitSeconds = body.secondsUntilReset ?? 2;
    rateLimitEvents.push({ context, attempt, waitSeconds, at: Date.now() });
    if (attempt === maxRetries) return res;
    await new Promise((r) => setTimeout(r, Math.min(waitSeconds * 1000 + 200, 15_000)));
  }
}

export async function triggerTask(taskId, payload, options = {}) {
  const body = { payload };
  if (Object.keys(options).length > 0) body.options = options;
  const res = await fetchWithRateLimitRetry(
    `${API_URL}/api/v1/tasks/${taskId}/trigger`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) },
    { context: `trigger:${taskId}` }
  );
  if (!res.ok) {
    throw new Error(`Trigger failed for ${taskId}: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { id, isCached }
}

export async function batchTrigger(items) {
  const res = await fetchWithRateLimitRetry(
    `${API_URL}/api/v1/tasks/batch`,
    { method: "POST", headers: headers(), body: JSON.stringify({ items }) },
    { context: "batchTrigger" }
  );
  if (!res.ok) {
    throw new Error(`Batch trigger failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getRun(runId, { allow404 = false } = {}) {
  const res = await fetchWithRateLimitRetry(
    `${API_URL}/api/v3/runs/${runId}`,
    { headers: headers() },
    { context: "getRun" }
  );
  if (res.status === 404 && allow404) return null;
  if (!res.ok) {
    throw new Error(`getRun failed for ${runId}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function waitForRun(runId, { timeoutMs = 60_000, pollMs = 750, notFoundGraceMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const notFoundDeadline = Date.now() + notFoundGraceMs;
  const terminal = new Set(["COMPLETED", "FAILED", "CANCELED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT"]);
  let sawNotFound = false;
  while (Date.now() < deadline) {
    const run = await getRun(runId, { allow404: Date.now() < notFoundDeadline });
    if (run === null) {
      sawNotFound = true;
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }
    if (terminal.has(run.status)) {
      run._sawTransient404 = sawNotFound;
      return run;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for run ${runId} after ${timeoutMs}ms`);
}

export async function waitForRuns(runIds, opts) {
  return Promise.all(runIds.map((id) => waitForRun(id, opts)));
}

export async function nemotronJudge(question) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nemotron-mini",
      prompt: `${question}\n\nRespond with strict JSON only: {"pass": true|false, "reason": "..."}`,
      stream: false,
      format: "json",
    }),
  });
  if (!res.ok) throw new Error(`Ollama judge call failed: ${res.status}`);
  const data = await res.json();
  try {
    return JSON.parse(data.response);
  } catch {
    return { pass: false, reason: `Judge returned non-JSON: ${data.response}` };
  }
}

export function fmtMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export async function replayRun(runId) {
  const res = await fetchWithRateLimitRetry(
    `${API_URL}/api/v1/runs/${runId}/replay`,
    { method: "POST", headers: headers() },
    { context: "replayRun" }
  );
  if (!res.ok) {
    throw new Error(`Replay failed for ${runId}: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { id }
}

// Per "Beyond pass@1: A Reliability Science Framework for Long-Horizon LLM
// Agents" (2026) -- a single pass/fail on a crash/cancel/race-condition eval
// is close to meaningless; failures in these categories are often
// probabilistic (timing-dependent), so we report a success RATE across N
// independent trials instead of one boolean.
export async function runTrials(trialFn, n, { label = "trial" } = {}) {
  const outcomes = [];
  for (let i = 0; i < n; i++) {
    try {
      const result = await trialFn(i);
      outcomes.push({ trial: i, ok: !!result?.ok, detail: result });
    } catch (err) {
      outcomes.push({ trial: i, ok: false, detail: { error: err.message } });
    }
  }
  const successes = outcomes.filter((o) => o.ok).length;
  return {
    successRate: successes / n,
    successes,
    total: n,
    outcomes,
    summary: `${successes}/${n} ${label} trials succeeded (${((successes / n) * 100).toFixed(0)}%)`,
  };
}
