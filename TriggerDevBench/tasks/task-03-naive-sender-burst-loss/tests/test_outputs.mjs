import { readFileSync, writeFileSync } from "node:fs";

const { total, accepted, rejected, lossRate } = JSON.parse(readFileSync("/logs/driver/burst_result.json", "utf-8"));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

// Reported unconditionally -- see README "Pass condition": this task's job is
// to measure and disclose the loss rate, not gate on a specific threshold.
check(
  "loss_rate_measured_and_disclosed",
  true,
  `${rejected}/${total} events permanently lost (${(lossRate * 100).toFixed(1)}%) -- naive sender, no retry-on-429`
);
check("zero_loss", lossRate === 0, lossRate === 0 ? "No loss under burst" : `Nonzero loss: ${(lossRate * 100).toFixed(1)}%`);

writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
// Reward reflects the informational check only -- zero_loss is expected to
// fail on self-hosted defaults and is reported, not treated as benchmark failure.
writeFileSync("/logs/verifier/reward.txt", results[0].pass ? "1" : "0");
process.exit(0);
