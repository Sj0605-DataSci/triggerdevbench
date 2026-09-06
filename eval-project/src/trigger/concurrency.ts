import { task, queue } from "@trigger.dev/sdk";

// Eval 01: wildcard-concurrency-key starvation.
// One "hot" run holds the queue with a long sleep under a shared queue; the
// harness fires several unrelated-key runs on the same queue right after and
// checks whether they get starved behind the hot one.
export const sharedQueue = queue({
  name: "eval-01-shared-queue",
  concurrencyLimit: 1,
});

export const queueHog = task({
  id: "eval-01-queue-hog",
  queue: sharedQueue,
  run: async (payload: { holdMs: number; label: string }) => {
    await new Promise((r) => setTimeout(r, payload.holdMs));
    return { label: payload.label, finishedAt: Date.now() };
  },
});

export const queueQuickRun = task({
  id: "eval-01-queue-quick-run",
  queue: sharedQueue,
  run: async (payload: { label: string }) => {
    return { label: payload.label, finishedAt: Date.now() };
  },
});
