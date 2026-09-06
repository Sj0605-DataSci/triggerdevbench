import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const API_URL = process.env.TRIGGER_API_URL ?? "http://localhost:8030";
const SECRET_KEY = process.env.TRIGGER_SECRET_KEY;
const N = 200;

const eventIds = Array.from({ length: N }, () => randomUUID());
const results = await Promise.allSettled(
  eventIds.map(async (eventId, index) => {
    const res = await fetch(`${API_URL}/api/v1/tasks/eval-03-webhook-receiver/trigger`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { eventId, index } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
);

const accepted = results.filter((r) => r.status === "fulfilled").length;
const rejected = results.filter((r) => r.status === "rejected").length;

writeFileSync(
  "/logs/driver/burst_result.json",
  JSON.stringify({ total: N, accepted, rejected, lossRate: rejected / N }, null, 2)
);
console.log(`${accepted}/${N} accepted, ${rejected}/${N} rejected (loss rate ${((rejected / N) * 100).toFixed(1)}%)`);
