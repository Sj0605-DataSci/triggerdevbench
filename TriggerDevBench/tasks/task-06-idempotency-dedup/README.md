# task-06 — Does idempotencyKey hold under a true concurrent race?

## What this task is

Many idempotency-key implementations work fine for sequential duplicate calls
but leak under a genuine race (two requests hitting the dedup check before
either has written its result). This task fires 5 truly concurrent triggers
with the same key, not 5 sequential ones, to probe for that specific gap.

## What we expect

Exactly one run is created; the task body executes exactly once.

## What we found

Holds. 5 concurrent triggers with the same `idempotencyKey` collapsed to 1
unique run id, and the task's execution counter (file-based, since in-memory
state doesn't survive across a run's lifecycle reliably — see task-02's
methodology) confirmed exactly 1 execution. Server logs show this is
implemented as a Postgres unique constraint on `(runtimeEnvironmentId,
taskIdentifier, idempotencyKey)` — the losing concurrent inserts fail with a
caught, `ignoreError: true` Prisma error rather than a race condition in
application logic, which is the right way to implement this guarantee.

## Pass condition

See `tests/`. Exactly 1 unique run id and `executionCount === 1` across all 5
triggers.
