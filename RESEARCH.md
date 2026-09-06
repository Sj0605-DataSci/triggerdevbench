# Grounding

Every task in this repo traces to one of two things: a specific line in
Trigger.dev's own source, or a published methodology. Nothing here was
invented from first principles — the point of both is that a finding or a
test design can be checked against something outside this repo.

## Grounded in Trigger.dev's own source

Cloned locally (`trigger.dev/`, gitignored — it's upstream source, not this
repo's work) and cross-referenced before writing up any finding.

| Citation | What it grounds |
|---|---|
| `internal-packages/run-engine/src/engine/tests/pendingVersion.test.ts` (448 lines, 3 scenarios) | All three scenarios require a matching worker to *eventually* arrive. None test the "no worker ever will" case — [task-01](TriggerDevBench/tasks/task-01-pending-version-stuck-run)'s exact repro. |
| `internal-packages/run-engine/src/engine/tests/ttl.test.ts` (1790 lines) | Zero mentions of `PENDING_VERSION` anywhere. Confirms the task-01 gap isn't covered by a differently-named test either. |
| `internal-packages/run-engine/src/engine/tests/cancelling.test.ts` (450 lines) | Zero assertions on `output` or cleanup behavior for a canceled run — [task-02](TriggerDevBench/tasks/task-02-cancel-hard-kill)'s hard-kill finding isn't covered by the platform's own tests either. |
| `internal-packages/run-engine/src/engine/tests/snapshotStoreChaos.test.ts` | Trigger.dev's own white-box chaos suite: in-process fault injection at 3 named write boundaries (`afterPgBeforeRedis`, `afterRedisBirthBeforePg`, `midFlushRetry`), validated against a TLA+/TLC model. [task-04](TriggerDevBench/tasks/task-04-executing-crash-recovery) is this suite's black-box counterpart — a real `SIGKILL`, not an injected exception, the failure mode a customer's infrastructure actually produces. |
| `apps/webapp/app/env.server.ts` — `RUN_ENGINE_TIMEOUT_PENDING_EXECUTING` (60s), `RUN_ENGINE_TIMEOUT_EXECUTING` (300s), `RUN_ENGINE_TIMEOUT_SUSPENDED` (600s) | The exact claimed SLA numbers task-04 and the deferred task-05-original-design (mid-`SUSPENDED` crash) were tested against, not estimated. |
| `docs/self-hosting/docker.mdx` — "No checkpoint support… only ever experimental when self-hosting" | [task-05](TriggerDevBench/tasks/task-05-self-hosted-no-checkpoint)'s premise. Confirmed independently: zero references to "checkpoint" anywhere in `packages/cli-v3/src/`. |
| `docs/self-hosting/overview.mdx` feature table | "Checkpoints: Cloud ✅ / Self-hosted ❌ — non-blocking waits, less resource usage" — the specific operational claim task-05 measures empirically (41.4s actual vs. 20s non-blocking theory). |
| Server log line `"Waits of 5s or less count towards compute usage"` | Observed live in the dev-server output; sent us to the docs/source above rather than assuming a threshold. |
| Prisma error `Unique constraint failed on (runtimeEnvironmentId, taskIdentifier, idempotencyKey)`, `ignoreError: true` | Confirms task-06's idempotency guarantee is implemented as a DB constraint, not app-level locking — visible directly in webapp container logs during the eval run. |

## Grounded in published methodology

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

## Self-improving loop

`TriggerDevBench/scoring/self_improve.mjs` is the model-only half of
Dynabench's human/model-in-the-loop pattern: it feeds every confirmed finding
in `findings.json` to a local judge model (`nemotron-mini` via Ollama) and
asks for one new, more adversarial follow-up scenario per finding. Output goes
to `PROPOSED_TASKS.md` and `candidates.json`.

This is a proposal generator, not an auto-merge pipeline, and the repo's own
first run of it demonstrates why: quality from a small local model is
genuinely mixed (see the "Editorial triage" section at the top of
`PROPOSED_TASKS.md`, written after actually reading its output) — some
candidates are sharp and worth building, several are confused or just restate
the source finding. Every existing numbered task in `TriggerDevBench/tasks/`
was still hand-built and live-verified against the real deployment; nothing
here ships as a task without a human reading it first.
