# Reliability ticket

**Scenario ID:** RELI-0005

## Report

A capacity-planning question from a prospective self-hosted customer: "if my
workflow has a lot of `wait.for()` calls (rate-limit backoffs, human-approval
gates, scheduled delays), do those waits tie up worker capacity the whole time
they're waiting, or does the platform free that capacity like it does on Cloud?"

## Your goal

Trigger 4 runs of a task that does `wait.for({ seconds: 20 })`, on a queue with
`concurrencyLimit: 2`. If waits are non-blocking (checkpointed, capacity freed),
all 4 should start executing almost immediately and the whole batch finishes in
roughly 20 seconds. If waits are blocking (capacity held for the duration), only
2 can run at a time and the batch takes roughly 40 seconds.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/eval-53-blocking-wait-task/trigger`
- Poll run status: `GET /api/v3/runs/{runId}` (has `startedAt`/`finishedAt`)
