# Reliability ticket

**Scenario ID:** RELI-0007

## Report

A customer's task calls a flaky third-party API and relies on Trigger.dev's
built-in retry with exponential backoff (configured: `minTimeoutInMs: 1000,
factor: 2`) rather than hand-rolling their own. They want confidence the
backoff curve is real, not just retried-instantly-until-success.

## Your goal

Trigger `eval-10-retry-backoff` configured to fail its first 3 attempts, then
succeed on attempt 4. Confirm `attemptCount === 4` and that the total wall-clock
time is consistent with a real exponential backoff (roughly `1000 + 2000 + 4000
= 7000ms` minimum of pure backoff delay, on top of execution time).

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/eval-10-retry-backoff/trigger`
- Poll run status: `GET /api/v3/runs/{runId}` (has `createdAt`/`finishedAt`/`attemptCount`)
