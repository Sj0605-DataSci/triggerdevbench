import { task } from "@trigger.dev/sdk";

// Eval 10: force N transient failures, then succeed. Harness measures actual
// wall-clock gaps between attempts and checks they follow exponential backoff
// (minTimeoutInMs=1000, factor=2 from trigger.config.ts).
const attemptTimestamps = new Map<string, number[]>();

export const flakyTask = task({
  id: "eval-10-retry-backoff",
  retry: { maxAttempts: 5, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2 },
  run: async (payload: { runKey: string; failFirstNAttempts: number }, { ctx }) => {
    const times = attemptTimestamps.get(payload.runKey) ?? [];
    times.push(Date.now());
    attemptTimestamps.set(payload.runKey, times);

    const attemptNumber = ctx.attempt.number;
    if (attemptNumber <= payload.failFirstNAttempts) {
      throw new Error(`Intentional transient failure, attempt ${attemptNumber}`);
    }
    return { attemptNumber, attemptTimestamps: times };
  },
});
