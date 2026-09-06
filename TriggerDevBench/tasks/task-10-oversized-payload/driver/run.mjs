import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const bigData = "x".repeat(4 * 1024 * 1024);

const res = await fetch(`${API_URL}/api/v1/tasks/eval-28-payload-echo/trigger`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ payload: { data: bigData } }),
});
const httpStatus = res.status;
const bodyText = await res.text();

let runResult = null;
if (httpStatus === 200) {
  const { id } = JSON.parse(bodyText);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    runResult = await fetch(`${API_URL}/api/v3/runs/${id}`, { headers: { Authorization: `Bearer ${SECRET_KEY}` } }).then((r) => r.json());
    if (runResult.status === "COMPLETED") break;
    await new Promise((r) => setTimeout(r, 500));
  }
}

writeFileSync(
  "/logs/driver/payload_result.json",
  JSON.stringify(
    { httpStatus, bodyText: bodyText.slice(0, 300), payloadSize: bigData.length, receivedLength: runResult?.output?.receivedLength, runStatus: runResult?.status },
    null,
    2
  )
);
console.log(`httpStatus=${httpStatus}, bodyText=${bodyText.slice(0, 100)}`);
