# Scoreboard

Live results, not aspirational ones — every row below was produced by actually
running its check against a real self-hosted Trigger.dev v4.5.16 deployment. No
mocked responses anywhere in this repo.

Two tiers:

- **TriggerDevBench** (`TriggerDevBench/tasks/`) — the polished, Harbor-format
  suite: `task.toml` + `instruction.md` + `README.md` narrative + `driver/` +
  `tests/` → `reward.txt`. This is the citable, packaged benchmark.
- **Extended eval suite** (`eval-project/harness/`) — the working superset (19
  evals) TriggerDevBench's tasks were drawn from, kept for breadth and for
  evals not yet promoted into the packaged format.

## TriggerDevBench — 10/10 tasks live-verified

| # | Task | Category | Result | Key metric |
|---|---|---|---|---|
| 01 | [pending-version-stuck-run](TriggerDevBench/tasks/task-01-pending-version-stuck-run) | deploy-drift | 🔴 FAIL | Unresolved at T+11:02, past 10m TTL |
| 02 | [cancel-hard-kill](TriggerDevBench/tasks/task-02-cancel-hard-kill) | cancellation | 🔴 FAIL | 0/5 trials show cleanup output |
| 03 | [naive-sender-burst-loss](TriggerDevBench/tasks/task-03-naive-sender-burst-loss) | load | 🟡 DISCLOSED | 0%– 86.5% loss, load-dependent |
| 04 | [executing-crash-recovery](TriggerDevBench/tasks/task-04-executing-crash-recovery) | resilience | 🟢 PASS | 300.06s actual vs. 300.00s claimed SLA |
| 05 | [self-hosted-no-checkpoint](TriggerDevBench/tasks/task-05-self-hosted-no-checkpoint) | capacity-planning | 🟡 DISCLOSED | 41.4s actual vs. 20.0s non-blocking theory |
| 06 | [idempotency-dedup](TriggerDevBench/tasks/task-06-idempotency-dedup) | correctness | 🟢 PASS | 5 concurrent → 1 run, 1 execution |
| 07 | [retry-backoff-timing](TriggerDevBench/tasks/task-07-retry-backoff-timing) | retries | 🟢 PASS | 10.8s actual vs. 7.0s theoretical min |
| 08 | [wildcard-concurrency-starvation](TriggerDevBench/tasks/task-08-wildcard-concurrency-starvation) | concurrency | 🟢 PASS | 1.36s max wait vs. 6.0s hog hold |
| 09 | [replay-determinism](TriggerDevBench/tasks/task-09-replay-determinism) | determinism | 🟢 PASS | Identical hash, genuine re-execution |
| 10 | [oversized-payload](TriggerDevBench/tasks/task-10-oversized-payload) | edge-case | 🟢 PASS | Clean HTTP 413, no truncation |

**6 PASS · 2 FAIL · 2 DISCLOSED** — see each task's `README.md` for the full
narrative and `tests/results.json` for raw verifier output once run.

## Extended eval suite — last full run: 13/17 passed

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
  (see `references/methodology` below) rather than one. The upgraded version —
  `0/5` trials ever show cleanup output — is the one packaged as task-02.

### Cross-step causal consistency (not yet promoted to a numbered task)

20 writer→reader pairs, immediate read-after-write on a single-node topology:
0/20 stale or missing. Expected result on this topology per CausalMesh's
(VLDB'25) failure model — the eval exists mainly so the "no staleness
possible, single node" assumption is verified rather than assumed. A genuine
multi-node self-hosted deployment would be the interesting version of this
test.

## Reproducing this scoreboard

```bash
cd eval-project
set -a && source .env && set +a
node harness/run.mjs                        # extended suite (~15 min, includes an 11-min TTL wait)

cd ../TriggerDevBench
# per task:
node "tasks/task-06-idempotency-dedup/driver/run.mjs"
node "tasks/task-06-idempotency-dedup/tests/test_outputs.mjs"
```

See `TriggerDevBench/shared/README.md` for spinning up the self-hosted stack
these all run against.
