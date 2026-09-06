import { randomUUID } from "node:crypto";
import { triggerTask, batchTrigger, getRun, waitForRun, waitForRuns, nemotronJudge, fmtMs, rateLimitEvents, replayRun, runTrials } from "./lib.mjs";

// Each eval returns { id, category, pass, reason, detail }

export async function evalIdempotencyDedup() {
  const id = "eval-09-idempotency-dedup";
  const key = `dedupe-${randomUUID()}`;
  const dedupeKey = `payload-${randomUUID()}`;

  // Fire the same idempotencyKey 5 times concurrently.
  const triggers = await Promise.all(
    Array.from({ length: 5 }, () =>
      triggerTask("eval-09-idempotency-side-effect", { dedupeKey }, { idempotencyKey: key })
    )
  );
  const uniqueRunIds = new Set(triggers.map((t) => t.id));
  const runs = await waitForRuns([...uniqueRunIds], { timeoutMs: 15_000 });
  const completed = runs.filter((r) => r.status === "COMPLETED");
  const executionCounts = completed.map((r) => r.output?.executionCount).filter(Boolean);
  const maxExecutionCount = Math.max(0, ...executionCounts);

  const pass = uniqueRunIds.size === 1 && maxExecutionCount === 1;
  return {
    id,
    category: "idempotency",
    pass,
    reason: pass
      ? "5 concurrent triggers with same idempotencyKey collapsed to 1 run, 1 execution"
      : `Expected 1 unique run/execution, got ${uniqueRunIds.size} runs, max executionCount=${maxExecutionCount}`,
    detail: { uniqueRunCount: uniqueRunIds.size, executionCounts },
  };
}

export async function evalRetryBackoff() {
  const id = "eval-10-retry-backoff";
  const runKey = `retry-${randomUUID()}`;
  const failFirstNAttempts = 3;
  const { id: runId } = await triggerTask("eval-10-retry-backoff", {
    runKey,
    failFirstNAttempts,
  });
  const run = await waitForRun(runId, { timeoutMs: 30_000 });
  // Note: task-local in-memory state resets between attempts in dev mode (each
  // retry is a fresh module load), so we can't measure per-attempt timestamps
  // from inside the task. Instead, use wall-clock createdAt->finishedAt, which
  // includes the queued backoff delays between attempts (minTimeoutInMs=1000,
  // factor=2 -> minimum ~1000+2000+4000=7000ms for 3 retries before success).
  const wallMs = new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime();
  const expectedMinMs = [1000, 2000, 4000].slice(0, failFirstNAttempts).reduce((a, b) => a + b, 0);
  const pass = run.status === "COMPLETED" && run.attemptCount === failFirstNAttempts + 1 && wallMs >= expectedMinMs * 0.5;
  return {
    id,
    category: "retries",
    pass,
    reason: pass
      ? `Succeeded on attempt ${run.attemptCount} after ${failFirstNAttempts} forced failures; wall time ${fmtMs(wallMs)} consistent with exponential backoff (min expected ~${fmtMs(expectedMinMs)})`
      : `status=${run.status}, attemptCount=${run.attemptCount} (expected ${failFirstNAttempts + 1}), wallMs=${wallMs} (expected >= ${expectedMinMs * 0.5})`,
    detail: { wallMs, expectedMinMs, attemptCount: run.attemptCount, status: run.status },
  };
}

export async function evalQueueStarvation() {
  const id = "eval-01-queue-starvation";
  const hog = await triggerTask("eval-01-queue-hog", { holdMs: 8000, label: "hog" });
  // Fire 3 quick unrelated runs on the SAME queue right after.
  const quicks = await Promise.all(
    ["a", "b", "c"].map((label) => triggerTask("eval-01-queue-quick-run", { label }))
  );
  const start = Date.now();
  const quickRuns = await waitForRuns(
    quicks.map((q) => q.id),
    { timeoutMs: 20_000 }
  );
  const maxWaitMs = Math.max(...quickRuns.map((r) => Date.now() - start));
  // With concurrencyLimit=1 on a shared queue, quick runs are EXPECTED to queue
  // behind the hog (that's correct FIFO behavior, not starvation). Flag it only
  // if a quick run takes wildly longer than the hog's holdMs would explain.
  const pass = quickRuns.every((r) => r.status === "COMPLETED") && maxWaitMs < 8000 + 5000;
  await waitForRun(hog.id, { timeoutMs: 15_000 }).catch(() => {});
  return {
    id,
    category: "concurrency",
    pass,
    reason: pass
      ? `Quick runs completed within ${fmtMs(maxWaitMs)} of the hog holding the queue (expected FIFO delay, no starvation)`
      : `Quick runs took ${fmtMs(maxWaitMs)}, exceeding expected FIFO queueing behind an 8s hog`,
    detail: { maxWaitMs, statuses: quickRuns.map((r) => r.status) },
  };
}

export async function evalBatchIngestion() {
  const id = "eval-21-batch-ingestion";
  const N = 50;
  const items = Array.from({ length: N }, (_, i) => ({
    task: "eval-21-batch-item",
    payload: { index: i },
  }));
  const { runs } = await batchTrigger(items);
  const results = await waitForRuns(
    runs.map((r) => r.id),
    { timeoutMs: 30_000 }
  );
  const completed = results.filter((r) => r.status === "COMPLETED");
  const indices = new Set(completed.map((r) => r.output?.index));
  const correctSquares = completed.every((r) => r.output?.squared === r.output?.index ** 2);
  const transientCount = results.filter((r) => r._sawTransient404).length;
  const pass = completed.length === N && indices.size === N && correctSquares;
  const note =
    transientCount > 0
      ? ` (NOTE: ${transientCount}/${N} runs briefly 404'd on GET /runs/{id} right after batch trigger before becoming queryable — eventual-consistency window, not data loss)`
      : "";
  return {
    id,
    category: "batch",
    pass,
    reason:
      (pass
        ? `All ${N} batch items completed with correct, unique output (no data loss)`
        : `${completed.length}/${N} completed, ${indices.size} unique indices, correctSquares=${correctSquares}`) + note,
    detail: { completed: completed.length, total: N, uniqueIndices: indices.size, transientCount },
  };
}

export async function evalLongRunningAgent() {
  const id = "eval-22-long-running-agent-no-timeout";
  const { id: runId } = await triggerTask("eval-22-long-running-agent", {
    steps: 5,
    delayBetweenStepsMs: 1000,
  });
  const start = Date.now();
  const run = await waitForRun(runId, { timeoutMs: 300_000, pollMs: 2000 });
  const elapsedMs = Date.now() - start;
  const pass = run.status === "COMPLETED" && run.output?.totalSteps === 5;
  return {
    id,
    category: "ai-agent",
    pass,
    reason: pass
      ? `5-step Nemotron-backed agent loop completed in ${fmtMs(elapsedMs)}, no platform timeout hit`
      : `status=${run.status} after ${fmtMs(elapsedMs)}`,
    detail: { elapsedMs, status: run.status, stepResults: run.output?.stepResults },
  };
}

export async function evalNemotronJudgeSanityCheck() {
  const id = "misc-nemotron-judge-sanity";
  const verdict = await nemotronJudge(
    "A background job platform completed a task in 200ms with no errors. Is this a healthy result?"
  );
  const pass = typeof verdict.pass === "boolean";
  return {
    id,
    category: "misc",
    pass,
    reason: pass
      ? `Local judge model returned a well-formed verdict: ${JSON.stringify(verdict)}`
      : `Judge did not return valid structured output: ${JSON.stringify(verdict)}`,
    detail: verdict,
  };
}

export async function evalNonIdempotentMisuse() {
  const id = "eval-11-non-idempotent-misuse";
  const recipient = `user-${randomUUID()}@example.com`;
  // No idempotencyKey passed at all — the platform can't protect you here.
  const { id: runId } = await triggerTask("eval-11-non-idempotent-side-effect", {
    recipient,
    failOnAttempt: 1, // fail AFTER the side effect fires on attempt 1, forcing a retry
  });
  const run = await waitForRun(runId, { timeoutMs: 15_000 });
  const sentCount = run.output?.sentCount ?? 0;
  // This is expected/documented behavior, not a platform bug: without an
  // idempotency key, a side effect that fires before a retryable error WILL
  // duplicate. pass=true here means "confirmed the footgun exists as expected".
  const pass = run.status === "COMPLETED" && sentCount === 2;
  return {
    id,
    category: "idempotency-misuse",
    pass,
    reason: pass
      ? `CONFIRMED FOOTGUN: side effect fired ${sentCount}x across retries with no idempotencyKey set — this is expected platform behavior, but a real customer-education risk (matches r/nextjs idempotency discussion)`
      : `Expected the footgun to reproduce (sentCount=2), got sentCount=${sentCount}, status=${run.status}`,
    detail: { sentCount, status: run.status },
  };
}

export async function evalWaitForState() {
  const id = "eval-14-wait-for-state";
  const waitSeconds = 4;
  const { id: runId } = await triggerTask("eval-14-wait-for-state", { waitSeconds });
  const start = Date.now();
  const observedStatuses = new Set();
  let run;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    run = await getRun(runId);
    observedStatuses.add(run.status);
    if (["COMPLETED", "FAILED", "CANCELED", "CRASHED"].includes(run.status)) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const elapsedMs = Date.now() - start;
  const sawWaitingState = observedStatuses.has("WAITING") || observedStatuses.has("FROZEN");
  const timingOk = run.output?.waitedMs >= waitSeconds * 1000 * 0.9;
  const pass = run.status === "COMPLETED" && timingOk;
  return {
    id,
    category: "observability",
    pass,
    reason: pass
      ? `wait.for(${waitSeconds}s) completed correctly (waited ${fmtMs(run.output.waitedMs)}). ` +
        (sawWaitingState
          ? "Observed WAITING/FROZEN status mid-flight."
          : `NOTE: never observed WAITING/FROZEN status via polling (statuses seen: ${[...observedStatuses].join(", ")}) — short dev-mode waits may not checkpoint/expose an intermediate state, worth checking against docs' FROZEN-state description.`)
      : `status=${run.status}, waitedMs=${run.output?.waitedMs}, statuses seen=${[...observedStatuses].join(", ")}`,
    detail: { elapsedMs, observedStatuses: [...observedStatuses], waitedMs: run.output?.waitedMs },
  };
}

export async function evalWildcardConcurrencyKey() {
  const id = "eval-02-wildcard-concurrency-key";
  // One run with concurrencyKey "*" holding for a while, plus several runs on
  // distinct real keys on the SAME queue fired right after. None of the
  // distinct-key runs should be starved by the wildcard-key run.
  const hog = await triggerTask(
    "eval-02-wildcard-key-task",
    { label: "wildcard-hog", holdMs: 6000 },
    { concurrencyKey: "*" }
  );
  const others = await Promise.all(
    ["k1", "k2", "k3"].map((k) =>
      triggerTask("eval-02-wildcard-key-task", { label: k, holdMs: 200 }, { concurrencyKey: k })
    )
  );
  const start = Date.now();
  const otherRuns = await waitForRuns(
    others.map((o) => o.id),
    { timeoutMs: 15_000 }
  );
  const maxWaitMs = Math.max(...otherRuns.map(() => Date.now() - start));
  const pass = otherRuns.every((r) => r.status === "COMPLETED") && maxWaitMs < 4000;
  await waitForRun(hog.id, { timeoutMs: 12_000 }).catch(() => {});
  return {
    id,
    category: "concurrency",
    pass,
    reason: pass
      ? `Distinct-key runs completed in ${fmtMs(maxWaitMs)} while a wildcard-key ("*") run held the queue for 6s — no starvation`
      : `Distinct-key runs took ${fmtMs(maxWaitMs)} — wildcard key run appears to be blocking unrelated keys on the same queue`,
    detail: { maxWaitMs, statuses: otherRuns.map((r) => r.status) },
  };
}

export async function evalWebhookBurst() {
  const id = "eval-03-webhook-burst";
  const N = 100;
  const eventIds = Array.from({ length: N }, () => randomUUID());
  const rlBefore = rateLimitEvents.length;
  // Individual (non-batch) triggers fired as fast as possible, mimicking a
  // webhook fan-out burst rather than one batch call. triggerTask itself
  // retries on 429 with the server's Retry-After, same as a well-behaved
  // webhook sender (e.g. Stripe) would.
  const triggers = await Promise.all(
    eventIds.map((eventId, index) => triggerTask("eval-03-webhook-receiver", { eventId, index }))
  );
  const runs = await waitForRuns(
    triggers.map((t) => t.id),
    { timeoutMs: 60_000, notFoundGraceMs: 8000 }
  );
  const completed = runs.filter((r) => r.status === "COMPLETED");
  const receivedEventIds = new Set(completed.map((r) => r.output?.eventId));
  const missing = eventIds.filter((e) => !receivedEventIds.has(e));
  const rlHits = rateLimitEvents.length - rlBefore;
  const pass = missing.length === 0;
  const rlNote = rlHits > 0 ? ` (hit rate limiter ${rlHits}x during burst — a sender WITHOUT retry-on-429 logic would drop events here)` : "";
  return {
    id,
    category: "load",
    pass,
    reason:
      (pass
        ? `${N}/${N} webhook-style burst-triggered runs eventually completed, zero dropped`
        : `${missing.length}/${N} events never completed — data loss under burst load`) + rlNote,
    detail: { total: N, completed: completed.length, missing: missing.length, rateLimitHits: rlHits },
  };
}

export async function evalRealtimeUnderLoad() {
  const id = "eval-12-realtime-status-under-load";
  const N = 30;
  const rlBefore = rateLimitEvents.length;
  const triggers = await Promise.all(
    Array.from({ length: N }, (_, i) => triggerTask("eval-12-realtime-probe", { index: i, workMs: 500 }))
  );
  const runs = await waitForRuns(
    triggers.map((t) => t.id),
    { timeoutMs: 30_000 }
  );
  const completed = runs.filter((r) => r.status === "COMPLETED");
  const indices = new Set(completed.map((r) => r.output?.index));
  const rlHits = rateLimitEvents.length - rlBefore;
  // Proxy for "realtime/list completeness under load": every triggered run
  // must be independently queryable and correctly attributed post-hoc, since
  // this is what the dashboard's run-list/realtime views are built on top of
  // (matches the recurring "Runs list degraded" status-page incidents).
  const pass = completed.length === N && indices.size === N;
  return {
    id,
    category: "observability",
    pass,
    reason: pass
      ? `All ${N} concurrently-triggered runs independently queryable with correct, unique output under load${rlHits > 0 ? ` (rate-limited ${rlHits}x, absorbed by retry)` : ""}`
      : `${completed.length}/${N} completed, ${indices.size} unique — possible run-list/status attribution gaps under concurrency`,
    detail: { total: N, completed: completed.length, uniqueIndices: indices.size, rateLimitHits: rlHits },
  };
}

export async function evalUnknownTaskErrorClarity() {
  const id = "eval-08-deploy-drift-error-clarity";
  // Simulates the most common real-world Trigger.dev failure per their own
  // troubleshooting docs: calling a task identifier that doesn't exist on the
  // currently-running worker (e.g. after a rename, or a deploy that forgot to
  // include new task code).
  //
  // MAJOR FINDING (discovered, not hypothesized): the trigger call returns
  // HTTP 200 with a run id -- the caller gets a false-positive "success" at
  // trigger time. The run then sits in status "PENDING_VERSION" waiting for a
  // worker that will never register that task. This eval checks whether it
  // *eventually* resolves to a terminal failure (acceptable degraded UX: slow
  // but self-healing) or stays wedged forever past its own TTL (real stuck-run
  // bug matching the self-hosted "runs stuck indefinitely" GitHub/Reddit
  // pattern).
  const fakeTaskId = `eval-nonexistent-task-${randomUUID()}`;
  const res = await fetch(`${process.env.TRIGGER_API_URL}/api/v1/tasks/${fakeTaskId}/trigger`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: {} }),
  });
  const httpStatus = res.status;
  const body = await res.json().catch(() => ({}));
  const acceptedWithFakeSuccess = httpStatus === 200 && !!body.id;

  if (!acceptedWithFakeSuccess) {
    return {
      id,
      category: "deploy-drift",
      pass: true,
      reason: `Triggering a nonexistent task correctly failed fast: HTTP ${httpStatus}`,
      detail: { httpStatus, body },
    };
  }

  const runId = body.id;
  const initial = await getRun(runId);
  const ttlMs = /^(\d+)m$/.exec(initial.ttl ?? "")?.[1] * 60_000 || 10 * 60_000;
  const terminal = new Set(["FAILED", "CANCELED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT"]);

  let resolvedRun = null;
  const deadline = Date.now() + ttlMs + 60_000; // TTL + 60s grace
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (terminal.has(run.status)) {
      resolvedRun = run;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const pass = resolvedRun !== null;
  return {
    id,
    category: "deploy-drift",
    pass,
    reason: pass
      ? `Trigger call falsely returned HTTP 200 "success" for a nonexistent task (caller-visible bug), but the run self-healed to ${resolvedRun.status} after its TTL — degraded but not stuck forever`
      : `CONFIRMED STUCK RUN: trigger call returned HTTP 200 "success" for a nonexistent task, and the run NEVER resolved (still PENDING_VERSION) even ${ttlMs / 60000}+1min past its own TTL — matches the self-hosted "runs stuck indefinitely" failure pattern from GitHub issues`,
    detail: { httpStatus, runId, initialStatus: initial.status, ttl: initial.ttl, finalStatus: resolvedRun?.status ?? "still PENDING_VERSION" },
  };
}

export async function evalIdempotencyKeyPayloadCollision() {
  const id = "eval-24-idempotency-payload-collision";
  const key = `collision-${randomUUID()}`;
  // Fire the SAME idempotencyKey with two DIFFERENT payloads, truly
  // concurrently (no await between them). Correct/safe behavior would be to
  // either reject the second, or at minimum make it deterministic/documented
  // which payload wins. Silent, non-deterministic payload substitution is the
  // failure mode we're probing for.
  const [a, b] = await Promise.all([
    triggerTask("eval-24-idempotency-payload-echo", { variant: "A" }, { idempotencyKey: key }),
    triggerTask("eval-24-idempotency-payload-echo", { variant: "B" }, { idempotencyKey: key }),
  ]);
  const uniqueRunIds = new Set([a.id, b.id]);
  const run = await waitForRun([...uniqueRunIds][0], { timeoutMs: 15_000 });
  const wonVariant = run.payload?.variant;
  // We PASS if it collapsed to one run deterministically with SOME variant
  // (documented "first writer wins" semantics) -- we FAIL if it created two
  // separate runs (silently ignoring the idempotency key under a race) since
  // that breaks the exact guarantee the key is supposed to provide.
  const pass = uniqueRunIds.size === 1;
  return {
    id,
    category: "idempotency-edge-case",
    pass,
    reason: pass
      ? `Same idempotencyKey with racing different payloads (A vs B) correctly collapsed to 1 run (payload "${wonVariant}" won) -- deterministic dedup held under a true race`
      : `CONFIRMED RACE BUG: same idempotencyKey fired concurrently with different payloads produced ${uniqueRunIds.size} separate runs -- the idempotency guarantee does not hold under concurrent race conditions`,
    detail: { uniqueRunCount: uniqueRunIds.size, wonVariant, runIds: [a.id, b.id] },
  };
}

export async function evalCancelMidExecution() {
  const id = "eval-25-cancel-mid-execution";
  const totalSteps = 20;
  // Per "Beyond pass@1" (2026): a single cancel attempt tells you nothing
  // about whether the behavior is deterministic or timing-dependent. Run N
  // independent trials and report a success rate + whether cleanup (a
  // graceful `output`) ever happens, not just whether status says CANCELED.
  const trialResult = await runTrials(
    async (i) => {
      const { id: runId } = await triggerTask("eval-25-cancelable-long-task", { totalSteps, stepMs: 500 });
      await new Promise((r) => setTimeout(r, 2000));
      const cancelRes = await fetch(`${process.env.TRIGGER_API_URL}/api/v2/runs/${runId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.TRIGGER_SECRET_KEY}` },
      });
      const run = await waitForRun(runId, { timeoutMs: 20_000 });
      const gotGracefulOutput = run.output != null && typeof run.output.stepsCompleted === "number";
      const statusReflectsCancel = run.status === "CANCELED";
      return {
        ok: statusReflectsCancel, // "ok" here means "status correctly reflects cancellation"
        cancelOk: cancelRes.ok,
        status: run.status,
        gotGracefulOutput,
        rawOutput: run.output ?? null,
      };
    },
    5,
    { label: "cancel-mid-execution" }
  );
  const anyGraceful = trialResult.outcomes.some((o) => o.detail.gotGracefulOutput);
  // pass = status is reliably CANCELED across all trials. Separately (and
  // always reported) is whether cleanup ever gets a chance to run at all --
  // per Halfmoon's (SOSP'23) framing, that's the exactly-once/cleanup
  // guarantee question, distinct from "does the status say canceled."
  const pass = trialResult.successRate === 1;
  return {
    id,
    category: "cancellation",
    pass,
    reason: `${trialResult.summary} correctly reported CANCELED status. Across all ${trialResult.total} trials, graceful output (task's own signal.aborted cleanup path executing) was observed ${
      anyGraceful ? "at least once" : "ZERO times"
    } -- ${
      anyGraceful
        ? "cleanup code sometimes gets a chance to run."
        : "CONFIRMED: cancel is consistently a hard kill across repeated trials -- cooperative cleanup code never executes, not even occasionally."
    }`,
    detail: { ...trialResult, anyGraceful },
  };
}

export async function evalReplayDeterminism() {
  const id = "eval-51-replay-determinism";
  const label = `replay-${randomUUID()}`;
  const { id: originalRunId } = await triggerTask("eval-51-deterministic-computation", { seed: 42, label });
  const original = await waitForRun(originalRunId, { timeoutMs: 15_000 });

  const { id: replayedRunId } = await replayRun(originalRunId);
  const replayed = await waitForRun(replayedRunId, { timeoutMs: 15_000 });

  const sameOutput = original.output?.computedHash === replayed.output?.computedHash;
  const isNewRun = replayedRunId !== originalRunId;
  const actuallyReExecuted = replayed.output?.executionNumber === 2; // file-based counter proves a fresh execution, not a cached result
  const pass = original.status === "COMPLETED" && replayed.status === "COMPLETED" && sameOutput && isNewRun && actuallyReExecuted;
  return {
    id,
    category: "determinism",
    pass,
    reason: pass
      ? `Replay created a new run (${replayedRunId}) that genuinely re-executed (executionNumber=2) and reproduced identical output (hash=${replayed.output.computedHash}) -- deterministic replay holds for pure task logic`
      : `sameOutput=${sameOutput}, isNewRun=${isNewRun}, actuallyReExecuted=${actuallyReExecuted}, original.status=${original.status}, replayed.status=${replayed.status}`,
    detail: {
      originalRunId,
      replayedRunId,
      originalHash: original.output?.computedHash,
      replayedHash: replayed.output?.computedHash,
      executionNumber: replayed.output?.executionNumber,
    },
  };
}

export async function evalCrossStepCausalConsistency() {
  const id = "eval-52-cross-step-causal-consistency";
  const N = 20;
  const pairs = Array.from({ length: N }, (_, i) => ({
    key: `consistency-${randomUUID()}`,
    value: `value-${i}`,
  }));
  // Write, then IMMEDIATELY (no artificial delay) trigger the reader right
  // after the writer's run resolves -- this is the tightest window in which
  // a caching/consistency bug (per CausalMesh, VLDB'25) would show up.
  const results = await Promise.all(
    pairs.map(async ({ key, value }) => {
      const { id: writerRunId } = await triggerTask("eval-52-consistency-writer", { key, value });
      await waitForRun(writerRunId, { timeoutMs: 10_000 });
      const { id: readerRunId } = await triggerTask("eval-52-consistency-reader", { key, expectedValue: value });
      const readerRun = await waitForRun(readerRunId, { timeoutMs: 10_000 });
      return { key, value, found: readerRun.output?.found, matches: readerRun.output?.matches };
    })
  );
  const staleOrMissing = results.filter((r) => !r.found || !r.matches);
  const pass = staleOrMissing.length === 0;
  return {
    id,
    category: "consistency",
    pass,
    reason: pass
      ? `All ${N} writer->reader pairs saw fully consistent state immediately after write (expected on this single-node self-hosted topology -- no cross-machine cache to go stale; this eval would be far more interesting on a multi-node/clustered deployment)`
      : `${staleOrMissing.length}/${N} pairs saw stale or missing state right after a write completed -- unexpected even on a single-node topology`,
    detail: { total: N, staleOrMissing: staleOrMissing.length, examples: staleOrMissing.slice(0, 3) },
  };
}

export async function evalSerialQueueTailLatency() {
  const id = "eval-26-serial-queue-tail-latency";
  const N = 15;
  const holdMs = 2000;
  const start = Date.now();
  const triggers = await Promise.all(
    Array.from({ length: N }, (_, i) => triggerTask("eval-26-serial-queue-item", { index: i, holdMs }))
  );
  const runs = await waitForRuns(
    triggers.map((t) => t.id),
    { timeoutMs: (N + 5) * holdMs }
  );
  const lastFinish = Math.max(...runs.map((r) => new Date(r.finishedAt).getTime()));
  const tailLatencyMs = lastFinish - start;
  const theoreticalMinMs = N * holdMs;
  const overheadMs = tailLatencyMs - theoreticalMinMs;
  // This is realistic FIFO behavior, not a bug -- but a 15-item queue at 2s
  // each means a customer's 15th webhook waits ~30s minimum on a
  // concurrencyLimit=1 queue. FAIL if overhead beyond the theoretical minimum
  // is large enough to indicate real scheduling inefficiency on top of the
  // expected serialization cost.
  const pass = runs.every((r) => r.status === "COMPLETED") && overheadMs < theoreticalMinMs * 0.5;
  return {
    id,
    category: "concurrency",
    pass,
    reason: `${N}-item concurrencyLimit=1 queue: last item finished at ${fmtMs(tailLatencyMs)} (theoretical min ${fmtMs(
      theoreticalMinMs
    )}, scheduling overhead ${fmtMs(overheadMs)}). ${
      pass
        ? "Overhead within reasonable bounds -- but note the tail latency itself is a real SLA number to communicate to customers using shared concurrencyLimit=1 queues."
        : "SIGNIFICANT scheduling overhead beyond expected serialization cost -- queue throughput may be underperforming."
    }`,
    detail: { tailLatencyMs, theoreticalMinMs, overheadMs, N, holdMs },
  };
}

export async function evalOversizedPayload() {
  const id = "eval-28-oversized-payload";
  // 4MB string payload -- probes for a clean, documented rejection vs a
  // crash/hang/silent-truncation failure mode.
  const bigData = "x".repeat(4 * 1024 * 1024);
  let httpStatus = null;
  let errorText = "";
  let runResult = null;
  try {
    const { id: runId } = await triggerTask("eval-28-payload-echo", { data: bigData });
    runResult = await waitForRun(runId, { timeoutMs: 20_000 });
  } catch (err) {
    const match = /^Trigger failed for [^:]+: (\d+) (.*)$/s.exec(err.message);
    httpStatus = match ? Number(match[1]) : null;
    errorText = match ? match[2] : err.message;
  }
  // PASS if either: (a) it's cleanly rejected with a 4xx and clear message,
  // or (b) it succeeds and returns the FULL correct length (no silent
  // truncation). FAIL only on silent truncation/corruption or an
  // unhandled 5xx/hang.
  const cleanlyRejected = httpStatus !== null && httpStatus >= 400 && httpStatus < 500;
  const succeededIntact = runResult?.status === "COMPLETED" && runResult.output?.receivedLength === bigData.length;
  const pass = cleanlyRejected || succeededIntact;
  return {
    id,
    category: "edge-case",
    pass,
    reason: cleanlyRejected
      ? `4MB payload cleanly rejected: HTTP ${httpStatus} "${errorText.slice(0, 150)}"`
      : succeededIntact
        ? `4MB payload accepted and echoed back with correct length (${runResult.output.receivedLength} bytes) -- no truncation`
        : `4MB payload handling FAILED: httpStatus=${httpStatus}, runStatus=${runResult?.status}, receivedLength=${runResult?.output?.receivedLength} (expected ${bigData.length}) -- possible silent truncation/corruption or unhandled error`,
    detail: { httpStatus, payloadSize: bigData.length, receivedLength: runResult?.output?.receivedLength, runStatus: runResult?.status },
  };
}

export async function evalNaiveSenderBurst() {
  const id = "eval-29-naive-sender-burst-no-retry";
  const N = 200;
  const eventIds = Array.from({ length: N }, () => randomUUID());
  const API_URL = process.env.TRIGGER_API_URL;
  const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
  // Deliberately bypasses triggerTask's 429-retry wrapper: this simulates a
  // naive webhook sender (no backoff/retry logic) hammering the endpoint as
  // fast as possible, matching the exact r/selfhosted "webhook data loss
  // under high load" complaint.
  const results = await Promise.allSettled(
    eventIds.map(async (eventId, index) => {
      const res = await fetch(`${API_URL}/api/v1/tasks/eval-03-webhook-receiver/trigger`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { eventId, index } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
  );
  const accepted = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  // The failure mode we're checking for: does the platform drop/lose events
  // that get REJECTED at the door (naive sender never retries -> those are
  // gone for good), and how large is that permanently-lost fraction?
  const lossRate = rejected.length / N;
  const pass = lossRate === 0;
  return {
    id,
    category: "load",
    pass,
    reason: pass
      ? `All ${N} naive (non-retrying) burst-fired webhooks were accepted -- no permanent loss even without client-side retry logic`
      : `PERMANENT DATA LOSS under naive-sender burst: ${rejected.length}/${N} (${(lossRate * 100).toFixed(
          1
        )}%) webhooks were rejected at the door (mostly 429s) and, since this simulates a sender with NO retry logic, those events are gone forever. Real customers whose webhook senders (Stripe, etc.) don't aggressively retry on 429 will lose data under burst load on default self-hosted rate limits.`,
    detail: { total: N, accepted: accepted.length, rejected: rejected.length, lossRate },
  };
}

export const ALL_EVALS = [
  evalUnknownTaskErrorClarity, // run first, before any burst evals pollute rate-limit state
  evalIdempotencyDedup,
  evalRetryBackoff,
  evalQueueStarvation,
  evalNonIdempotentMisuse,
  evalWaitForState,
  evalWildcardConcurrencyKey,
  evalIdempotencyKeyPayloadCollision,
  evalCancelMidExecution,
  evalOversizedPayload,
  evalBatchIngestion,
  evalLongRunningAgent,
  evalNemotronJudgeSanityCheck,
  evalSerialQueueTailLatency,
  evalWebhookBurst,
  evalNaiveSenderBurst,
  evalRealtimeUnderLoad,
  evalReplayDeterminism,
  evalCrossStepCausalConsistency,
];
