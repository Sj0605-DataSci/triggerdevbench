import { task, wait } from "@trigger.dev/sdk";

// Eval 14: wait/FROZEN state handling — task calls wait.for() and the harness
// checks the run correctly reports a WAITING/FROZEN-ish status mid-flight and
// then COMPLETED after the wait elapses (docs gap around FROZEN caused a real
// prod bug per GitHub #2279).
export const waitingTask = task({
  id: "eval-14-wait-for-state",
  run: async (payload: { waitSeconds: number }) => {
    const before = Date.now();
    await wait.for({ seconds: payload.waitSeconds });
    return { waitedMs: Date.now() - before };
  },
});
