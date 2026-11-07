import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { ProviderTransport } from './provider-executor';
import { AnalysisFailure } from './failures';

/** Node-only transport. No Next server-only marker: standalone worker imports it.
 * Never import this module from a client component. No memory, tools, fallback
 * agent, content traces or SDK retry loop are configured. */
export const mastraTransport: ProviderTransport = {
  async generate({instructions, prompt, outputSchema, budget, signal}) {
    if (!process.env.OPENROUTER_API_KEY?.trim()) throw new AnalysisFailure('configuration_required');
    const agent = new Agent({
      id: 'document-analysis', name: 'Document analysis', instructions,
      model: `openrouter/${budget.model}`,
    });
    agent.__setLogger(noopLogger);
    const options = {
      maxSteps: 1, abortSignal: signal,
      modelSettings: {maxOutputTokens: budget.maxOutputTokens, maxRetries: 0, temperature: 0},
    };
    const result = outputSchema
      ? await agent.generate(prompt, {...options, structuredOutput: {schema: outputSchema, jsonPromptInjection: false, errorStrategy: 'strict'}})
      : await agent.generate(prompt, options);
    // Mastra can return an error alongside its full output instead of throwing.
    if (result.error) throw result.error;
    if (result.finishReason === 'length' || result.tripwire || result.usedFallbackValue) {
      throw new AnalysisFailure('invalid_output');
    }
    // Native structured output may supply object without text. Preserve the
    // actual text when present; do not strip Markdown or repair invalid JSON.
    return {text: result.text || (outputSchema && result.object ? JSON.stringify(result.object) : ''), usage: result.totalUsage};
  },
};
