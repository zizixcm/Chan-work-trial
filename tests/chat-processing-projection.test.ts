import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProcessingProjection,consumeProcessingPage,resyncProcessingProjection,hydrateProcessingSnapshot} from '../lib/borrower-chat/processing-projection';
import {prepareQuestionAction} from '../lib/borrower-chat/question-actions';
const hash='a'.repeat(64);
const snapshot={schemaVersion:'preparation-snapshot.v1',applicationId:'app',preparationId:'prep',preparationRevision:'1',cursor:'opaque-start',currentResultRef:null,currentReadinessRef:null,obligations:[{id:'need',owner:'borrower',status:'open',resumeTrigger:'evidence'}],questionRefs:[],budget:{limitMicros:10000,knownMicros:0,reservedMicros:0,unknownCost:false}};
const result={schemaVersion:'processing-result.v1',applicationId:'app',resultId:'result',resultRevision:'10',preparationId:'prep',preparationRevision:'1',inputFingerprint:hash,dependencyFingerprint:hash,freshness:'current',assessmentScope:'affected_requirements',documents:[],requirements:[{requirementId:'r',definitionRevision:'d',evidenceRevision:'e',assessment:'unknown',checks:[],gaps:[]}],coverageRef:{id:'coverage',revision:'1'},citations:[],limitations:[],conflicts:[],allowedNextActions:[]};
const event={schemaVersion:'processing-event.v1',eventId:'event',applicationId:'app',cursor:'opaque-end',runId:'run',runRevision:'10',artifactId:'card',occurredAt:'2026-11-07T00:00:00Z',inputFingerprint:hash,type:'run.result_committed',state:'partial',data:{terminal:true,resultId:'result',resultRevision:'10',coverageRef:{id:'coverage',revision:'1'}}};
test('shared schemas hydrate exact revisions and summarize settled findings once',async()=>{
  let count=0;
  const hydrate=async(id:string,revision:string)=>{count++;assert.equal(id,'result');assert.equal(revision,'10');return result;};
  const first=await consumeProcessingPage(initialProcessingProjection(snapshot),'opaque-start',[event],'opaque-end',hydrate);
  assert.equal(first.cards.run.current,true);assert.equal(first.summaries.length,1);assert.match(first.summaries[0].text,/1 uncertain/);
  const replay=await consumeProcessingPage(first,'opaque-end',[event,{...event,eventId:'older',runRevision:'9'}],'another-cursor',hydrate);
  assert.equal(count,1);assert.equal(replay.cards.run.runRevision,'10');assert.equal(replay.summaries.length,1);
  assert.equal(await consumeProcessingPage(replay,'opaque-start',[event],'old',hydrate),replay,'late poll discarded by expected cursor');
});
test('invalidation needs no fabricated run and suppresses late current results',async()=>{
  const first=await consumeProcessingPage(initialProcessingProjection(snapshot),'opaque-start',[event],'opaque-end',async()=>result);
  const invalidation={schemaVersion:'preparation-invalidation.v1',type:'application.preparation_invalidated',eventId:'invalidate',applicationId:'app',cursor:'invalidate-cursor',occurredAt:'2026-11-07T00:00:01Z',preparationId:'prep',preparationRevision:'2',affectedResultRefs:[{id:'result',revision:'10'}],affectedRequirementIds:['r'],reasonCode:'evidence_changed'};
  const next=await consumeProcessingPage(first,'opaque-end',[invalidation,{...event,eventId:'late',runRevision:'11'}],'new',async()=>result);
  assert.equal(next.cards.run.current,false);assert.equal(next.resyncRequired,true);assert.equal(next.summaries.length,1);
  const reset=resyncProcessingProjection(next,{...snapshot,preparationRevision:'2',cursor:'resync'});
  assert.equal(reset.cards.run.current,false);assert.equal(reset.cursor,'resync');
});
test('wrong scope, revision hydration and display anchor changes fail closed',async()=>{
  for(const altered of [{...result,resultRevision:'11'},{...result,applicationId:'private'},{...result,preparationId:'private'}])
    await assert.rejects(consumeProcessingPage(initialProcessingProjection(snapshot),'opaque-start',[event],'end',async()=>altered));
  const first=await consumeProcessingPage(initialProcessingProjection(snapshot),'opaque-start',[event],'end',async()=>result);
  await assert.rejects(consumeProcessingPage(first,'end',[{...event,eventId:'changed-anchor',runRevision:'11',artifactId:'different'}],'next',async()=>result));
  await assert.rejects(consumeProcessingPage(first,'end',[{...event,applicationId:'private'}],'next',async()=>result));
});
const question={schemaVersion:'processing-question.v1',questionId:'q',questionRevision:'10',preparationId:'prep',dependencyFingerprint:hash,affectedRequirementIds:['r'],requiredActor:'borrower',blocking:true,prompt:'Which account?',answerSchema:{kind:'attributed_text',maxLength:100},allowedActionIds:['answer']};
const input={questionId:'q',expectedQuestionRevision:'10',actionId:'answer',clientActionId:'reply',answer:'Business account'};
test('question actions preserve assertions, reject stale input, and separate mapping confirmation',()=>{
  assert.equal(prepareQuestionAction(question,hash,input).kind,'record_assertion');
  assert.throws(()=>prepareQuestionAction(question,hash,{...input,expectedQuestionRevision:'9'}),{status:409});
  assert.throws(()=>prepareQuestionAction(question,'b'.repeat(64),input),{status:409});
  assert.throws(()=>prepareQuestionAction({...question,requiredActor:'operator'},hash,input),{status:403});
  assert.throws(()=>prepareQuestionAction(question,hash,{...input,documentId:'forged'}),{status:400});
  const confirmed=prepareQuestionAction({...question,answerSchema:{kind:'link_confirmation',documentId:'d',requirementId:'r'}},hash,{...input,answer:false});
  assert.equal(confirmed.kind,'confirm_link');assert.equal(confirmed.kind==='confirm_link'&&confirmed.confirmed,false);
});

test('reconnect hydrates exact application completeness and pending question refs without replaying events',async()=>{
  const restored=await hydrateProcessingSnapshot({...snapshot,currentResultRef:{id:'result',revision:'10'},questionRefs:[{id:'q',revision:'10'}]},
    async(id,revision)=>{assert.equal(id,'result');assert.equal(revision,'10');return {...result,assessmentScope:'application'};},
    async(id,revision)=>{assert.equal(id,'q');assert.equal(revision,'10');return question;});
  assert.equal(restored.currentResult?.assessmentScope,'application');assert.equal(restored.questions[0].questionId,'q');
  await assert.rejects(hydrateProcessingSnapshot({...snapshot,questionRefs:[{id:'q',revision:'10'}]},async()=>result,async()=>({...question,questionRevision:'9'})));
});
