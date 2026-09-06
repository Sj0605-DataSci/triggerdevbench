import { ALL_EVALS } from "./evals.mjs";
import { rateLimitEvents } from "./lib.mjs";

const results = [];
console.log(`Running ${ALL_EVALS.length} evals against ${process.env.TRIGGER_API_URL}\n`);

for (const evalFn of ALL_EVALS) {
  const start = Date.now();
  try {
    const result = await evalFn();
    result.durationMs = Date.now() - start;
    results.push(result);
    console.log(`${result.pass ? "PASS" : "FAIL"}  [${result.category}] ${result.id} (${result.durationMs}ms)`);
    console.log(`      ${result.reason}\n`);
  } catch (err) {
    const result = {
      id: evalFn.name,
      category: "error",
      pass: false,
      reason: `Threw: ${err.message}`,
      durationMs: Date.now() - start,
    };
    results.push(result);
    console.log(`ERROR [${result.id}] ${err.message}\n`);
  }
}

const passed = results.filter((r) => r.pass).length;
console.log("------------------------------------------------------");
console.log(`${passed}/${results.length} passed`);
if (rateLimitEvents.length > 0) {
  console.log(`NOTE: hit the API rate limiter ${rateLimitEvents.length}x across the whole run (self-hosted default limit)`);
}

const fs = await import("node:fs/promises");
await fs.writeFile("harness/results.json", JSON.stringify(results, null, 2));
console.log("Full results written to harness/results.json");

process.exit(passed === results.length ? 0 : 1);
