import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {initialProcessingProjection} from '../lib/borrower-chat/processing-projection';

// Compile the client component with the installed tsx compiler dependency; CSS
// is omitted for SSR assertions. These checks do not claim visual/browser QA.
const require=createRequire(import.meta.url);
const compiler=createRequire(require.resolve('tsx/package.json'))('esbuild') as typeof import('esbuild');
test('conversation renders disconnected, simulated, pending and source-aware findings honestly',async()=>{
  const directory=await mkdtemp(path.join(process.cwd(),'.chat-ui-test-'));
  try {
    const output=path.join(directory,'conversation.cjs');
    await compiler.build({entryPoints:['app/components/processing-conversation.tsx'],outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},logLevel:'silent'});
    const Component=require(output).default;
    const disconnected=renderToStaticMarkup(createElement(Component,{}));
    assert.match(disconnected,/Document investigation is not connected/);assert.match(disconnected,/disabled/);assert.doesNotMatch(disconnected,/submission readiness/i);
    const projection=initialProcessingProjection({schemaVersion:'preparation-snapshot.v1',applicationId:'app',preparationId:'prep',preparationRevision:'1',cursor:'cursor',currentResultRef:null,currentReadinessRef:null,obligations:[],questionRefs:[],budget:{limitMicros:1,knownMicros:0,reservedMicros:0,unknownCost:false}});
    projection.cards.run={runId:'run',artifactId:'card',runRevision:'1',state:'waiting_input',result:null,current:false,question:null,requiredActor:'operator',detail:'budget_exhausted'};
    projection.questions=[{schemaVersion:'processing-question.v1',questionId:'q',questionRevision:'1',preparationId:'prep',dependencyFingerprint:'a'.repeat(64),affectedRequirementIds:['r'],requiredActor:'borrower',blocking:true,prompt:'Which account?',answerSchema:{kind:'attributed_text',maxLength:100},allowedActionIds:['answer']}];
    const snapshot={conversationId:'conversation',turns:[{id:'m',clientMessageId:'m',role:'borrower',text:'<script>unsafe</script>',createdAt:'2026-11-07T00:00:00Z',freshness:'current'}],processing:projection,requirements:[{id:'r',title:'Bank statement'}],pollAfterMs:5000,executionLabel:'simulated'};
    const adapter={read:async()=>snapshot,send:async()=>{},answer:async()=>{},source:async()=>{throw Error('No source fixture');}};
    const html=renderToStaticMarkup(createElement(Component,{initialSnapshot:snapshot,adapter,uploadSlot:createElement('button',null,'Upload files')}));
    assert.match(html,/Simulated integration preview/);assert.match(html,/Waiting for an action/);assert.match(html,/Requires a budget review/);
    assert.match(html,/Which account/);assert.match(html,/does not replace document evidence/);assert.match(html,/Upload files/);
    assert.match(html,/&lt;script&gt;unsafe/);assert.doesNotMatch(html,/<script>unsafe/);
    const findings=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,processing:{...projection,currentResult:{requirements:[{requirementId:'r',assessment:'incomplete',checks:[{criterionId:'c',explanation:'February is missing.'}],gaps:[{description:'Upload February statement.',owner:'borrower'}]}],allowedNextActions:[],limitations:[],conflicts:[],citations:[]}}}}));
    assert.match(findings,/<details><summary>Current completeness findings<\/summary>/,'full findings are opt-in instead of overwhelming every answer');
    assert.match(findings,/February is missing/,'details remain available');
    assert.match(findings,/Upload February statement/,'actionable details are preserved');
    const receipt=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[{...snapshot.turns[0],text:'Uploaded 2 files',files:[{id:'batch-member',name:'statement.pdf',documentId:'saved-document'},{id:'legacy-member',name:'unavailable.pdf'}]}]}}));
    assert.match(receipt,/<button[^>]*aria-label="Preview statement.pdf"[^>]*aria-expanded="false"/,'saved attachments expose a keyboard-accessible preview action');
    assert.doesNotMatch(receipt,/aria-label="Preview unavailable.pdf"/,'missing document references must not open a batch member as a document');
    const reply={id:'a',clientMessageId:'m',role:'assistant',text:'Please provide: * **Entity documents:** Formation and signing authority. * **Rent roll:** June 2026.',createdAt:'2026-11-07T00:00:00Z',freshness:'outdated'};
    const formatted=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[reply],agentPending:true,agentActivity:'queued'}}));
    assert.match(formatted,/<ul>/);assert.equal((formatted.match(/<li>/g)??[]).length,2);
    assert.match(formatted,/<strong>Entity documents:<\/strong>/);
    assert.match(formatted,/Earlier context/);assert.doesNotMatch(formatted,/Out of date. Ask again/);
    assert.match(formatted,/Your message is queued/);assert.match(formatted,/role="status"/);
    const working=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[],agentPending:true,agentActivity:'running'}}));
    assert.match(working,/Preparing your response/);
    const withActivity=renderToStaticMarkup(createElement(Component,{adapter,workspaceTitle:'Test',initialSnapshot:{...snapshot,agentEnabled:true,turns:[],agentPending:false,activity:[{id:'step',runId:'run',label:'Reading document: lease.pdf',status:'running',startedAt:'2026-11-08T00:00:00Z'}]}}));
    assert.match(withActivity,/Reading document: lease.pdf/);assert.doesNotMatch(withActivity,/<details|<summary/);assert.match(withActivity,/aria-label="Agent activity"/);assert.match(withActivity,/In progress/);
    assert.doesNotMatch(withActivity,/Ask a question or attach documents|A little clarity|Attach files/);
    assert.match(withActivity,/placeholder="Ask anything…"/);
    assert.match(withActivity,/<nav[^>]*aria-label="Quick questions"/);
    assert.equal((withActivity.match(/What&#x27;s requested\?/g)??[]).length,1,'quick question appears once');
    assert(withActivity.indexOf('aria-label="Quick questions"')>withActivity.indexOf('</header>'),'quick questions live outside scrolling welcome header');
    const completed=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[reply],agentPending:false}}));
    assert.doesNotMatch(completed,/Preparing your response|Your message is queued/);
    for(const status of ['completed','failed']){
      const finished=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[reply],agentPending:false,activity:[{id:'done',runId:'run',label:'Reading document: lease.pdf',status,startedAt:'2026-11-08T00:00:00Z'}]}}));
      assert.doesNotMatch(finished,/Agent activity|Reading document: lease.pdf|In progress|<summary>Activity/,'idle activity is fully hidden even with stored history');
    }
    const queuedWithHistory=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[],agentPending:true,agentActivity:'queued',activity:[{id:'old',runId:'old',label:'Old document review',status:'completed',startedAt:'2026-11-08T00:00:00Z'}]}}));
    assert.match(queuedWithHistory,/Your message is queued/);assert.doesNotMatch(queuedWithHistory,/Old document review/);
    const unsafe=renderToStaticMarkup(createElement(Component,{adapter,initialSnapshot:{...snapshot,turns:[{...reply,text:'<script>alert(1)</script>\n\n[bad](javascript:alert) ![image](https://example.com/tracker.png)'}]}}));
    assert.doesNotMatch(unsafe,/<script|javascript:|<img/);
    for(const detail of ['tool_or_validation_limit','provider_outcome_unknown']){
      projection.cards.run.detail=detail;
      const failure=renderToStaticMarkup(createElement(Component,{initialSnapshot:snapshot,adapter}));
      assert.match(failure,/Requires service attention/);assert.doesNotMatch(failure,/Requires a budget review|Requires a service setting or budget change/);
      if(detail==='tool_or_validation_limit')assert.match(failure,/document-checking step could not finish/);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
