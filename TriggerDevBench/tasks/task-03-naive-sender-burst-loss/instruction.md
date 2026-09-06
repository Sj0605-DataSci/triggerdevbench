# Reliability ticket

**Scenario ID:** RELI-0003

## Report

A payment provider (think Stripe) fires 200 webhook events at your self-hosted
Trigger.dev instance in a tight burst — a real refund-processing spike. Your
webhook receiver endpoint forwards each event as an individual (non-batched)
task trigger, as fast as it receives them, with no retry logic of its own (a lot
of production webhook receivers are written exactly this naively).

## Your goal

Simulate this burst against the deployed `eval-03-webhook-receiver` task and
measure how many events are permanently lost — i.e., rejected at the door with no
retry ever attempted, not events that are merely delayed.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/{taskIdentifier}/trigger`
