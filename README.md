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

Published report (design artifact): [`docs/report.html`](docs/report.html).

## Repo layout

```
TriggerDevBench/           the packaged benchmark — 10 Harbor-format tasks
  tasks/task-01.../          task.toml + instruction.md + README.md +
                              environment/ + driver/ + tests/ -> reward.txt
  shared/                     shared self-hosted stack reference + setup docs
  findings.json                structured summary of every task's result
  scoring/self_improve.mjs     self-improving proposal generator (see below)
  PROPOSED_TASKS.md             its output, unreviewed, with an editorial triage pass
  candidates.json                same output, structured

eval-project/               the extended eval suite (19 evals) TriggerDevBench's
                             tasks were drawn from — Node/TypeScript, run directly
                             against the SDK rather than the Harbor task format
  src/trigger/                 the actual Trigger.dev task definitions under test
  harness/                     the eval runner, lib, and results

docs/report.html            the published findings report (design artifact)
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

## Models used

Two different roles, not one:

- **The subject under test** is Trigger.dev itself — a job-orchestration
  platform, not a model. Most tasks never invoke an LLM at all; they trigger
  real Trigger.dev tasks via the REST API and assert on the platform's own
  behavior (run status, timing, output).
- **`nemotron-mini`** (NVIDIA, 4B, `ollama pull nemotron-mini`), run locally
  via Ollama on the same machine the self-hosted stack runs on — no external
  API, no per-call cost, fast enough to sit inside a live eval loop. Used in
  two places:
  - `eval-22-long-running-agent-no-timeout` — simulates an AI-agent workload
    that calls a real model at each step of a multi-minute loop, to test
    whether Trigger.dev's "no timeouts" claim holds for a genuinely
    long-running task rather than a synthetic `sleep()`.
  - `TriggerDevBench/scoring/self_improve.mjs` — the local judge model for the
    self-improving proposal loop (see below). Its output quality there is
    reported honestly, not smoothed over: small models produce mixed results,
    which is the actual reason that loop has a mandatory human review gate
    rather than auto-merging proposals into the task suite.

`llama3.1:8b` and `qwen3.8:27b` were available on the same machine (pulled for
unrelated work) but not used here — `nemotron-mini` was chosen specifically
for being the smallest/fastest option that could still return coherent
structured judgments, since neither eval role needed a larger model's
capability.

## Scoreboard

Live results, not aspirational ones — every row below was produced by
actually running its check against a real self-hosted Trigger.dev v4.5.16
deployment.

Two tiers:

- **TriggerDevBench** (`TriggerDevBench/tasks/`) — the polished, Harbor-format
  suite: `task.toml` + `instruction.md` + `README.md` narrative + `driver/` +
  `tests/` → `reward.txt`. This is the citable, packaged benchmark.
- **Extended eval suite** (`eval-project/harness/`) — the working superset (19
  evals) TriggerDevBench's tasks were drawn from, kept for breadth and for
  evals not yet promoted into the packaged format.

### TriggerDevBench — 10/10 tasks live-verified

| # | Task | Category | Result | Key metric |
|---|---|---|---|---|
| 01 | [pending-version-stuck-run](TriggerDevBench/tasks/task-01-pending-version-stuck-run) | deploy-drift | 🔴 FAIL | Unresolved at T+11:02, past 10m TTL |
| 02 | [cancel-hard-kill](TriggerDevBench/tasks/task-02-cancel-hard-kill) | cancellation | 🔴 FAIL | 0/5 trials show cleanup output |
| 03 | [naive-sender-burst-loss](TriggerDevBench/tasks/task-03-naive-sender-burst-loss) | load | 🟡 DISCLOSED | 0%–86.5% loss, load-dependent |
| 04 | [executing-crash-recovery](TriggerDevBench/tasks/task-04-executing-crash-recovery) | resilience | 🟢 PASS | 300.06s actual vs. 300.00s claimed SLA |
| 05 | [self-hosted-no-checkpoint](TriggerDevBench/tasks/task-05-self-hosted-no-checkpoint) | capacity-planning | 🟡 DISCLOSED | 41.4s actual vs. 20.0s non-blocking theory |
| 06 | [idempotency-dedup](TriggerDevBench/tasks/task-06-idempotency-dedup) | correctness | 🟢 PASS | 5 concurrent → 1 run, 1 execution |
| 07 | [retry-backoff-timing](TriggerDevBench/tasks/task-07-retry-backoff-timing) | retries | 🟢 PASS | 10.8s actual vs. 7.0s theoretical min |
| 08 | [wildcard-concurrency-starvation](TriggerDevBench/tasks/task-08-wildcard-concurrency-starvation) | concurrency | 🟢 PASS | 1.36s max wait vs. 6.0s hog hold |
| 09 | [replay-determinism](TriggerDevBench/tasks/task-09-replay-determinism) | determinism | 🟢 PASS | Identical hash, genuine re-execution |
| 10 | [oversized-payload](TriggerDevBench/tasks/task-10-oversized-payload) | edge-case | 🟢 PASS | Clean HTTP 413, no truncation |

**6 PASS · 2 FAIL · 2 DISCLOSED** — see each task's `README.md` for the full
narrative and `tests/results.json` for raw verifier output once run.

### Extended eval suite — last full run: 13/17 passed

Run at `eval-project/harness/run.mjs`, full raw output in
`eval-project/harness/results.json`.

| Eval | Category | Result |
|---|---|---|
| eval-08-deploy-drift-error-clarity | deploy-drift | 🔴 FAIL |
| eval-09-idempotency-dedup | idempotency | 🟢 PASS |
| eval-10-retry-backoff | retries | 🟢 PASS |
| eval-01-queue-starvation | concurrency | 🟢 PASS |
| eval-11-non-idempotent-misuse | idempotency-misuse | 🟢 PASS (confirms documented footgun) |
| eval-14-wait-for-state | observability | 🟢 PASS |
| eval-02-wildcard-concurrency-key | concurrency | 🟢 PASS |
| eval-24-idempotency-payload-collision | idempotency-edge-case | 🟢 PASS |
| eval-25-cancel-mid-execution | cancellation | 🔴 FAIL → **superseded**, see below |
| eval-28-oversized-payload | edge-case | 🟢 PASS |
| evalBatchIngestion | error | 🔴 FAIL → **resolved**, see below |
| eval-22-long-running-agent-no-timeout | ai-agent | 🟢 PASS |
| misc-nemotron-judge-sanity | misc | 🟢 PASS |
| eval-26-serial-queue-tail-latency | concurrency | 🟢 PASS |
| eval-03-webhook-burst | load | 🟢 PASS |
| eval-29-naive-sender-burst-no-retry | load | 🔴 FAIL (expected, see task-03) |
| eval-12-realtime-status-under-load | observability | 🟢 PASS |
| eval-51-replay-determinism | determinism | 🟢 PASS *(added after this run; see task-09)* |
| eval-52-cross-step-causal-consistency | consistency | 🟢 PASS *(added after this run; see below)* |

**Post-run corrections** (kept here rather than silently rewriting the
historical run):

- `evalBatchIngestion`'s `fetch failed` was traced to webapp logs showing zero
  server-side errors in the exact failure window — reclassified as a
  client-side `undici` connection-pool issue in the harness itself, not a
  platform finding. Not carried into TriggerDevBench.
- `eval-25-cancel-mid-execution` was redesigned to run 5 independent trials
  (see Methodology below) rather than one. The upgraded version — `0/5`
  trials ever show cleanup output — is the one packaged as task-02.

**Cross-step causal consistency** (not yet promoted to a numbered task): 20
writer→reader pairs, immediate read-after-write on a single-node topology —
0/20 stale or missing. Expected result on this topology per CausalMesh's
(VLDB'25) failure model; the eval exists mainly so the "no staleness
possible, single node" assumption is verified rather than assumed. A genuine
multi-node self-hosted deployment would be the interesting version of this
test.

### Reproducing the scoreboard

```bash
cd eval-project
set -a && source .env && set +a
node harness/run.mjs                        # extended suite (~15 min, includes an 11-min TTL wait)

cd ../TriggerDevBench
# per task:
node "tasks/task-06-idempotency-dedup/driver/run.mjs"
node "tasks/task-06-idempotency-dedup/tests/test_outputs.mjs"
```

## Grounding

Every task in this repo traces to one of two things: a specific line in
Trigger.dev's own source, or a published methodology. Nothing here was
invented from first principles — the point of both is that a finding or a
test design can be checked against something outside this repo.

### Grounded in Trigger.dev's own source

Cross-referenced against a local clone of the upstream repo (gitignored
here — it's upstream source, not this repo's work) before writing up any
finding.

| Citation | What it grounds |
|---|---|
| `internal-packages/run-engine/src/engine/tests/pendingVersion.test.ts` (448 lines, 3 scenarios) | All three scenarios require a matching worker to *eventually* arrive. None test the "no worker ever will" case — [task-01](TriggerDevBench/tasks/task-01-pending-version-stuck-run)'s exact repro. |
| `internal-packages/run-engine/src/engine/tests/ttl.test.ts` (1790 lines) | Zero mentions of `PENDING_VERSION` anywhere. Confirms the task-01 gap isn't covered by a differently-named test either. |
| `internal-packages/run-engine/src/engine/tests/cancelling.test.ts` (450 lines) | Zero assertions on `output` or cleanup behavior for a canceled run — [task-02](TriggerDevBench/tasks/task-02-cancel-hard-kill)'s hard-kill finding isn't covered by the platform's own tests either. |
| `internal-packages/run-engine/src/engine/tests/snapshotStoreChaos.test.ts` | Trigger.dev's own white-box chaos suite: in-process fault injection at 3 named write boundaries (`afterPgBeforeRedis`, `afterRedisBirthBeforePg`, `midFlushRetry`), validated against a TLA+/TLC model. [task-04](TriggerDevBench/tasks/task-04-executing-crash-recovery) is this suite's black-box counterpart — a real `SIGKILL`, not an injected exception, the failure mode a customer's infrastructure actually produces. |
| `apps/webapp/app/env.server.ts` — `RUN_ENGINE_TIMEOUT_PENDING_EXECUTING` (60s), `RUN_ENGINE_TIMEOUT_EXECUTING` (300s), `RUN_ENGINE_TIMEOUT_SUSPENDED` (600s) | The exact claimed SLA numbers task-04 was tested against, not estimated. |
| `docs/self-hosting/docker.mdx` — "No checkpoint support… only ever experimental when self-hosting" | [task-05](TriggerDevBench/tasks/task-05-self-hosted-no-checkpoint)'s premise. Confirmed independently: zero references to "checkpoint" anywhere in `packages/cli-v3/src/`. |
| `docs/self-hosting/overview.mdx` feature table | "Checkpoints: Cloud ✅ / Self-hosted ❌ — non-blocking waits, less resource usage" — the specific operational claim task-05 measures empirically (41.4s actual vs. 20s non-blocking theory). |
| Server log line `"Waits of 5s or less count towards compute usage"` | Observed live in the dev-server output; sent us to the docs/source above rather than assuming a threshold. |
| Prisma error `Unique constraint failed on (runtimeEnvironmentId, taskIdentifier, idempotencyKey)`, `ignoreError: true` | Confirms task-06's idempotency guarantee is implemented as a DB constraint, not app-level locking — visible directly in webapp container logs during the eval run. |

### Grounded in published methodology

| Work | What it shaped |
|---|---|
| **Jepsen** (Kingsbury, ongoing) — black-box adversarial workload + fault injection, scored against a system's *claimed* guarantee rather than general correctness | The overall framing: don't ask "does it work," ask "does it uphold the specific guarantee it claims." Task-06's true-concurrent-race design follows this directly. |
| **"Simple Testing Can Prevent Most Critical Failures"** (Yuan et al., OSDI 2014) — 92% of catastrophic distributed-systems failures trace to mishandled non-fatal errors, not deep distributed-systems faults | Every confirmed bug here (task-01, task-02) is exactly this class — an error-handling path, cheap to find once you target error paths specifically instead of the happy path. |
| **"Lineage-driven Fault Injection"** (Alvaro, Rosen, Hellerstein, SIGMOD 2015; adopted by Netflix as LDFI) — reason backwards from a correct outcome to the *minimal* fault combination that could break it, rather than random fault injection | Informs how task-04's crash point was chosen deliberately (mid-`EXECUTING`, a real state with a documented SLA) rather than an arbitrary kill. |
| **SandTable** (EuroSys 2024) — exhaustive distributed model-checking of crash-point state spaces | The template for enumerating *which* crash points are actually distinguishable, rather than testing one arbitrary moment — same idea Trigger.dev's own `snapshotStoreChaos.test.ts` applies internally. |
| **"Durable Functions: Semantics for Stateful Serverless"** (OOPSLA/PACMPL 2021) | The formal correctness property task-09 tests externally: replay determinism. Note the adaptation — Trigger.dev's public `/replay` API means "re-execute with the same payload," not the internal checkpoint-log replay this paper formalizes, which isn't exposed publicly. |
| **Halfmoon** (SOSP 2023) — log-optimal fault-tolerant stateful serverless computing, minimizing log-write overhead while guaranteeing exactly-once semantics across crashes | Frames the real question behind task-04: not just "does it recover" but "does it recover to exactly-once," which is why task-04 also checked for orphaned/duplicate process state after the kill. |
| **Netherite** (VLDB Journal 2024/2025) — efficient serverless workflow execution, treating queue/partition backlog drain time as a first-class measured metric | Validates the "measure and disclose a curve, don't just gate pass/fail" posture used for task-03 and task-05. |
| **CausalMesh** (VLDB 2025) — causal consistency for stateful serverless caching across machines | The failure mode behind the (not-yet-numbered) cross-step consistency eval in `eval-project/harness/evals.mjs` — explicitly expected to trivially pass on our single-node topology, and says so rather than claiming a false positive. |
| **SWE-bench** (Yang et al., 2023) — build the eval directly from a real-world artifact (a GitHub issue + its merged fix) rather than an invented scenario | The provenance discipline this whole repo follows: every task traces to a cited commit, doc, or test file, not a hypothetical. |
| **τ-bench** (Yao et al., Sierra, 2024) — single-run pass/fail is misleading for agentic/timing-sensitive systems; measure success rate across repeated identical trials | Directly reused for [task-02](TriggerDevBench/tasks/task-02-cancel-hard-kill): 5 independent trials, reporting a rate (`0/5` show cleanup output), not one boolean. |
| **"Beyond pass@1: A Reliability Science Framework for Long-Horizon LLM Agents"** (2026) | Generalizes the τ-bench insight beyond agents specifically: any crash/cancel/race-condition finding should be reported as a trial success rate. Applied the same way as τ-bench above. |
| **Dynabench** (Kiela et al., NAACL 2021) — "Rethinking Benchmarking in NLP"; a benchmark's test set should keep expanding toward a subject's actual weak points via human/model-in-the-loop adversarial rounds, not stay a fixed snapshot | The direct basis for `TriggerDevBench/scoring/self_improve.mjs` — see below. |
| Arize, "Techniques for Self-Improving LLM Evals" (practitioner writeup) — every meaningful production failure should become a future regression test | The practical version of the Dynabench idea, and the framing for why every FAIL/DISCLOSED finding in `findings.json` is fed back through the proposal generator. |

### Self-improving loop

`TriggerDevBench/scoring/self_improve.mjs` is the model-only half of
Dynabench's human/model-in-the-loop pattern: it feeds every confirmed finding
in `findings.json` to a local judge model (`nemotron-mini` via Ollama) and
asks for one new, more adversarial follow-up scenario per finding. Output goes
to `PROPOSED_TASKS.md` and `candidates.json`.

This is a proposal generator, not an auto-merge pipeline, and the repo's own
first run of it demonstrates why: quality from a small local model is
genuinely mixed (see the "Editorial triage" section at the top of
`TriggerDevBench/PROPOSED_TASKS.md`, written after actually reading its
output) — some candidates are sharp and worth building, several are confused
or just restate the source finding. Every existing numbered task in
`TriggerDevBench/tasks/` was still hand-built and live-verified against the
real deployment; nothing here ships as a task without a human reading it
first.

## Status

10/10 TriggerDevBench tasks built and live-verified: 6 pass, 2 confirmed
platform bugs, 2 disclosed (load- or config-dependent, not binary pass/fail).
