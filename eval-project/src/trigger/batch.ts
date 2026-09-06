import { task } from "@trigger.dev/sdk";

// Eval 21: batch/bulk ingestion — fire a large batch.triggerAndWait and check
// none of the items are dropped/lost and all return correct output.
export const batchItem = task({
  id: "eval-21-batch-item",
  run: async (payload: { index: number }) => {
    return { index: payload.index, squared: payload.index * payload.index };
  },
});
