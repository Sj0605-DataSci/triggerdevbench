import { task } from "@trigger.dev/sdk";

// Eval 03: webhook burst -> data loss. Simulates a Stripe-style webhook
// receiver hammered with individual (non-batch) trigger calls in a tight
// ramp, checking none are silently dropped (mirrors the r/selfhosted v2
// "stuck webhooks under load" complaint).
export const webhookReceiver = task({
  id: "eval-03-webhook-receiver",
  run: async (payload: { eventId: string; index: number }) => {
    return { eventId: payload.eventId, index: payload.index, receivedAt: Date.now() };
  },
});
