import { task } from "@trigger.dev/sdk";

export const smokeTest = task({
  id: "eval-00-smoke-test",
  run: async (payload: { message: string }) => {
    return { echoed: payload.message, ranAt: new Date().toISOString() };
  },
});
