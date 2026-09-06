import { readFileSync, writeFileSync } from "node:fs";

const { maxWaitMs, statuses } = JSON.parse(readFileSync("/logs/driver/wildcard_result.json", "utf-8"));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}
check("all_completed", statuses.length === 3 && statuses.every((s) => s === "COMPLETED"), `statuses=${JSON.stringify(statuses)}`);
check("no_starvation", maxWaitMs < 4000, `maxWaitMs=${maxWaitMs} (wildcard hog holds for 6000ms)`);

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
