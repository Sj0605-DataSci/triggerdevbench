# Reliability ticket

**Scenario ID:** RELI-0001

## Report

A customer's CI pipeline renamed a background task (`process-refund` -> `process-refund-v2`)
but a stale webhook handler on an old deploy is still calling the API with the old
task identifier, `process-refund`. No worker in this environment will ever register
that identifier again.

## Your goal

Trigger `process-refund` via the public REST API exactly as the stale webhook handler
would, then determine what happens to that run: does the platform reject it
immediately with a clear error, or does it accept it and later resolve it to a
terminal failure state, or does it stay wedged forever?

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/{taskIdentifier}/trigger`
- Poll run status: `GET /api/v3/runs/{runId}`
