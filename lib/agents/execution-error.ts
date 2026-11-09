/** A completed generation can fail locally after its provider cost is known.
 * Keep that accounting distinct from an unknown provider outcome. */
export class AgentExecutionError extends Error {
 constructor(readonly reasonCode:'tool_or_validation_limit'|'invalid_model_output',readonly actualMicros:number|null,cause:unknown){
  super(cause instanceof Error?cause.message:'Agent action could not be completed',{cause});
  this.name='AgentExecutionError';
 }
}
