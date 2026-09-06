# task-03 — What happens to a webhook burst when the sender doesn't retry?

## What this task is

A community report (r/selfhosted) described webhook data loss under high-load
processing in Trigger.dev v2, which motivated a custom queue rewrite for v3. This
task checks whether the underlying exposure — event loss under burst load — is
actually gone in v4, or whether it just moved from "queue can't keep up" to
"rate limiter rejects the burst instead."

## What we expect the platform to do

A well-behaved-but-naive sender (no retry-on-429 logic, which describes plenty of
real webhook integrations) should not permanently lose data just because it hit a
default rate limit during a legitimate traffic spike. Either the default limit
should be generous enough to absorb a realistic burst, or the platform should
queue/buffer rather than hard-reject.

## What we found

Result is **load-dependent, not a fixed number** — we ran this twice and got
materially different outcomes, and both are worth reporting rather than
cherry-picking one:

- **During heavy concurrent load** (this burst run back-to-back with several
  other evals hammering the same instance): **173/200 (86.5%) permanently
  rejected** with HTTP 429.
- **As an isolated burst** against an otherwise-idle instance: **0/200
  rejected**.

Since this driver deliberately does not retry (modeling a naive sender),
whatever gets rejected in the hot-window case is gone for good — there is no
queue-side recovery for a request that never made it past the rate limiter.
The self-hosted default limit (750 requests/window, from the 429 response body)
is generous enough to absorb an isolated 200-event burst on its own, but not
enough headroom to also absorb one on top of other concurrent traffic sharing
the same window.

## Why it matters

This is a customer-configuration problem more than a platform bug, and the
load-dependence makes it a genuinely easy one to hit only in production, not
in isolated testing — a 200-event burst that looks completely safe when
tested in isolation (as most pre-launch load tests would) can lose most of its
data once the rate-limit window already has other traffic in it. A 429 at the
HTTP layer also looks nothing like the UI's "runs" view; nothing shows up as a
failed run, because the run was never created. A customer will only notice
missing data downstream, not an error in Trigger.dev's own dashboard.

## Pass condition

See `tests/`. Loss rate must be reported; the check flags (not necessarily fails)
any run where loss rate exceeds 0%, since some rate limiting under a 200-event
burst may be an intentional, documented default rather than a bug — the point is
visibility, matching this benchmark's overall framing (measure and disclose,
don't just pass/fail).
