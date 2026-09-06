# Reliability ticket

**Scenario ID:** RELI-0009

## Report

A customer debugging a production incident wants to replay a failed run's
input against the current deployed code to see what would happen. They need to
trust that "replay" actually re-executes the task rather than returning a
cached/memoized result, and that a genuinely pure task produces identical
output.

## Your goal

Trigger `eval-51-deterministic-computation`, wait for it to complete, then call
`POST /api/v1/runs/{runId}/replay`. Confirm the replay creates a *new* run id,
that the task's own execution counter shows a second real execution (not a
cache hit), and that the computed output is byte-identical to the original.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/eval-51-deterministic-computation/trigger`
- Replay: `POST /api/v1/runs/{runId}/replay`
