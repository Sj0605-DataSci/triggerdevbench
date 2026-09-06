import { task, queue, wait } from "@trigger.dev/sdk";

// Eval: self-hosted Docker has "no checkpoint support" per docs/self-hosting/docker.mdx
// ("This was only ever experimental when self-hosting... caused a bunch of
// issues"). Per docs/self-hosting/overview.mdx, Cloud's checkpoints give
// "non-blocking waits, less resource usage" -- implying self-hosted waits ARE
// blocking: a wait.for() should hold its concurrency slot for its full
// duration instead of freeing it via CRIU checkpoint. This queue has a tight
// concurrencyLimit so we can measure whether that's really true.
export const checkpointTestQueue = queue({
  name: "eval-53-checkpoint-limitation-queue",
  concurrencyLimit: 2,
});

export const blockingWaitTask = task({
  id: "eval-53-blocking-wait-task",
  queue: checkpointTestQueue,
  run: async (payload: { index: number; waitSeconds: number }) => {
    const startedAt = Date.now();
    await wait.for({ seconds: payload.waitSeconds });
    return { index: payload.index, startedAt, finishedAt: Date.now() };
  },
});
