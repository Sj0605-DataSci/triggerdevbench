import { task, queue } from "@trigger.dev/sdk";

// Eval 24: idempotency key collision with DIFFERENT payloads. The platform
// only dedupes on the key, not the payload — fire the SAME idempotencyKey
// with two DIFFERENT payloads concurrently and see which one silently wins.
// This is a data-integrity risk if a caller assumes payload is also checked.
export const idempotencyPayloadEcho = task({
  id: "eval-24-idempotency-payload-echo",
  run: async (payload: { variant: string }) => {
    return { variant: payload.variant };
  },
});

// Eval 25: cancel-mid-execution — does cancel actually stop work, or just
// flip a status flag while the task keeps running to completion server-side?
export const cancelableLongTask = task({
  id: "eval-25-cancelable-long-task",
  run: async (payload: { totalSteps: number; stepMs: number }, { signal }) => {
    let stepsCompleted = 0;
    for (let i = 0; i < payload.totalSteps; i++) {
      if (signal?.aborted) {
        return { stepsCompleted, aborted: true };
      }
      await new Promise((r) => setTimeout(r, payload.stepMs));
      stepsCompleted++;
    }
    return { stepsCompleted, aborted: false };
  },
});

// Eval 26: deep serial queue chain — many hogs on a concurrencyLimit=1 queue,
// checking the LAST item's real end-to-end tail latency (not just "does it
// eventually finish"). This is expected FIFO behavior, but the tail latency
// number itself is the SLA-relevant finding.
export const serialQueue = queue({ name: "eval-26-serial-queue", concurrencyLimit: 1 });

export const serialQueueItem = task({
  id: "eval-26-serial-queue-item",
  queue: serialQueue,
  run: async (payload: { index: number; holdMs: number }) => {
    await new Promise((r) => setTimeout(r, payload.holdMs));
    return { index: payload.index, finishedAt: Date.now() };
  },
});

// Eval 27: worker crash mid-execution — a task that we will kill the dev
// server out from under while it's mid-sleep, to see whether the run ends up
// in a sane terminal-failure state or wedged in EXECUTING forever (matches
// the self-hosted "runs stuck indefinitely" pattern).
export const longSleepTask = task({
  id: "eval-27-long-sleep-for-crash-test",
  run: async (payload: { sleepMs: number }) => {
    await new Promise((r) => setTimeout(r, payload.sleepMs));
    return { completed: true };
  },
});

// Eval 28: malformed/oversized payload handling.
export const payloadEcho = task({
  id: "eval-28-payload-echo",
  run: async (payload: { data: string }) => {
    return { receivedLength: payload.data.length };
  },
});
