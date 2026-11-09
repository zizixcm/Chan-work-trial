import type {TracingOptions,TracingContext} from '@mastra/core/observability';
import type {Correlation,TraceRef} from '../evaluation-observability';
/** Server-only tracing metadata; never part of the model prompt or tool input. */
export interface AgentExecutionContext {
 correlation:Correlation;
 /** Provisional cumulative borrower reply only; the durable result remains authoritative. */
 onReplyText?:(text:string)=>Promise<void>;
 parent?:TraceRef;
 recordTrace?:(trace:TraceRef)=>Promise<void>;
 tracingOptions?:TracingOptions;
 tracingContext?:TracingContext;
}
