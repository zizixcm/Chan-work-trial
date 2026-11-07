import "server-only";
import { Agent } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";

export function aiConfiguration() {
  return {
    configured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    model: process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash-lite",
  };
}

// A connection probe only: no document access, tools, memory, or checklist writes.
export async function checkAiConnection() {
  const { configured, model } = aiConfiguration();
  if (!configured) throw new Error("AI_KEY_MISSING");
  const agent = new Agent({
    id: "openrouter-connection",
    name: "OpenRouter connection check",
    instructions: "You are checking an API connection. Reply briefly to the sample message. You have no access to borrower documents.",
    model: `openrouter/${model}`,
  });
  agent.__setLogger(noopLogger);
  const result = await agent.generate("This is a synthetic connection check. Reply with: Connection successful.", {
    maxSteps: 1,
    abortSignal: AbortSignal.timeout(30_000),
    modelSettings: { maxOutputTokens: 64, maxRetries: 0 },
  });
  if (!result.text.trim()) throw new Error("AI_EMPTY_RESPONSE");
  return { model, message: result.text };
}
