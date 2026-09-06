import { readFileSync, writeFileSync } from "node:fs";

const { httpStatus, bodyText, payloadSize, receivedLength, runStatus } = JSON.parse(readFileSync("/logs/driver/payload_result.json", "utf-8"));
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

const cleanlyRejected = httpStatus >= 400 && httpStatus < 500;
const succeededIntact = runStatus === "COMPLETED" && receivedLength === payloadSize;
check(
  "clean_rejection_or_intact_success",
  cleanlyRejected || succeededIntact,
  cleanlyRejected ? `Rejected cleanly: HTTP ${httpStatus} "${bodyText}"` : succeededIntact ? `Accepted intact: ${receivedLength} bytes` : `NEITHER: httpStatus=${httpStatus}, runStatus=${runStatus}, receivedLength=${receivedLength} (expected ${payloadSize})`
);

const allPassed = results.every((r) => r.pass);
writeFileSync("/logs/verifier/results.json", JSON.stringify(results, null, 2));
writeFileSync("/logs/verifier/reward.txt", allPassed ? "1" : "0");
process.exit(allPassed ? 0 : 1);
