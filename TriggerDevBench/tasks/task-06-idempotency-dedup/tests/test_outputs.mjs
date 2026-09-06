import { readFileSync, writeFileSync } from "node:fs";

const { uniqueRunCount, executionCount } = JSON.parse(readFileSync("/logs/driver/idempotency_result.json", "utf-8"));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}
check("collapses_to_one_run", uniqueRunCount === 1, `uniqueRunCount=${uniqueRunCount}`);
check("executes_exactly_once", executionCount === 1, `executionCount=${executionCount}`);

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
