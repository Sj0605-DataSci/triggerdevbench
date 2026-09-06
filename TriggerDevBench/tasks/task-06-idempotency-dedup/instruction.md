# Reliability ticket

**Scenario ID:** RELI-0006

## Report

A customer's retry-happy HTTP client sometimes fires the same request twice in
quick succession (double-click, network retry racing the original). They rely
on Trigger.dev's `idempotencyKey` option to collapse duplicates into one run.

## Your goal

Fire 5 triggers of `eval-09-idempotency-side-effect` with the *same*
`idempotencyKey`, all at once (no delay between calls, a true race), and check
whether that collapses to exactly one run with exactly one execution.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/eval-09-idempotency-side-effect/trigger` with `options.idempotencyKey`
