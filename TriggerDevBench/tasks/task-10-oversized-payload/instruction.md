# Reliability ticket

**Scenario ID:** RELI-0010

## Report

A customer's task accidentally receives a much larger payload than expected (a
bug upstream serialized an entire dataset instead of a reference to it). They
want to know what happens: a clean, actionable error, or something worse.

## Your goal

Trigger `eval-28-payload-echo` with a 4MB string payload. Record whether the
platform rejects it cleanly (4xx, clear message) or accepts and correctly
echoes back the full length with no truncation. Either is acceptable; a hang,
crash, or silent truncation is not.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/eval-28-payload-echo/trigger`
