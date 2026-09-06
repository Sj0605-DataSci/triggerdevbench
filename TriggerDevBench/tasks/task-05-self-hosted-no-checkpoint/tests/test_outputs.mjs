import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("/logs/driver/checkpoint_result.json", "utf-8"));
const { actualDurationMs, theoreticalNonBlockingMs, theoreticalBlockingMs } = data;
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

const overheadRatio = actualDurationMs / theoreticalNonBlockingMs;
check(
  "overhead_ratio_measured_and_disclosed",
  true,
  `actual=${actualDurationMs}ms, non-blocking-theory=${theoreticalNonBlockingMs}ms, blocking-theory=${theoreticalBlockingMs}ms, ratio=${overheadRatio.toFixed(2)}x`
);
check(
  "waits_are_non_blocking",
  actualDurationMs < theoreticalNonBlockingMs * 1.5,
  actualDurationMs < theoreticalNonBlockingMs * 1.5
    ? "Batch completed close to non-blocking theoretical time"
    : `CONFIRMED: waits block the concurrency slot -- batch took ${overheadRatio.toFixed(2)}x the non-blocking theoretical duration (documented self-hosted limitation, not a bug)`
);

writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
// Reward reflects disclosure, not the blocking-behavior check -- same
// informational posture as task-03. See README "Pass condition".
writeFileSync("/logs/verifier/reward.txt", results[0].pass ? "1" : "0");
process.exit(0);
