import { readFileSync, writeFileSync } from "node:fs";

const { originalRunId, replayedRunId, originalHash, replayedHash, executionNumber } = JSON.parse(
  readFileSync("/logs/driver/replay_result.json", "utf-8")
);
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}
check("replay_creates_new_run", replayedRunId !== originalRunId, `${originalRunId} vs ${replayedRunId}`);
check("genuinely_re_executed", executionNumber === 2, `executionNumber=${executionNumber}`);
check("output_deterministic", originalHash === replayedHash, `${originalHash} vs ${replayedHash}`);

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
