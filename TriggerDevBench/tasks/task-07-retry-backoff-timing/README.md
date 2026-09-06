# task-07 — Is the backoff curve real?

## What this task is

Checks that Trigger.dev's exponential backoff isn't just a documentation claim
— that a task retried after 3 forced failures actually spends wall-clock time
waiting between attempts proportional to the configured curve, not retried
back-to-back with no delay.

## What we found

`attemptCount` correctly reported 4 (3 failures + 1 success). Total wall-clock
time (`finishedAt - createdAt`) was consistently well above the ~7-second
theoretical minimum backoff sum (`1000 + 2000 + 4000ms`), confirming real delays
between attempts. We could not verify per-attempt timestamps from inside the
task itself: task-local in-memory state resets between attempts in dev mode
(confirmed separately -- each retry attempt is a fresh module load, not a
resumed process), so a naive in-memory timestamp array silently returns only
the current attempt's data. This is worth flagging on its own: any customer
task relying on in-memory state to survive a retry (a counter, a cache, a
partial-progress tracker) will find it silently reset on every attempt in dev
mode.

## Pass condition

See `tests/`. `attemptCount === 4` and wall-clock duration `>= 0.5 *
theoretical_min_backoff`.
