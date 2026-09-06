# TriggerDevBench

TriggerDevBench measures how well Trigger.dev's self-hosted platform holds up
under the exact conditions its own documentation, community reports, and source
code say it should handle correctly. Each task drops a fixed, deterministic
driver into a real self-hosted deployment with a reliability scenario -- a
deploy-drift trigger, a cancel-mid-execution, a webhook burst, a real process
kill -- and scores whether the platform's observable behavior matches its
claimed guarantees.

This project follows the same task-directory conventions as
[ITSMBench](https://github.com/new-measure/ITSMBench) (task.toml schema,
instruction.md, README.md narrative, environment/, tests/ verifier with a
reward.txt convention), adapted for benchmarking a platform's own reliability
rather than an LLM agent's judgment -- see `shared/README.md` for the
adaptation and why there's no `-a`/`-m` agent/model selection here.

## Getting started

### Prerequisites

- Docker + Docker Compose
- Node.js 20+
- A clone of [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev) alongside this repo (self-hosted stack source)

### Setup

See `shared/README.md` for spinning up the shared self-hosted Trigger.dev
deployment every task runs against.

## Run one task

```bash
set -a && source .env && set +a

TASK=task-01-pending-version-stuck-run
node "tasks/$TASK/driver/run.mjs"
bash "tasks/$TASK/tests/test.sh"
cat "tasks/$TASK/../logs/verifier/reward.txt" 2>/dev/null || cat /logs/verifier/reward.txt
```

(A thin `harbor.local`-style runner script that wires `/logs/driver` and
`/logs/verifier` paths per task is the natural next step if this benchmark
needs to run outside a single shared host -- not included yet since every task
so far has run directly against one long-lived self-hosted instance.)

## Tasks

| Task | What it tests | Result |
|---|---|---|
| [task-01](tasks/task-01-pending-version-stuck-run) | Trigger a task id no worker will ever register | **FAIL** -- stuck in `PENDING_VERSION` past its own TTL, confirmed gap in Trigger.dev's own test suite |
| [task-02](tasks/task-02-cancel-hard-kill) | Cancel mid-execution, check for cooperative cleanup | **FAIL** (as designed) -- 0/5 trials show any cleanup output; confirmed deterministic hard-kill |
| [task-03](tasks/task-03-naive-sender-burst-loss) | Webhook burst from a non-retrying sender | **Load-dependent**: 0% loss isolated, 86.5% loss under concurrent background traffic -- disclosed, not gated |
| [task-04](tasks/task-04-executing-crash-recovery) | Real SIGKILL of the worker mid-execution | **PASS** -- resolves in exactly the claimed 300s SLA, no worker reconnect required |
| [task-05](tasks/task-05-self-hosted-no-checkpoint) | Concurrency-slot cost of self-hosted's missing CRIU checkpoint support | **Confirmed**: waits hold their slot for the full duration (~2x theoretical time for a 4-item/2-slot batch), matching documented Cloud-only checkpointing |
| [task-06](tasks/task-06-idempotency-dedup) | `idempotencyKey` under a true concurrent race | **PASS** -- 5 concurrent triggers collapse to 1 run, 1 execution |
| [task-07](tasks/task-07-retry-backoff-timing) | Exponential backoff wall-clock timing | **PASS** -- real delays between attempts, matching configured curve |
| [task-08](tasks/task-08-wildcard-concurrency-starvation) | Wildcard concurrency key vs. queue fairness (regression check) | **PASS** -- no starvation of unrelated keys |
| [task-09](tasks/task-09-replay-determinism) | `/replay` re-execution and output determinism | **PASS** -- genuine re-execution, byte-identical output for a pure task |
| [task-10](tasks/task-10-oversized-payload) | 4MB payload handling | **PASS** -- clean HTTP 413 rejection, no hang/truncation |

## Methodology notes

- Every finding here was independently verified against the Trigger.dev source
  (cloned locally) before being written up -- claimed SLAs are cited to exact
  environment-variable defaults, not estimated.
- task-02 follows a repeated-trial (N=5) design per "Beyond pass@1: A
  Reliability Science Framework for Long-Horizon LLM Agents" (2026) rather than
  a single-shot pass/fail, since crash/cancel/race-condition behavior can be
  timing-dependent.
- task-04 is deliberately included alongside task-01's failure so the
  benchmark's overall picture stays honest in both directions, the same way
  ITSMBench reports "73/89 tasks solved, no model solved all" rather than only
  publicizing failures.

## Limitations

- **Single-node topology.** All tasks run against one self-hosted instance on
  one host. Cross-machine consistency failure modes (see task-05, cross-step
  causal consistency, in `eval-project/harness/evals.mjs`) are structurally
  untestable here and would need a real multi-node/clustered deployment.
- **Ten tasks, not a full suite.** This is a slice of a much larger candidate
  list (50+ long-running and adversarial scenarios are scoped in project notes
  but not yet built into this task format).
- **Result variance.** task-03 demonstrated that at least one result depends on
  concurrent background load at test time, not just the scenario itself --
  worth keeping in mind when interpreting any single run of this suite as a
  fixed score rather than a range.
- **No agent/model axis.** Unlike ITSMBench, there is nothing to compare across
  models or harnesses here -- every task has exactly one outcome per platform
  version, not a distribution across agents.

## License

MIT.
