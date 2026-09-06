# task-09 — Does /replay genuinely re-execute, and is it deterministic?

## What this task is

`/replay` in the Trigger.dev API means "create a new run with the same payload
and options as the original," not the internal checkpoint-log replay that
durable-execution semantics papers formalize (that mechanism isn't exposed via
a public API). What we *can* verify externally: does replaying a pure task
reproduce identical output, and is the new run a genuine re-execution rather
than a cached result silently returned under a new id?

## What we found

Holds. Replay created a new run id, the task's file-based execution counter
showed `executionNumber: 2` (proving a real second execution, not a cache
hit), and the computed hash matched the original exactly. The platform's
replay mechanism doesn't introduce hidden nondeterminism into a pure task's
execution path.

## Pass condition

See `tests/`. `replayedRunId !== originalRunId`, `executionNumber === 2`, and
`originalHash === replayedHash`.
