import { readFileSync, writeFileSync } from "node:fs";

const { status, attemptCount, wallMs, failFirstNAttempts } = JSON.parse(readFileSync("/logs/driver/backoff_result.json", "utf-8"));
const expectedMinMs = [1000, 2000, 4000].slice(0, failFirstNAttempts).reduce((a, b) => a + b, 0);
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}
check("completed", status === "COMPLETED", `status=${status}`);
check("correct_attempt_count", attemptCount === failFirstNAttempts + 1, `attemptCount=${attemptCount}, expected=${failFirstNAttempts + 1}`);
check("backoff_timing_real", wallMs >= expectedMinMs * 0.5, `wallMs=${wallMs}, expectedMin=${expectedMinMs}`);

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
