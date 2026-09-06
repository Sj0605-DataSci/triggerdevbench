# task-05 — Self-hosted waits hold their concurrency slot for the full duration

## What this task is

This started as a different test: kill the worker mid-`wait.for()` (a
checkpointed/`SUSPENDED` state) and check whether it recovers within
`RUN_ENGINE_TIMEOUT_SUSPENDED` (10 minutes), the same way task-04 tests a crash
mid-`EXECUTING`. It turned into this task instead, because the premise was
wrong: we triggered a 60-second wait and polled it every 2 seconds for 16+
seconds — it never left `EXECUTING`/`isWaiting: false`. That sent us to the
source rather than the docs alone.

`docs/self-hosting/docker.mdx` states plainly: **"No checkpoint support. This
was only ever experimental when self-hosting and not recommended. It caused a
bunch of issues. We decided to focus on the core features instead."**
`docs/self-hosting/overview.mdx`'s feature table lists Checkpoints as Cloud-only,
described as enabling "non-blocking waits, less resource usage." We also
confirmed zero references to "checkpoint" anywhere in `packages/cli-v3/src/` —
the CLI that ships both `trigger dev` and the code bundled into every deployed
task image never even attempts to request one.

So there's no "mid-checkpoint crash" state to test on self-hosted Docker at any
wait duration — the feature simply isn't there. What we could test instead: the
concrete operational consequence of that absence.

## What we expect

Per the docs' own framing ("non-blocking waits, less resource usage" is what
you *don't* get), a `wait.for()` on self-hosted Docker should hold its
concurrency slot for the wait's entire duration rather than freeing it.

## What we found

Confirmed empirically, not just cited from docs. 4 runs of a 20-second
`wait.for()`, on a queue with `concurrencyLimit: 2`:

- Runs 1 and 2 started at `T+0` and completed at `T+20.4s`.
- Runs 3 and 4 did not start until `T+20.5s` — the exact moment runs 1 and 2
  freed their slots — and completed at `T+41.4s`.

Total wall time for the batch: **~41.4s**, essentially exactly `2 × 20s`. A
Cloud deployment with checkpointing would be expected to run all 4 concurrently
and finish the batch in ~20s.

## Why it matters

This is documented, not a bug — but it's the kind of documented limitation that
doesn't show up until someone builds a workflow with real wait-heavy patterns
(rate-limit backoff loops, `wait.forToken` human-approval gates, scheduled
multi-step delays) and finds their self-hosted worker fleet needs to be sized
for "concurrent waits + concurrent active work" rather than just "concurrent
active work." A team migrating from Cloud to self-hosted for cost reasons could
be surprised to find they need *more* worker capacity, not less, if their
workload leans on waits.

## Pass condition

See `tests/`. This task is scored as **informational** (same posture as
task-03): it reports the measured overhead ratio (`actualDuration /
theoreticalNonBlockingDuration`) rather than gating pass/fail on it, since this
is expected, documented behavior — the value is disclosure for capacity
planning, not a bug report.
