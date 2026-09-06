# task-04 — Does the platform notice when the worker just dies?

## What this task is

The black-box counterpart to Trigger.dev's own internal chaos-testing suite.
`internal-packages/run-engine/src/engine/tests/snapshotStoreChaos.test.ts` injects
faults in-process at three named write boundaries (`afterPgBeforeRedis`,
`afterRedisBirthBeforePg`, `midFlushRetry`) and is validated against a TLA+ model
— genuinely rigorous, but only reachable from inside their own test suite via a
test-only fault-injection seam. This task asks the same category of question
("does a crash converge to a correct state without hanging") from outside, via a
real `SIGKILL` against the actual running deployment — the failure mode a
customer's infrastructure will actually produce, which no unit test can reach.

## What we expect the platform to do

Resolve the run to a terminal failure state within its documented heartbeat
timeout for an executing run (`RUN_ENGINE_TIMEOUT_EXECUTING`, 5 minutes by
default), without requiring the original worker — or any worker — to ever
reconnect and report back.

## What we found

**It works as claimed.** We triggered a 30-second task, confirmed `EXECUTING`
via the API, then `SIGKILL`ed the entire dev-server process tree (main CLI,
devWatchdog, esbuild service — verified zero surviving processes, so this also
rules out the orphaned-child-process pattern from GitHub #2909 for this
scenario) 7 seconds into execution. We deliberately did not restart the worker.

The run resolved to `status: CANCELED`, `error: "trigger.dev internal error
(TASK_RUN_STALLED_EXECUTING)"` at **exactly 300.0 seconds** after it started
executing (`finishedAt` − `startedAt` = 300.000s to the millisecond) — precisely
matching `RUN_ENGINE_TIMEOUT_EXECUTING`'s default. The platform's server-side
heartbeat sweep detected the stall entirely on its own.

## Why it matters

This is worth stating plainly: the platform's core crash-recovery claim holds
under a real, adversarial, black-box test. This task exists in the same suite as
task-01 (confirmed stuck run) specifically so the benchmark's overall picture
stays honest in both directions — a benchmark that only reports failures isn't
trustworthy either.

## Pass condition

See `tests/`. Terminal status must be observed within
`RUN_ENGINE_TIMEOUT_EXECUTING + 60s` of the kill, entirely without a worker
reconnecting during the observation window.
