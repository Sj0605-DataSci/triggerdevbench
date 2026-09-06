import { task } from "@trigger.dev/sdk";

// Eval 12: realtime status delivery under concurrent load.
export const realtimeProbe = task({
  id: "eval-12-realtime-probe",
  run: async (payload: { index: number; workMs: number }) => {
    await new Promise((r) => setTimeout(r, payload.workMs));
    return { index: payload.index };
  },
});
