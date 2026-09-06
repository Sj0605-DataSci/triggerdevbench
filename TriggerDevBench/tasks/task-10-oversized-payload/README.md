# task-10 — What happens to a 4MB payload?

## What this task is

An edge-case probe: not a documented limit, just an adversarial input designed
to find the failure mode (hang / crash / silent truncation) rather than assume
one doesn't exist.

## What we found

Clean rejection: HTTP 413, `{"error":"Request body too large"}`. No hang, no
truncation, no unhandled 5xx. This is exactly the behavior we'd want to see —
the platform enforces a limit and reports it clearly rather than failing open
or failing silently.

## Pass condition

See `tests/`. Either a 4xx with a clear message, or a 200 with the full,
untruncated length echoed back. A hang, 5xx, or truncated/corrupted length
fails.
