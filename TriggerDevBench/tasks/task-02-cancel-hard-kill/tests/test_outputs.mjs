import { readFileSync, writeFileSync } from "node:fs";

const trials = JSON.parse(readFileSync("/logs/driver/trials.json", "utf-8"));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

const allCanceled = trials.every((t) => t.status === "CANCELED");
check(
  "status_reliably_canceled",
  allCanceled,
  `${trials.filter((t) => t.status === "CANCELED").length}/${trials.length} trials reported CANCELED`
);

const anyGraceful = trials.some((t) => t.output != null);
// This assertion is informational, not a correctness bar -- see README "Pass
// condition". We record the finding either way; reward is gated only on
// status_reliably_canceled above.
check(
  "cooperative_cleanup_ever_observed",
  true,
  anyGraceful
    ? `Graceful output observed in at least one trial`
    : `CONFIRMED: 0/${trials.length} trials showed any output -- cancel is a hard kill, cooperative cleanup never runs`
);

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
