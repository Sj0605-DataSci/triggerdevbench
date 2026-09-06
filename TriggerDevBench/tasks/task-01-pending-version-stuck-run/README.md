# task-01 — A trigger call for a task that will never exist

## What this task is

A deploy-drift scenario: a caller (a stale webhook handler, a typo'd task id, a
task that was renamed and never re-deployed on the caller's side) triggers a task
identifier that no currently-running worker has ever registered, and never will.
This is the single most common real-world Trigger.dev failure mode according to
the project's own troubleshooting docs.

## What we expect the platform to do

One of two honest outcomes:

1. **Fail fast.** Reject the trigger call immediately (4xx) with a message that
   clearly identifies the problem ("no worker registered for task X").
2. **Fail eventually, but definitely.** Accept the trigger (the platform can't know
   at trigger time whether a matching worker deploy is seconds away), but resolve
   the run to a terminal failure state once its own TTL expires — the run's `ttl`
   field exists precisely to bound how long an unfulfillable trigger can sit
   around.

Either is defensible. What's not defensible is a third outcome: accepting the
trigger, reporting success, and then never resolving it at all.

## What we found

Trigger.dev v4.5.16 self-hosted takes neither honest path. The trigger call
returns **HTTP 200** with a run id (a false-positive success from the caller's
point of view). The run enters status `PENDING_VERSION` and, in every trial we
ran, was **still `PENDING_VERSION` at T+11 minutes** — past its own stated 10-minute
TTL, with no worker to ever fulfill it.

We checked whether this was simply untested rather than a known limitation:
`internal-packages/run-engine/src/engine/tests/pendingVersion.test.ts` in the
Trigger.dev source tests TTL arming for a `PENDING_VERSION` run **after a matching
worker eventually shows up** (three scenarios, all involving a worker arriving).
`ttl.test.ts` (1790 lines) never mentions `PENDING_VERSION` at all. Neither file
tests the "no worker ever arrives" case this task reproduces — this is a real gap
in the platform's own test matrix, not a known and accepted limitation.

## Why it matters

A customer whose CI accidentally ships a stale caller (extremely common —
Trigger.dev's own docs list "forgot to `trigger.dev deploy`" as the most frequent
real-world incident) gets silent, permanent data loss: the trigger call reports
success, nothing ever runs, and nothing ever tells them it failed. There's no
error to alert on, because as far as the API response was concerned, it worked.

## Pass condition

See `tests/`. The run must resolve to a terminal status
(`FAILED`/`CRASHED`/`SYSTEM_FAILURE`/`TIMED_OUT`) within `ttl + 60s` of being
triggered. Staying in `PENDING_VERSION` past that window is a failure.
