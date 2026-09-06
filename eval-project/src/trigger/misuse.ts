import { task } from "@trigger.dev/sdk";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Eval 11: non-idempotent misuse — a task with a real side effect (simulated
// "send email") that has NO idempotency key set by the caller. When the
// platform retries it after a forced transient failure, the side effect
// fires again. This documents the footgun (matches the r/nextjs idempotency
// discussion) rather than "fixing" it — the platform gives you idempotency
// keys, but nothing forces you to use them.
//
// Uses a file (not in-memory state) because each retry attempt runs in a
// fresh module instance in dev mode (confirmed separately in eval-10) — an
// in-memory counter would silently reset every attempt and always read 1.
const LOG_DIR = path.join(tmpdir(), "trigger-eval-misuse");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

export const nonIdempotentEmailSend = task({
  id: "eval-11-non-idempotent-side-effect",
  retry: { maxAttempts: 3, minTimeoutInMs: 200, maxTimeoutInMs: 500, factor: 2 },
  run: async (payload: { recipient: string; failOnAttempt: number }, { ctx }) => {
    const logFile = path.join(LOG_DIR, `${payload.recipient}.log`);
    appendFileSync(logFile, `attempt ${ctx.attempt.number}\n`);
    if (ctx.attempt.number === payload.failOnAttempt) {
      throw new Error("Simulated transient failure AFTER side effect already fired");
    }
    const sentCount = existsSync(logFile) ? readFileSync(logFile, "utf-8").trim().split("\n").length : 0;
    return { sentCount };
  },
});
