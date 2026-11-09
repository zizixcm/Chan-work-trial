import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateMappingEvidence,validationDiagnostic,validationDiagnosticSchema,EvidenceValidationError} from '../lib/preparation/validation-diagnostics';
import type {PageObservation} from '../lib/preparation/actions';
import {AgentExecutionError} from '../lib/agents/execution-error';
import {createLocalMastraObservability,metadataOnlyProcessor} from '../lib/evaluation-observability';
import {createDocumentInvestigationAgent} from '../lib/agents/definitions';
import {scriptedAgentTransport} from './fixtures/native-agent-model';
const document={documentId:'doc',sha256:'hash'};
const observation:PageObservation={id:'obs',...document,kind:'ocr',pageCount:1,pages:[{page:1,text:'PRIVATE_NAME\nRental Income',confidence:84}],limitations:[]};
const evidence={observationId:'obs',page:1,quote:'Rental Income'};
test('mapping diagnostics preserve strict matching and distinguish missing, stale, weak and mismatched evidence',()=>{
 assert.doesNotThrow(()=>validateMappingEvidence([observation],document,evidence,'purpose',0));
 const cases:[PageObservation[],typeof evidence,string][]=[
  [[],evidence,'observation_missing'],
  [[{...observation,documentId:'different'}],evidence,'document_mismatch'],
  [[{...observation,sha256:'old'}],evidence,'version_mismatch'],
  [[observation],{...evidence,page:2},'page_missing'],
  [[{...observation,pages:[{...observation.pages[0],confidence:79}]}],evidence,'ocr_confidence_low'],
  [[{...observation,kind:'search'}],evidence,'unsupported_observation'],
  [[observation],{...evidence,quote:'PRIVATE_NAME Rental Income'},'quote_mismatch'],
 ];
 for(const [observations,citation,code] of cases)assert.throws(()=>validateMappingEvidence(observations,document,citation,'purpose',0),error=>{
  const diagnostic=validationDiagnostic(new AgentExecutionError('tool_or_validation_limit',1,error));
  assert.equal(diagnostic?.code,code);
  if(code==='quote_mismatch')assert.equal(diagnostic?.whitespaceNormalizedMatch,true);
  assert.ok(!JSON.stringify(diagnostic).includes('PRIVATE_NAME'));
  return error instanceof EvidenceValidationError&&error.message==='Mapping support unavailable';
 });
});
test('native failed tool exports safe validation details while retaining privacy and correlation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mapping-diagnostic-'));
 const observer=await createLocalMastraObservability({directory});
 try{
  const input={documentId:'doc',requirementId:'req',relevance:'clear',basis:{identity:[{...evidence,quote:'PRIVATE_NAME Rental Income'}],purpose:[evidence],period:[evidence],target:[evidence]},conflicts:[],explanation:'PRIVATE_EXPLANATION'};
  const transport=scriptedAgentTransport('propose_document_mapping',input);
  const agent=observer.attachAgent(createDocumentInvestigationAgent({model:transport.model,execute:async()=>validateMappingEvidence([observation],document,input.basis.identity[0],'identity',0)}));
  const operation=await observer.runOperation('investigation-step',{investigationRunId:'run',stepId:'step'},async context=>{
   try{await transport.run(agent,[{role:'user',content:'PRIVATE_PROMPT'}],AbortSignal.timeout(10000),{correlation:{},tracingOptions:context.tracingOptions,tracingContext:context.tracingContext});}catch{}
  });
  const trace=await observer.readTrace(operation.trace);
  const tool=trace!.spans.find(s=>s.spanType==='tool_call');
  assert.ok(tool?.error);
  const diagnostic=validationDiagnosticSchema.parse(tool?.metadata?.validationDiagnostic);
  assert.equal(diagnostic.code,'quote_mismatch');
  assert.equal(diagnostic.whitespaceNormalizedMatch,true);
  assert.equal(tool?.metadata?.investigationRunId,'run');
  assert.ok(!JSON.stringify(trace).includes('PRIVATE_'));
 }finally{await observer.close();await rm(directory,{recursive:true,force:true});}
});
test('trace sanitizer refuses extra fields and arbitrary diagnostic text',()=>{
 const span:any={metadata:{validationDiagnostic:{code:'quote_mismatch',quote:'PRIVATE_QUOTE'}},attributes:{},input:'PRIVATE_INPUT'};
 const sanitized=metadataOnlyProcessor().process(span) as any;
 assert.equal(sanitized.metadata.validationDiagnostic,undefined);
 assert.ok(!JSON.stringify(sanitized).includes('PRIVATE_'));
});
