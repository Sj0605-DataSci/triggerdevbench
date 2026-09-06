# trigger-dev-evals

A reliability benchmark for [Trigger.dev](https://trigger.dev)'s self-hosted
platform (v4.5.16), built by mirroring [New Measure](https://github.com/new-measure)
& Atomicwork's [ITSMBench](https://github.com/new-measure/ITSMBench) task
format — adapted to score a platform's own behavior against its claimed
guarantees, rather than an LLM agent's judgment.

Every finding in this repo was produced by actually running the check against
a real self-hosted Trigger.dev deployment on real hardware. No mocked
responses, no simulated failures — including a real `SIGKILL` of the worker
process mid-execution to test crash recovery.

**Start here:** [`SCOREBOARD.md`](SCOREBOARD.md) for results,
[`RESEARCH.md`](RESEARCH.md) for what every finding is grounded in, or the
published report: [`docs/report.html`](docs/report.html).

## Repo layout

```
TriggerDevBench/           the packaged benchmark — 10 Harbor-format tasks
  tasks/task-01.../          task.toml + instruction.md + README.md +
                              environment/ + driver/ + tests/ -> reward.txt
  shared/                     shared self-hosted stack reference + setup docs
  findings.json                structured summary of every task's result
  scoring/self_improve.mjs     self-improving proposal generator (see RESEARCH.md)
  PROPOSED_TASKS.md             its output, unreviewed, with an editorial triage pass
  candidates.json                same output, structured

eval-project/               the extended eval suite (19 evals) TriggerDevBench's
                             tasks were drawn from — Node/TypeScript, run directly
                             against the SDK rather than the Harbor task format
  src/trigger/                 the actual Trigger.dev task definitions under test
  harness/                     the eval runner, lib, and results

docs/report.html            the published findings report (design artifact)
SCOREBOARD.md                live results, both tiers
RESEARCH.md                  every finding's grounding: Trigger.dev source + papers
```

## Quickstart

```bash
git clone https://github.com/triggerdotdev/trigger.dev.git   # upstream source, gitignored here
cd trigger.dev/hosting/docker
cp .env.example .env && ./generate-secrets.sh
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d

cd ../../../eval-project
npm install
npx trigger.dev@latest login -a http://localhost:8030
npx trigger.dev@latest dev &

set -a && source .env && set +a
node harness/run.mjs          # extended suite
```

See [`TriggerDevBench/shared/README.md`](TriggerDevBench/shared/README.md)
for the packaged-task version of this setup, and each task's own `README.md`
for what it tests and why.

## Status

10/10 TriggerDevBench tasks built and live-verified: 6 pass, 2 confirmed
platform bugs, 2 disclosed (load- or config-dependent, not binary pass/fail).
Full breakdown in [`SCOREBOARD.md`](SCOREBOARD.md).
