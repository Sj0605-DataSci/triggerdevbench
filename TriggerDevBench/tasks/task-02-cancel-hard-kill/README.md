# task-02 — Does cancel give your cleanup code a chance to run?

## What this task is

Trigger.dev's SDK exposes a `signal` in the task's run context, documented as an
`AbortSignal` a task can check to cooperatively wind down when canceled. This task
tests whether that's actually true in practice, or whether cancel is a hard kill
that never gives the task's own code a chance to observe the signal.

## What we expect the platform to do

Either is a defensible design:

1. **Cooperative cancellation.** The task's code gets scheduled a chance to check
   `signal.aborted` and return a partial/cleanup result before the run is torn down.
2. **Documented hard-kill.** The platform kills the run immediately with no
   cleanup guarantee, and says so clearly in the docs, so customers holding
   external resources know not to rely on in-task cleanup.

What's not defensible is claiming (1) via the `signal` API surface while actually
doing (2) silently.

## What we found

Across **5 independent trials**, cancel consistently produced: `status: CANCELED`,
`error: {"message": "Canceled by user"}`, and **no `output` field at all** —
not even once. The run finished within ~2 seconds of the cancel call regardless
of how much work remained (we canceled a 10-second task at the 2-second mark).
The task's own `if (signal.aborted) return {...}` branch never executed in any
trial.

We checked whether this is a known, tested limitation:
`internal-packages/run-engine/src/engine/tests/cancelling.test.ts` in the
Trigger.dev source never asserts on `output` or any cleanup-related behavior for
a canceled run — this distinction (hard-kill vs. cooperative) isn't covered by
the platform's own test suite either.

## Why it matters

If a task opened a database transaction, uploaded part of a file, or acquired an
external lock before being canceled, that resource is never released by the
task's own code — whatever happens to it happens outside Trigger.dev's control
entirely. Customers should design for this explicitly (external timeouts,
idempotent/resumable operations) rather than relying on `signal.aborted` cleanup.

## Pass condition

See `tests/`. This task is scored as **informational** (the finding itself is
the deliverable) but the automated check requires: `status: CANCELED` reliably
observed in 5/5 trials, and it reports whether `output` was ever populated in
any trial (0/5 in our repro).
