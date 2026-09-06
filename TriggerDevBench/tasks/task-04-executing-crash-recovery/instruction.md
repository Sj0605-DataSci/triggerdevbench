# Reliability ticket

**Scenario ID:** RELI-0004

## Report

The self-hosted dev worker process dies mid-task — an OOM kill, a host reboot, a
`docker kill` on the wrong container, a spot-instance reclaim. No graceful
shutdown, no chance for the worker to report anything. The customer's question:
does the platform notice on its own, or does the run just sit there forever
looking "in progress" when nothing is actually running?

## Your goal

Trigger a 30-second task, confirm it's genuinely `EXECUTING`, then SIGKILL the
entire worker process tree (not a graceful stop). Do **not** restart the worker.
Poll the run's status for up to 7 minutes and record when (if ever) it resolves
to a terminal state, entirely independent of a worker ever reconnecting.

## API access

- Base URL: `http://localhost:8030`
- Auth: `Authorization: Bearer <TRIGGER_SECRET_KEY>`
- Trigger: `POST /api/v1/tasks/{taskIdentifier}/trigger`
- Poll run status: `GET /api/v3/runs/{runId}`
