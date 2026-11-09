import {applicationEventSchema,preparationSnapshotSchema,parseCompletenessResult,processingQuestionSchema,compareRevisions,
  type ApplicationEvent,type PreparationSnapshot,type ProcessingResult} from '../preparation/protocol';

type RunEvent=Extract<ApplicationEvent,{schemaVersion:'processing-event.v1'}>;
export type ProcessingCard={runId:string;artifactId:string|null;runRevision:string;state:RunEvent['state'];
  result:ProcessingResult|null;current:boolean;question:Extract<RunEvent,{type:'run.needs_input'}>['data']['question'];
  requiredActor:'borrower'|'lender'|'operator'|null;detail:string|null};
type Question=ReturnType<typeof processingQuestionSchema.parse>;
export type ProcessingProjection={eventIds:string[];currentResult:ProcessingResult|null;questions:Question[];snapshot:PreparationSnapshot;cursor:string;cards:Record<string,ProcessingCard>;
  summaryKeys:string[];summaries:{artifactId:string|null;resultId:string;resultRevision:string;text:string;findings:{requirementId:string;assessment:string;explanations:string[];gaps:ProcessingResult['requirements'][number]['gaps']}[]}[];resyncRequired:boolean};
export function initialProcessingProjection(value:unknown):ProcessingProjection {
  const snapshot=preparationSnapshotSchema.parse(value);
  return {eventIds:[],currentResult:null,questions:[],snapshot,cursor:snapshot.cursor,cards:{},summaryKeys:[],summaries:[],resyncRequired:false};
}
/** A transport page is serialized against the previously persisted opaque cursor.
 * Event revisions order projections, never cursor strings or equality fingerprints.
 * hydrate must reauthorize and load the exact immutable result revision. */
export async function consumeProcessingPage(current:ProcessingProjection,expectedCursor:string,events:unknown[],nextCursor:string,
  hydrate:(id:string,revision:string)=>Promise<unknown>):Promise<ProcessingProjection> {
  if(current.cursor!==expectedCursor)return current; // late response from an abandoned poll
  if(!nextCursor||nextCursor.length>256)throw new Error('Invalid application cursor');
  const next=structuredClone(current);
  for(const raw of events) {
    const event=applicationEventSchema.parse(raw);
    if(event.applicationId!==next.snapshot.applicationId)throw new Error('Wrong application event');
    if(next.eventIds.includes(event.eventId))continue;
    next.eventIds.push(event.eventId);
    if(event.schemaVersion==='preparation-invalidation.v1') {
      if(event.preparationId!==next.snapshot.preparationId)throw new Error('Wrong preparation event');
      if(compareRevisions(event.preparationRevision,next.snapshot.preparationRevision)<=0)continue;
      next.snapshot.preparationRevision=event.preparationRevision;
      next.currentResult=null;next.questions=[];
      next.snapshot.currentResultRef=null;next.snapshot.currentReadinessRef=null;next.resyncRequired=true;
      for(const card of Object.values(next.cards)){card.current=false;card.question=null;}
      continue;
    }
    const prior=next.cards[event.runId];
    if(prior&&compareRevisions(event.runRevision,prior.runRevision)<=0)continue;
    if(prior&&prior.artifactId!==event.artifactId)throw new Error('Run changed its display anchor');
    if(event.type==='run.accepted'&&event.data.preparationId!==next.snapshot.preparationId)throw new Error('Wrong preparation receipt');
    const card:ProcessingCard={runId:event.runId,artifactId:event.artifactId,runRevision:event.runRevision,state:event.state,
      result:prior?.result??null,current:prior?.current??false,question:null,requiredActor:null,detail:null};
    if(event.type==='run.progress')card.detail=event.data.activityCode;
    if(event.type==='run.needs_input') {
      if(event.data.question&&event.data.question.preparationId!==next.snapshot.preparationId)throw new Error('Wrong preparation question');
      card.question=event.data.question;card.requiredActor=event.data.requiredActor;card.detail=event.data.reasonCode;
    }
    if(event.type==='run.failed'||event.type==='run.cancelled'||event.type==='run.superseded')card.detail=event.data.reasonCode;
    if(event.type==='run.superseded')card.current=false;
    if(event.type==='run.result_committed') {
      const result=parseCompletenessResult(await hydrate(event.data.resultId,event.data.resultRevision));
      if(result.applicationId!==event.applicationId||result.preparationId!==next.snapshot.preparationId||
        result.resultId!==event.data.resultId||result.resultRevision!==event.data.resultRevision||result.inputFingerprint!==event.inputFingerprint||
        result.coverageRef.id!==event.data.coverageRef.id||result.coverageRef.revision!==event.data.coverageRef.revision)
        throw new Error('Result does not match the committed reference');
      if('readiness' in result)throw new Error('Submission readiness is disabled in this chat release');
      if(prior?.result?.resultId===result.resultId&&compareRevisions(result.resultRevision,prior.result.resultRevision)<0)throw new Error('Result revision moved backwards');
      card.result=result;
      card.current=result.freshness==='current'&&!next.resyncRequired&&result.preparationRevision===next.snapshot.preparationRevision;
      if(card.current){next.currentResult=result;next.snapshot.currentResultRef={id:result.resultId,revision:result.resultRevision};}
      if(event.data.terminal&&card.current) {
        // Reused findings on a successor do not create another completion summary.
        const key=JSON.stringify([card.artifactId??card.runId,result.dependencyFingerprint,result.requirements,result.limitations,result.conflicts]);
        if(!next.summaryKeys.includes(key)) {
          next.summaryKeys.push(key);
          const counts={appears_complete:0,incomplete:0,unknown:0};
          for(const r of result.requirements)counts[r.assessment]++;
          next.summaries.push({artifactId:card.artifactId,resultId:result.resultId,resultRevision:result.resultRevision,findings:result.requirements.map(r=>({requirementId:r.requirementId,assessment:r.assessment,explanations:r.checks.map(c=>c.explanation),gaps:r.gaps})),
            text:`Document checks: ${counts.appears_complete} appear complete, ${counts.incomplete} incomplete, ${counts.unknown} uncertain. ${result.limitations.length} limitations and ${result.conflicts.length} conflicts remain. These findings are not lender acceptance.`});
        }
      }
    }
    next.cards[event.runId]=card;
  }
  next.cursor=nextCursor;
  return next;
}
/** Cursor expiry cannot be repaired by guessing event order. The authorized
 * snapshot is the resync boundary; preserve only explicitly current result refs. */
export function resyncProcessingProjection(current:ProcessingProjection,value:unknown):ProcessingProjection {
  const snapshot=preparationSnapshotSchema.parse(value);
  if(snapshot.applicationId!==current.snapshot.applicationId||snapshot.preparationId!==current.snapshot.preparationId)throw new Error('Wrong resync scope');
  if(compareRevisions(snapshot.preparationRevision,current.snapshot.preparationRevision)<0)throw new Error('Snapshot revision moved backwards');
  const next=structuredClone(current);next.snapshot=snapshot;next.cursor=snapshot.cursor;next.resyncRequired=false;next.questions=[];next.currentResult=null;
  for(const card of Object.values(next.cards)) {
    card.question=null;
    card.current=card.result?.freshness==='current'&&card.result.preparationRevision===snapshot.preparationRevision&&
      card.result.resultId===snapshot.currentResultRef?.id&&card.result.resultRevision===snapshot.currentResultRef.revision;
  }
  return next;
}

/** Initial/reconnect hydration is reference-driven, not an empty card map at a
 * high-water cursor. Active-run/card restoration additionally needs the runtime's
 * authorized run snapshot API; never invent private run IDs from result refs. */
export async function hydrateProcessingSnapshot(value:unknown,
  loadResult:(id:string,revision:string)=>Promise<unknown>,
  loadQuestion:(id:string,revision:string)=>Promise<unknown>,
  persisted?:ProcessingProjection):Promise<ProcessingProjection> {
  const next=persisted?resyncProcessingProjection(persisted,value):initialProcessingProjection(value);
  const snapshot=next.snapshot;
  if(snapshot.currentResultRef) {
    const ref=snapshot.currentResultRef;
    const result=parseCompletenessResult(await loadResult(ref.id,ref.revision));
    if(result.applicationId!==snapshot.applicationId||result.preparationId!==snapshot.preparationId||
      result.preparationRevision!==snapshot.preparationRevision||result.resultId!==ref.id||result.resultRevision!==ref.revision||
      result.freshness!=='current'||'readiness' in result)throw new Error('Invalid current completeness result');
    next.currentResult=result;
  }
  for(const ref of snapshot.questionRefs) {
    const question=processingQuestionSchema.parse(await loadQuestion(ref.id,ref.revision));
    if(question.preparationId!==snapshot.preparationId||question.questionId!==ref.id||question.questionRevision!==ref.revision)
      throw new Error('Invalid current question reference');
    next.questions.push(question);
  }
  return next;
}
