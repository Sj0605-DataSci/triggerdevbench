# Shared environment

Every task in this benchmark runs against the same self-hosted Trigger.dev v4
stack, the same way every ITSMBench task shares one pinned
`harbor.local/taskgen-emulator` image instead of redefining 42 mocked systems
per task. Here, the shared piece is a full self-hosted deployment: Postgres,
Redis, ClickHouse, Electric, MinIO, a Docker registry, S2, the supervisor, and
the webapp — plus one running `trigger dev` process with this benchmark's task
definitions (`../../eval-project/src/trigger/*.ts`) registered against it.

`docker-compose.self-hosted.yaml` in this directory is a thin reference to the
upstream compose files rather than a duplicate, so a version bump upstream
doesn't require touching every task:

```yaml
include:
  - path: ../../trigger.dev/hosting/docker/webapp/docker-compose.yml
  - path: ../../trigger.dev/hosting/docker/worker/docker-compose.yml
```

## Setup

```bash
cd ../../trigger.dev/hosting/docker
cp .env.example .env && ./generate-secrets.sh
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d

cd ../../../eval-project
npx trigger.dev@latest login -a http://localhost:8030
npx trigger.dev@latest dev
```

Set `TRIGGER_API_URL` and `TRIGGER_SECRET_KEY` (project dev secret key from the
webapp's Settings -> API keys page) before running any task's driver or verifier.

## Why not literal Harbor?

ITSMBench uses [Harbor](https://github.com/laude-institute/harbor) to run an LLM
agent inside `environment`'s `main` container against `instruction.md`, then
score the result. Harbor's execution model assumes an agent is the actor being
evaluated. This benchmark evaluates the platform itself, not an agent's
judgment, so each task's `driver/` is a fixed, deterministic script standing in
for the "agent" -- doing exactly what `instruction.md` describes, no more and no
less. The directory shape, `task.toml` schema, and pass/fail (`reward.txt`)
convention are kept identical so a task here reads exactly like an ITSMBench
task to anyone already familiar with that format.
