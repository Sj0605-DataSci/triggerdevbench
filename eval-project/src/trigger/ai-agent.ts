import { task, logger } from "@trigger.dev/sdk";

// Eval 22: long-running AI-agent task calling a local Nemotron model via
// Ollama on each "step" for several minutes. Verifies Trigger.dev imposes no
// platform timeout on a genuinely long task (their core "no timeouts" claim).
async function callNemotron(prompt: string): Promise<string> {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nemotron-mini", prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = (await res.json()) as { response: string };
  return data.response;
}

export const longRunningAgent = task({
  id: "eval-22-long-running-agent",
  maxDuration: 1800,
  run: async (payload: { steps: number; delayBetweenStepsMs: number }) => {
    const stepResults: { step: number; tookMs: number }[] = [];
    for (let i = 0; i < payload.steps; i++) {
      const start = Date.now();
      await callNemotron(
        `You are step ${i + 1} of ${payload.steps} in an autonomous agent loop. ` +
          `Reply with a one-sentence plan for the next step.`
      );
      stepResults.push({ step: i + 1, tookMs: Date.now() - start });
      logger.info(`Completed step ${i + 1}/${payload.steps}`);
      await new Promise((r) => setTimeout(r, payload.delayBetweenStepsMs));
    }
    return { totalSteps: payload.steps, stepResults };
  },
});
