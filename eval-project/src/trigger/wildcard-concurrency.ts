import { task, queue } from "@trigger.dev/sdk";

// Eval 02: wildcard concurrency key — one run triggered with concurrencyKey
// "*" should NOT be able to stall unrelated concurrencyKeys on the same
// queue (fixed bug per Trigger.dev changelog; verifying it stays fixed).
export const wildcardQueue = queue({
  name: "eval-02-wildcard-queue",
  concurrencyLimit: 3,
});

export const wildcardKeyTask = task({
  id: "eval-02-wildcard-key-task",
  queue: wildcardQueue,
  run: async (payload: { label: string; holdMs: number }) => {
    await new Promise((r) => setTimeout(r, payload.holdMs));
    return { label: payload.label, finishedAt: Date.now() };
  },
});
