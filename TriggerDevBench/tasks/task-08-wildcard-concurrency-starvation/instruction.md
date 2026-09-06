# Reliability ticket

**Scenario ID:** RELI-0008

## Report

A past Trigger.dev bug: triggering a run with `concurrencyKey: "*"` could stall
an entire queue, including runs using other, unrelated concurrency keys on the
same queue, until something else happened to unstick it. This regression test
checks it stays fixed.

## Your goal

Trigger one run with `concurrencyKey: "*"` that holds for 6 seconds, then
immediately trigger 3 more runs with distinct real keys (`k1`, `k2`, `k3`) on
the same queue. Confirm the 3 distinct-key runs are not starved behind the
wildcard-key run.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/eval-02-wildcard-key-task/trigger` with `options.concurrencyKey`
