import { task } from "@trigger.dev/sdk";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Eval 52: cross-step causal consistency. Task A writes external state keyed
// by a shared id; task B, triggered immediately after A resolves, reads it.
// Probes for the CausalMesh (VLDB 2025) failure mode: a downstream step
// observing stale/missing state written by an upstream step. NOTE: on a
// single-node self-hosted instance (our topology) there's no cross-machine
// cache to go stale, so this eval is expected to trivially pass here -- it's
// included for completeness and because the assumption ("single node, no
// staleness possible") is itself worth stating explicitly, not assuming.
const STATE_DIR = path.join(tmpdir(), "trigger-eval-consistency");
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

export const consistencyWriter = task({
  id: "eval-52-consistency-writer",
  run: async (payload: { key: string; value: string }) => {
    writeFileSync(path.join(STATE_DIR, `${payload.key}.json`), JSON.stringify({ value: payload.value, writtenAt: Date.now() }));
    return { key: payload.key, written: true };
  },
});

export const consistencyReader = task({
  id: "eval-52-consistency-reader",
  run: async (payload: { key: string; expectedValue: string }) => {
    const filePath = path.join(STATE_DIR, `${payload.key}.json`);
    if (!existsSync(filePath)) {
      return { key: payload.key, found: false, matches: false };
    }
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    return { key: payload.key, found: true, matches: data.value === payload.expectedValue, readValue: data.value };
  },
});

// Eval 51: replay determinism. A deterministic task (pure function of
// payload) whose /replay-triggered re-execution should produce byte-identical
// output. Also records a file-based execution counter so we can confirm
// /replay genuinely re-executes the task body (a new attempt happens) rather
// than returning a cached result.
const EXEC_COUNT_DIR = path.join(tmpdir(), "trigger-eval-replay");
if (!existsSync(EXEC_COUNT_DIR)) mkdirSync(EXEC_COUNT_DIR, { recursive: true });

export const deterministicComputation = task({
  id: "eval-51-deterministic-computation",
  run: async (payload: { seed: number; label: string }) => {
    const countFile = path.join(EXEC_COUNT_DIR, `${payload.label}.count`);
    const prevCount = existsSync(countFile) ? Number(readFileSync(countFile, "utf-8")) : 0;
    writeFileSync(countFile, String(prevCount + 1));

    // Pure, deterministic computation of the payload -- no Date.now()/Math.random.
    let hash = 0;
    const str = `${payload.seed}-${payload.label}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return { computedHash: hash, executionNumber: prevCount + 1 };
  },
});
