import { task } from "@trigger.dev/sdk";

// Simulates a side effect with an in-memory counter keyed by idempotencyKey.
// Eval 09: fire the same idempotency key N times concurrently, expect exactly one execution.
const sideEffectCounts = new Map<string, number>();

export const idempotencySideEffect = task({
  id: "eval-09-idempotency-side-effect",
  run: async (payload: { dedupeKey: string }) => {
    const count = (sideEffectCounts.get(payload.dedupeKey) ?? 0) + 1;
    sideEffectCounts.set(payload.dedupeKey, count);
    await new Promise((r) => setTimeout(r, 200));
    return { dedupeKey: payload.dedupeKey, executionCount: count };
  },
});
