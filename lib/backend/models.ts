/** Explicit allowlist: no silent fallback or arbitrary model with guessed prices.
 * USD per million text tokens, checked against OpenRouter's models API 2026-11-07.
 * https://openrouter.ai/api/v1/models — update these ceilings before price changes.
 */
export const MODEL_PROFILES:Readonly<Record<string,{input:number;output:number}>>=Object.freeze({
  'google/gemini-2.5-flash-lite':{input:0.10,output:0.40},
  'google/gemini-2.5-flash':{input:0.30,output:2.50},
});
export function configuredModel(){return process.env.OPENROUTER_MODEL?.trim()||'google/gemini-2.5-flash';}
