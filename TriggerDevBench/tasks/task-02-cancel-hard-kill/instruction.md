# Reliability ticket

**Scenario ID:** RELI-0002

## Report

A long-running task holds an external resource (imagine a DB transaction or a
partially-uploaded file) and checks an abort signal between steps so it can clean
up gracefully if canceled. A customer wants to know: if they cancel a run partway
through, will their cleanup code actually execute?

## Your goal

Trigger the long-running task, cancel it 2 seconds in (well before it would
naturally finish), and record whether the run's output shows the task's own
cleanup path executed. Repeat 5 times independently — a single trial can't tell
you whether the answer is a guarantee or a coin flip.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/{taskIdentifier}/trigger`
- Cancel: `POST /api/v2/runs/{runId}/cancel`
- Poll run status: `GET /api/v3/runs/{runId}`
