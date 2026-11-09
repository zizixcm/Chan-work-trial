import {AgentExecutionError} from '../lib/agents/execution-error';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createMastraBorrowerPlanner,createMastraInvestigationPlanner} from '../lib/agents/runtime';
import {scriptedAgentTransport} from './fixtures/native-agent-model';
import {createBorrowerPreparationAgent,createDocumentInvestigationAgent} from '../lib/agents/definitions';
test('both agents register native tools and Mastra executes the durable handler',async()=>{
 let calls=0;
 const transport=scriptedAgentTransport('investigate_documents',{goal:'Find the missing month',requirementIds:['r'],documentIds:[],message:'I’ll check the saved statements.'});
 const planner=createMastraBorrowerPlanner(transport);
 const result=await planner.decide({inventory:{requirements:['r']}},AbortSignal.timeout(10000),async action=>{calls++;assert.equal(action.kind,'investigate');return {runId:'persisted-run'};});
 assert.equal(calls,1);assert.equal(result.executed,true);assert.equal(result.action.kind,'investigate');
 const borrower=createBorrowerPreparationAgent({model:transport.model,execute:async()=>({})});
 assert.deepEqual(Object.keys(await borrower.listTools()).sort(),['answer_investigation_question','investigate_documents','reply_to_borrower']);
 const investigator=createDocumentInvestigationAgent({model:transport.model,execute:async()=>({})});
 assert.equal(Object.keys(await investigator.listTools()).length,6);
});
test('investigation receives goal/scope and executes native selective reading',async()=>{
 let sawGoal=false;
 const transport=scriptedAgentTransport('read_evidence',{documentId:'d',pages:[31],mode:'ocr'},value=>{sawGoal=JSON.stringify(value).includes('Find the lease signature');});
 const planner=createMastraInvestigationPlanner(transport);
 const result=await planner.decide({objective:'understand_and_assess',goal:'Find the lease signature',scope:{requirementIds:['r'],documentIds:[]},inventory:{application:{borrowerName:'A',propertyName:'P',address:'A',transactionType:'Refinance'},documents:[],requirements:[],pendingUploads:false},observations:[],mappingProposals:[],assertions:[]},AbortSignal.timeout(10000),async action=>{assert.equal(action.kind,'read_pages');return {observationId:'persisted-observation'};});
 assert.equal(result.executed,true);assert.equal(sawGoal,true);
});
test('native tools propagate backend rejection instead of inventing a successful action',async()=>{
 const planner=createMastraBorrowerPlanner(scriptedAgentTransport('reply_to_borrower',{message:'Hello'}));
 await assert.rejects(planner.decide({},AbortSignal.timeout(10000),async()=>{throw Error('Stale revision');}),error=>error instanceof AgentExecutionError&&error.message==='Stale revision'&&error.reasonCode==='tool_or_validation_limit'&&error.actualMicros===1);
});

test('a confirmed generation with no tool keeps its known cost',async()=>{
 const planner=createMastraBorrowerPlanner({async run(){return {actualMicros:17};}});
 await assert.rejects(planner.decide({},AbortSignal.timeout(10000),async()=>({})),error=>error instanceof AgentExecutionError&&error.reasonCode==='invalid_model_output'&&error.actualMicros===17);
});
test('a provider failure remains an unknown outcome rather than a known tool charge',async()=>{
 const original=Error('Provider disconnected');
 const planner=createMastraBorrowerPlanner({async run(){throw original;}});
 await assert.rejects(planner.decide({},AbortSignal.timeout(10000),async()=>({})),error=>error===original);
});

test('tool failure preserves known streaming usage when transport rejects after consumption',async()=>{
 const base=scriptedAgentTransport('reply_to_borrower',{message:'Hello'});
 const planner=createMastraBorrowerPlanner({...base,async run(...args){await base.run(...args);throw new AgentExecutionError('invalid_model_output',17,Error('Stream finished without a valid result'));}});
 await assert.rejects(planner.decide({},AbortSignal.timeout(10000),async()=>{throw Error('Stale revision');}),error=>error instanceof AgentExecutionError&&error.reasonCode==='tool_or_validation_limit'&&error.actualMicros===17);
});

test('plain borrower text uses the validated reply handler exactly once and preserves cost',async()=>{
 let count=0;
 const planner=createMastraBorrowerPlanner({async run(){return {actualMicros:23,replyText:'Please upload the rent roll.'};}});
 const result=await planner.decide({},AbortSignal.timeout(5000),async action=>{count++;assert.deepEqual(action,{kind:'reply',message:'Please upload the rent roll.'});return {};});
 assert.equal(count,1);assert.equal(result.actualMicros,23);
 await assert.rejects(planner.decide({},AbortSignal.timeout(5000),async()=>{throw Error('Stale context');}),error=>error instanceof AgentExecutionError&&error.actualMicros===23);
 const invalid=createMastraBorrowerPlanner({async run(){return {actualMicros:23,replyText:'x'.repeat(6001)};}});
 await assert.rejects(invalid.decide({},AbortSignal.timeout(5000),async()=>{throw Error('Must not execute');}),error=>error instanceof AgentExecutionError&&error.actualMicros===23);
});
test('native tool takes precedence over accompanying prose without a second action',async()=>{
 let count=0;
 const base=scriptedAgentTransport('reply_to_borrower',{message:'Native answer'});
 const planner=createMastraBorrowerPlanner({...base,async run(...args){return {...await base.run(...args),replyText:'Provisional prose'};}});
 const result=await planner.decide({},AbortSignal.timeout(5000),async()=>{count++;return {};});
 assert.equal(count,1);assert.deepEqual(result.action,{kind:'reply',message:'Native answer'});
});
