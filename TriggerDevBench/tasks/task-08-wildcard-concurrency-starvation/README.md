# task-08 — Regression check: wildcard concurrency key vs. queue fairness

## What this task is

A previously-fixed bug, kept in the suite as a regression check. The concern:
a wildcard concurrency key is semantically different from a real key and
shouldn't participate in the same fairness accounting as actual customer keys.

## What we found

Fixed and holding. The 3 distinct-key runs completed in ~1.5 seconds while the
wildcard-key run was still holding for its full 6 seconds — no starvation
observed.

## Pass condition

See `tests/`. All 3 distinct-key runs reach `COMPLETED` within 4 seconds
(well under the wildcard run's 6-second hold).
