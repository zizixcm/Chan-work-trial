/** Reviewed pilot configuration. Reservation covers the whole multimodal context,
 * not an estimated image token count; total application/batch caps are separate. */
export const PILOT_MODEL = Object.freeze({
 id: 'google/gemini-3.8-flash',
 nativeId: 'openrouter/google/gemini-3.8-flash',
 contextTokens: 1048576,
 outputTokens: 24000,
 reasoningEffort: 'low',
 promptPerMillion: 1,
 completionPerMillion: 5,
 reservationMicros: 1200000,
});
