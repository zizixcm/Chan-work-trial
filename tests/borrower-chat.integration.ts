import {PilotPdfTools} from '../lib/preparation/pdf-tools';
import {PDFDocument} from 'pdf-lib';
import {PreparationService} from '../lib/preparation/service';
import {PreparationWorker} from '../lib/preparation/worker';
import {transitionProcessorMode} from '../lib/preparation/ownership';
import {ChatProcessingBridge,processingIntentForCard} from '../lib/borrower-chat/processing-bridge';
import {dispatchPendingChatDelegations} from '../lib/borrower-chat/dispatch-pending';
import {ChatProcessingCache} from '../lib/borrower-chat/processing-cache';
import {initialProcessingProjection} from '../lib/borrower-chat/processing-projection';
/** Runs only against a unique disposable PostgreSQL schema; no model/server calls. */
import '../scripts/env';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { Access } from '../lib/authorization';
import { ConversationRepository } from '../lib/borrower-chat/repository';
import { BorrowerContextService } from '../lib/borrower-chat/context';
import { ChatDelegationRepository } from '../lib/borrower-chat/delegation';
import { ConversationAnswers } from '../lib/borrower-chat/answers';
import { ConversationUploads } from '../lib/borrower-chat/uploads';
import { UploadBatchService } from '../lib/jobs/batches';
import { AnalysisService } from '../lib/jobs/service';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated integration checks.');
  const schema='chat_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:process.env.DATABASE_URL});
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options','-c search_path='+schema+',public');
  const db=new Pool({connectionString:url.toString(),max:8});
  const access:Access={applicationId:'a',userId:'u',displayName:'Borrower',role:'borrower'};
  const conversations=new ConversationRepository(access,db),context=new BorrowerContextService(access,db);
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for(const name of (await readdir('migrations/postgres')).filter(n=>n.endsWith('.sql')&&n!=='018_conversation_uploads.sql').sort())
      await db.query(await readFile('migrations/postgres/'+name,'utf8'));
    await db.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES
      ('u','Borrower','chat-u@example.test',true),('v','Other','chat-v@example.test',true),('l','Lender','chat-l@example.test',true)`);
    for(const id of ['a','b'])await db.query(`INSERT INTO applications(id,borrower_name,property_name,address,transaction_type,requested_amount,loi_reference,created_at)
      VALUES($1,'Borrower','Property','Address','Refinance',1000000,'LOI reference',now())`,[id]);
    await db.query(`INSERT INTO application_memberships(application_id,user_id,role) VALUES('a','u','borrower'),('b','v','borrower'),('a','l','lender')`);
    await db.query(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria)
      VALUES('r','a','Rent roll','Property','Understand rental income','Current','Borrower','Required',1,ARRAY['Rent amounts'])`);
    await db.query(`INSERT INTO lender_notes(application_id,body,updated_at) VALUES('a','PRIVATE LENDER NOTE',now())`);
    assert.equal((await conversations.read()).conversation,null);
    assert.equal((await db.query('SELECT count(*)::int n FROM borrower_conversations')).rows[0].n,0,'GET does not create');
    const empty=await context.read();
    assert.equal(empty.application.lifecycle,null,'no invented lifecycle');
    assert.equal(empty.loi.state,'unavailable');assert.equal(empty.documents.length,0);
    assert.equal(empty.requirements[0].assessment.state,'not_assessed');
    assert.equal(empty.requirements[0].evidencePresence,'absent');
    assert.equal(empty.counts.appearsComplete,0);
    const created=await Promise.all(Array.from({length:5},()=>conversations.create()));
    assert.equal(new Set(created.map(c=>c.conversation.id)).size,1);
    assert.equal(created.filter(c=>c.created).length,1,'one create across racing clients');
    await assert.rejects(new ConversationRepository({...access,applicationId:'b'},db).create(),{status:404});
    await assert.rejects(new ConversationRepository({...access,userId:'l',role:'borrower'},db).read(),{status:403},'role comes from membership, not provided Access');
    await assert.rejects(new BorrowerContextService({...access,applicationId:'b'},db).read(),{status:404});
    const writes=await Promise.all(Array.from({length:5},()=>conversations.append({clientMessageId:'same',text:'What is needed?'})));
    assert.equal(new Set(writes.map(w=>w.message.id)).size,1);
    assert.equal(writes.filter(w=>!w.replayed).length,1);
    assert.equal(writes[0].message.responseState,'not_requested');
    await assert.rejects(conversations.append({clientMessageId:'same',text:'different'}),{status:409});
    await assert.rejects(conversations.append({clientMessageId:'injected',text:'x',applicationId:'b'}),{status:400});
    await Promise.all(['second','third','fourth'].map(clientMessageId=>conversations.append({clientMessageId,text:clientMessageId})));
    const first=await conversations.read({after:'0',limit:2});
    assert.deepEqual(first.messages.map(m=>m.sequence),['1','2']);assert.equal(first.hasMore,true);
    const second=await conversations.read({after:first.nextAfter!,limit:2});
    assert.deepEqual(second.messages.map(m=>m.sequence),['3','4']);assert.equal(second.hasMore,false);
    assert.equal((await new ConversationRepository(access,db).read()).messages.length,4,'reopening preserves messages');
    await db.query("UPDATE application_memberships SET active=false WHERE application_id='a' AND user_id='u'");
    await assert.rejects(conversations.append({clientMessageId:'same',text:'What is needed?'}),{status:404},'replay reauthorizes');
    await assert.rejects(context.read(),{status:404});
    await db.query("UPDATE application_memberships SET active=true WHERE application_id='a' AND user_id='u'");
    for (const [id,app,hash] of [['d','a','a'],['foreign','b','b']])await db.query(`INSERT INTO documents
      (id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at)
      VALUES($1,$2,'evidence.csv',$1,'text/csv',12,$3,'Borrower',now())`,[id,app,hash.repeat(64)]);
    await assert.rejects(db.query("INSERT INTO application_loi_documents VALUES('a','foreign')"),{code:'23503'},'LOI association cannot cross apps');
    await db.query("INSERT INTO application_loi_documents VALUES('a','d')");
    await db.query("INSERT INTO requirement_documents(application_id,requirement_id,document_id) VALUES('a','r','d')");
    const withDoc=await context.read();
    assert.equal(withDoc.loi.document?.id,'d');assert.equal(withDoc.inventory.total,1);
    assert.equal(withDoc.requirements[0].evidencePresence,'present');
    assert.notEqual(withDoc.revision,empty.revision);
    assert.doesNotMatch(JSON.stringify(withDoc),/PRIVATE LENDER NOTE|storage_key|foreign/);
    const service=new AnalysisService(access,db);
    const requested=await service.request('verify_requirement.v1','r',randomUUID());
    const queued=await context.read();assert.equal(queued.requirements[0].assessment.state,'checking');
    const result={schemaVersion:'verify.v1',requirementId:'r',assessment:'appears_complete',
      checks:[{criterionId:'r:criterion:1',state:'met',reason:'Amount present',evidence:[{documentId:'d',record:2,column:1,quote:'1200'}]}],
      missingEvidence:[],conflicts:[],limitations:[]};
    await db.query(`UPDATE analysis_jobs SET state='succeeded',result=$2,result_fingerprint=fingerprint,revision=revision+1 WHERE id=$1`,[requested.id,result]);
    const complete=await context.read();
    assert.equal(complete.requirements[0].assessment.state,'appears_complete');
    assert.equal(complete.requirements[0].lenderReview,null,'AI does not create acceptance');
    assert.notEqual(queued.revision,complete.revision,'job state alone changes context token');
    assert.equal((await context.read()).revision,complete.revision,'unchanged projection has stable token');
    await db.query("UPDATE requirements SET purpose='Updated purpose' WHERE id='r'");
    const stale=await context.read();assert.equal(stale.requirements[0].assessment.state,'outdated');
    assert.deepEqual(stale.requirements[0].assessment.checks,[],'no stale source text promoted');
    await db.query(`INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES('batch','a','u','hash')`);
    await db.query(`INSERT INTO upload_batch_members(batch_id,id,application_id,name,sha256) VALUES('batch','m','a','pending.csv',$1)`,['c'.repeat(64)]);
    const pending=await context.read();assert.equal(pending.intake.openBatches,1);assert.equal(pending.intake.unsavedMembers,1);
    assert.equal(pending.counts.appearsComplete,0);
    await db.query(await readFile('migrations/postgres/018_conversation_uploads.sql','utf8'));
    const uploads=new ConversationUploads(access,db);
    const history=await uploads.read();
    assert.equal(history.cards.length,1);
    assert.equal(history.cards[0].conversationId,created[0].conversation.id);
    assert.equal(history.cards[0].members[0].state,'pending');
    const jobsBefore=(await db.query('SELECT count(*)::int n FROM analysis_jobs')).rows[0].n;
    assert.equal((await uploads.read()).revision,history.revision,'unchanged status is stable');
    await db.query("UPDATE upload_batch_members SET state='saved',document_id='d' WHERE batch_id='batch'");
    const savedHistory=await uploads.read();
    assert.equal(savedHistory.cards[0].artifactId,history.cards[0].artifactId,'save does not duplicate card');
    assert.notEqual(savedHistory.revision,history.revision);
    assert.equal(savedHistory.cards[0].members[0].state,'saved');
    assert.equal(savedHistory.cards[0].members[0].matching.state,'not_requested','saving does not invent processing');
    assert.equal((await db.query('SELECT count(*)::int n FROM analysis_jobs')).rows[0].n,jobsBefore,'polls never schedule');
    const match=await service.request('match_document.v1','d',randomUUID());
    assert.equal((await uploads.read()).cards[0].members[0].matching.job?.state,'queued');
    await db.query("UPDATE analysis_jobs SET state='running',revision=revision+1 WHERE id=$1",[match.id]);
    const runningHistory=await uploads.read();
    assert.equal(runningHistory.cards[0].artifactId,history.cards[0].artifactId);
    assert.equal(runningHistory.cards[0].members[0].matching.job?.state,'running');
    await db.query("UPDATE analysis_jobs SET state='failed',safe_code='provider_timeout',revision=revision+1 WHERE id=$1",[match.id]);
    assert.equal((await uploads.read()).cards[0].members[0].matching.job?.state,'failed','failed processing remains distinct from saved bytes');
    const batches=new UploadBatchService(access,db);
    await Promise.all(Array.from({length:4},()=>batches.create('racing-batch',[{id:'m',name:'retry.csv',sha256:'c'.repeat(64)}])));
    assert.equal((await db.query("SELECT count(*)::int n FROM borrower_conversation_uploads WHERE batch_id='racing-batch'")).rows[0].n,1);
    await batches.finalize('racing-batch');
    assert.equal((await uploads.read()).cards[0].members[0].state,'failed','failed upload remains in history');
    await assert.rejects(batches.create('racing-batch',[{id:'m',name:'changed.csv',sha256:'c'.repeat(64)}]),{status:409});
    for(let i=0;i<11;i++)await db.query(`INSERT INTO upload_batches(id,application_id,user_id,manifest_hash,state)
      VALUES($1,'a','u','hash','finalized')`,['history-'+i]);
    const recent=await uploads.read(),older=await uploads.read(recent.nextBefore!);
    assert.equal(recent.cards.length,10);assert.equal(older.cards.length,3);assert.equal(older.nextBefore,null);
    assert.equal(new Set([...recent.cards,...older.cards].map(c=>c.artifactId)).size,13);
    await assert.rejects(uploads.read('0'),{status:400});
    await assert.rejects(new ConversationUploads({...access,applicationId:'b'},db).read(),{status:404});
    await assert.rejects(new ConversationUploads({...access,userId:'l'},db).read(),{status:403});
    await db.query("INSERT INTO upload_batches(id,application_id,user_id,manifest_hash) VALUES('other-batch','b','v','hash')");
    assert.equal((await new ConversationUploads({...access,applicationId:'b',userId:'v'},db).read()).cards.length,1,'portal upload creates its conversation without browser acknowledgment');
    assert.equal((await uploads.read()).cards.length,10,'another application is excluded');
    await assert.rejects(db.query(`UPDATE borrower_conversation_uploads SET application_id='a',conversation_id=$1,borrower_user_id='u' WHERE batch_id='other-batch'`,[created[0].conversation.id]),{code:'23503'});
    await db.query("UPDATE application_memberships SET active=false WHERE application_id='a' AND user_id='u'");
    await assert.rejects(uploads.read(),{status:404});
    await db.query("UPDATE application_memberships SET active=true WHERE application_id='a' AND user_id='u'");
    // Cross-application message FK and owner binding are database invariants too.
    await assert.rejects(db.query(`INSERT INTO borrower_conversation_messages
      (id,application_id,conversation_id,borrower_user_id,sequence,client_message_id,body,body_digest)
      VALUES('bad','b',$1,'v',99,'bad','x',$2)`,[created[0].conversation.id,'a'.repeat(64)]),{code:'23503'});
    assert.equal((await db.query('SELECT count(*)::int n FROM borrower_conversation_messages')).rows[0].n,4);
    const answers=new ConversationAnswers(access,db);
    const beforeAnswerJobs=(await db.query('SELECT count(*)::int n FROM analysis_jobs')).rows[0].n;
    const replies=await Promise.all(Array.from({length:4},()=>answers.ask({intent:'requested',clientMessageId:'question1'})));
    assert.equal(new Set(replies.map(r=>r.entry.id)).size,1,'concurrent answer retries share identity');
    assert.equal(replies.filter(r=>!r.replayed).length,1);
    assert.equal(replies[0].entry.freshness,'current');
    assert.equal(replies[0].entry.answer?.items[0].title,'Rent roll');
    const storedMessage=(await conversations.read()).messages.find(m=>m.clientMessageId==='question1')!;
    assert.equal(storedMessage.responseState,'available');assert.equal(storedMessage.answerId,replies[0].entry.id);
    assert.equal((await answers.read()).entries.length,1,'reconnect recovers saved answer');
    const resolved=await answers.source(replies[0].entry.id,'s2');assert.equal(resolved.source.reference.kind,'requirement');
    await assert.rejects(answers.ask({intent:'missing',clientMessageId:'question1'}),{status:409});
    await assert.rejects(answers.ask({intent:'requested',clientMessageId:'same'}),{status:409},'plain stored message ID is not repurposed');
    const uploaded=await answers.ask({intent:'uploaded',clientMessageId:'question2'});
    const fileSource=uploaded.entry.answer!.sources.find(s=>s.reference.kind==='document')!;
    const file=await answers.source(uploaded.entry.id,fileSource.id);
    assert.equal(file.documentUrl,'/api/documents/d?applicationId=a');
    await assert.rejects(answers.source(uploaded.entry.id,'s9999'),{status:404});
    await assert.rejects(new ConversationAnswers({...access,applicationId:'b',userId:'v'},db).source(uploaded.entry.id,fileSource.id),{status:404});
    await assert.rejects(new ConversationAnswers({...access,userId:'l'},db).read(),{status:403});
    await db.query("UPDATE requirements SET purpose='Changed after answer' WHERE id='r'");
    assert.equal((await answers.read()).entries[0].answer,null,'stale saved answers are not presented as current');
    const replay=await answers.ask({intent:'uploaded',clientMessageId:'question2'});
    assert.equal(replay.entry.id,uploaded.entry.id);assert.equal(replay.entry.freshness,'outdated');
    await assert.rejects(answers.source(uploaded.entry.id,fileSource.id),{status:409},'source resolution fences stale snapshots');
    for(let i=0;i<10;i++)await answers.ask({intent:'missing',clientMessageId:'more-'+i});
    const answersPage=await answers.read(),olderAnswers=await answers.read(answersPage.nextBefore!);
    assert.equal(answersPage.entries.length,10);assert.equal(olderAnswers.entries.length,2);
    assert.match(answersPage.entries[0].answer!.items[0].lines.join(' '),/out of date/,'missing answer explains stale verification instead of repeating it');
    assert.equal(new Set([...answersPage.entries,...olderAnswers.entries].map(a=>a.id)).size,12);
    assert.equal((await db.query('SELECT count(*)::int n FROM analysis_jobs')).rows[0].n,beforeAnswerJobs,'retrieval never dispatches checks');
    await db.query("UPDATE application_memberships SET active=false WHERE application_id='a' AND user_id='u'");
    await assert.rejects(answers.read(),{status:404});
    await assert.rejects(answers.source(uploaded.entry.id,fileSource.id),{status:404});
    await assert.rejects(answers.ask({intent:'requested',clientMessageId:'question1'}),{status:404},'answer replay reauthorizes');
    await db.query("UPDATE application_memberships SET active=true WHERE application_id='a' AND user_id='u'");
    const delegations=new ChatDelegationRepository(access,db);
    const delegationRevision=(await context.read()).revision;
    const intent={intent:'investigate_gap',requirementId:'r',clientMessageId:'investigate-1',expectedContextRevision:delegationRevision};
    const requests=await Promise.all(Array.from({length:4},()=>delegations.request(intent)));
    assert.equal(new Set(requests.map(r=>r.card.id)).size,1);
    assert.equal(requests.filter(r=>!r.replayed).length,1);
    assert.equal(requests[0].card.state,'pending_admission');assert.equal(requests[0].card.processingRunId,null);
    const requestCard=requests[0].card;
    const trustedRequest={schemaVersion:'processing-request.v1',commandId:requestCard.id,idempotencyKey:requestCard.id,applicationId:'a',
      authority:{actorUserId:'u',scope:'borrower',policyRevision:'server-policy'},
      origin:{kind:'borrower_request',conversationId:requestCard.conversationId,artifactId:requestCard.id,domainEventId:requestCard.messageId},
      objective:'resolve_gap',assessmentScope:'affected_requirements',preparationId:'prep',uploadBatchId:null,documents:[],
      requirements:[{requirementId:'r',definitionRevision:'definition',evidenceRevision:'evidence'}],
      snapshot:{contentRevision:'content',inputFingerprint:'a'.repeat(64),preparationRevision:'1',submissionStage:null,reviewDate:'2026-11-07',submissionPolicyRevision:null,requestInventoryRevision:'requests',evidenceInventoryRevision:'evidence'},retryOf:null};
    const accepted={schemaVersion:'processing-event.v1',eventId:'accepted',applicationId:'a',cursor:'accepted-cursor',runId:'processor-run',runRevision:'1',artifactId:requestCard.id,occurredAt:'2026-11-07T00:00:00Z',inputFingerprint:'a'.repeat(64),type:'run.accepted',state:'queued',data:{preparationId:'prep',preparationRevision:'1'}};
    assert.equal((await delegations.bindAdmission(requestCard.id,trustedRequest,accepted)).replayed,false);
    assert.equal((await delegations.bindAdmission(requestCard.id,trustedRequest,accepted)).replayed,true);
    assert.equal((await delegations.read())[0].processingRunId,'processor-run');
    await assert.rejects(delegations.bindAdmission(requestCard.id,trustedRequest,{...accepted,runId:'wrong-run'}),{status:409});
    await assert.rejects(delegations.bindAdmission(requestCard.id,{...trustedRequest,authority:{...trustedRequest.authority,actorUserId:'v'}},accepted),{status:409});
    const jobsBeforeRead=(await db.query('SELECT count(*)::int n FROM analysis_jobs')).rows[0].n;
    assert.equal((await delegations.read()).length,1);
    await db.query("UPDATE requirements SET purpose='Changed before admission' WHERE id='r'");
    assert.equal((await delegations.request(intent)).card.id,requests[0].card.id,'intent replay retains original card after changes');
    await assert.rejects(delegations.request({...intent,clientMessageId:'stale-new'}),{status:409});
    await assert.rejects(delegations.request({...intent,intent:'review_documents',requirementId:undefined}),{status:409});
    const currentRevision=(await context.read()).revision;
    const review=await delegations.request({intent:'review_documents',clientMessageId:'review-documents',expectedContextRevision:currentRevision});
    assert.equal(review.card.requirementId,null,'document review has no fabricated requirement or batch');
    await assert.rejects(delegations.request({...intent,clientMessageId:'foreign-req',requirementId:'no-such-request',expectedContextRevision:currentRevision}),{status:404});
    await assert.rejects(new ChatDelegationRepository({...access,userId:'l'},db).read(),{status:403});
    assert.equal((await db.query('SELECT count(*)::int n FROM analysis_jobs')).rows[0].n,jobsBeforeRead,'intent storage/replay/poll never dispatches');
    const cache=new ChatProcessingCache(access,db);
    const projection=initialProcessingProjection({schemaVersion:'preparation-snapshot.v1',applicationId:'a',preparationId:'prep',preparationRevision:'1',cursor:'opaque',currentResultRef:null,currentReadinessRef:null,obligations:[],questionRefs:[],budget:{limitMicros:1,knownMicros:0,reservedMicros:0,unknownCost:false}});
    projection.summaryKeys=['settled-once'];
    assert.equal(await cache.read('prep'),null);
    assert.equal((await cache.save('0',projection)).revision,'1');
    const restored=await new ChatProcessingCache(access,db).read('prep');
    assert.equal(restored?.requiresRefresh,true);assert.deepEqual(restored?.projection.summaryKeys,['settled-once']);
    await assert.rejects(cache.save('0',projection),{status:409},'late poll cannot replace newer persisted view');
    await assert.rejects(cache.save('1',{...projection,snapshot:{...projection.snapshot,applicationId:'b'}}),{status:404});

    await db.query("UPDATE application_memberships SET active=false WHERE application_id='a' AND user_id='u'");
    await assert.rejects(delegations.request(intent),{status:404});
    await assert.rejects(delegations.read(),{status:404});
    await assert.rejects(cache.read('prep'),{status:404});
    await db.query("UPDATE application_memberships SET active=true WHERE application_id='a' AND user_id='u'");
    // Real processor admission/worker/consumer integration; planner response is
    // explicitly scripted and tools are unused. This proves no model quality.
    const otherAccess:Access={applicationId:'b',userId:'v',role:'borrower',displayName:'Other'};
    const processor=new PreparationService(db),bridge=new ChatProcessingBridge(otherAccess,db);
    await db.query(`INSERT INTO requirements(id,application_id,title,category,purpose,period,owner,applicability,sort_order,criteria)
      VALUES('rb','b','Statement','Financial','Confirm amount','Current','Borrower','Required',1,ARRAY['Required amount'])`);
    await processor.transaction(otherAccess,tx=>transitionProcessorMode(tx,'b','adaptive'));
    const otherContext=await new BorrowerContextService(otherAccess,db).read();
    const otherDelegations=new ChatDelegationRepository(otherAccess,db);
    const beforeCrash=await otherDelegations.request({clientMessageId:'crash-before-admission',intent:'review_documents',expectedContextRevision:otherContext.revision,text:'Please inspect the current documents.'});
    assert.equal((await db.query("SELECT count(*)::int n FROM preparation_runs WHERE application_id='b'")).rows[0].n,0);
    await dispatchPendingChatDelegations(db);
    const recovered=(await otherDelegations.read()).find(c=>c.id===beforeCrash.card.id)!;
    assert.ok(recovered.processingRunId,'runner admits a saved intent without any browser request');
    const afterAdmission=await otherDelegations.request({clientMessageId:'crash-before-binding',intent:'review_documents',expectedContextRevision:(await new BorrowerContextService(otherAccess,db).read()).revision});
    const acceptedBeforeCrash=await processor.accept(otherAccess,processingIntentForCard(afterAdmission.card));
    await dispatchPendingChatDelegations(db);
    assert.equal((await otherDelegations.read()).find(c=>c.id===afterAdmission.card.id)!.processingRunId,acceptedBeforeCrash.runId);
    assert.equal((await db.query("SELECT count(*)::int n FROM preparation_runs WHERE application_id='b'")).rows[0].n,2,'lost binding acknowledgment creates no second run');
    const initialBridge=await bridge.read();assert.equal(Object.keys(initialBridge.processing!.cards).length,2,'reconnect restores active run cards');
    await processor.transaction(otherAccess,async tx=>{
      const prep=(await tx.query("SELECT id,state FROM borrower_preparations WHERE application_id='b'")).rows[0];
      prep.state.budget.limitMicros=100;
      await tx.query('UPDATE borrower_preparations SET state=$2 WHERE id=$1',[prep.id,prep.state]);
    });
    const worker=new PreparationWorker(processor,{maximumCallMicros:1,decide:async()=>({actualMicros:0,action:{kind:'assess',findings:[{
      requirementId:'rb',criterionId:'rb:criterion:1',state:'unknown',reasonCode:'uninspected',explanation:'Evidence has not been inspected.',evidence:[],
      gap:{kind:'clarification',subject:null,period:null,documentRole:null,description:'The amount remains unverified.',owner:'borrower'}}],limitations:[]}})},
      {inspect:async()=>{throw Error('No tool expected');},read:async()=>{throw Error('No tool expected');}},async()=>{throw Error('No bytes expected');});
    await worker.run(otherAccess,acceptedBeforeCrash.runId);
    const afterWorker=await bridge.read();
    assert.equal(afterWorker.processing!.currentResult!.requirements[0].assessment,'unknown');
    assert.equal(afterWorker.processing!.cards[acceptedBeforeCrash.runId].state,'partial');
    assert.match(afterWorker.processing!.summaries.at(-1)!.text,/1 uncertain/,'actual worker event feeds the exact consumer');
    const questionRequest=await bridge.delegate({clientMessageId:'ask-clarification',intent:'investigate_gap',requirementId:'rb',expectedContextRevision:(await new BorrowerContextService(otherAccess,db).read()).revision});
    const questionWorker=new PreparationWorker(processor,{maximumCallMicros:1,decide:async()=>({actualMicros:0,action:{kind:'ask',prompt:'Which account does this statement cover?',requirementIds:['rb']}})},
      {inspect:async()=>{throw Error('No tool expected');},read:async()=>{throw Error('No tool expected');}},async()=>{throw Error('No bytes expected');});
    await questionWorker.run(otherAccess,questionRequest.receipt.runId);
    const pendingQuestion=(await bridge.read()).processing!.questions[0];assert.ok(pendingQuestion,'snapshot rehydrates pending clarification');
    const answerInput={questionId:pendingQuestion.questionId,expectedQuestionRevision:pendingQuestion.questionRevision,actionId:pendingQuestion.allowedActionIds[0],clientActionId:'clarification-answer',answer:'Operating account'};
    assert.equal((await bridge.answer(answerInput)).state,'queued');
    assert.equal((await bridge.answer(answerInput)).runId,questionRequest.receipt.runId,'answer retry does not create another run');
    assert.equal((await bridge.read()).processing!.questions.length,0);
    const assertion=(await db.query('SELECT answer FROM preparation_questions WHERE id=$1',[pendingQuestion.questionId])).rows[0].answer;
    assert.equal(assertion.text,'Operating account');assert.equal(assertion.userId,'v','reply remains attributed assertion');
    const mappingPdf=await PDFDocument.create();mappingPdf.addPage().drawText('Amount 42');
    const mappingBytes=Buffer.from(await mappingPdf.save()),mappingHash=createHash('sha256').update(mappingBytes).digest('hex');
    await db.query(`INSERT INTO documents(id,application_id,original_name,storage_key,content_type,size_bytes,sha256,uploaded_by,created_at)
      VALUES('mapping-file','b','mapping.pdf','mapping-file','application/pdf',$1,$2,'Other',now())`,[mappingBytes.length,mappingHash]);
    const mappingRequest=await bridge.delegate({clientMessageId:'mapping-investigation',intent:'review_documents',expectedContextRevision:(await new BorrowerContextService(otherAccess,db).read()).revision});
    let mappingStep=0;
    const mappingWorker=new PreparationWorker(processor,{maximumCallMicros:1,decide:async(input)=>({actualMicros:0,action:mappingStep++===0?
      {kind:'read_pages',documentId:'mapping-file',pages:[1],mode:'text'}:
      {kind:'assess',findings:[{requirementId:'rb',criterionId:'rb:criterion:1',state:'met',reasonCode:'amount_seen',explanation:'Synthetic amount is present.',evidence:[{observationId:input.observations.at(-1)!.id,page:1,quote:'Amount 42'}],gap:null}],limitations:[]}})},
      new PilotPdfTools(),async()=>mappingBytes);
    await mappingWorker.run(otherAccess,mappingRequest.receipt.runId);
    const mappingResult=(await bridge.read()).processing!.currentResult!;
    const mappingAction=mappingResult.allowedNextActions.find(a=>a.kind==='confirm_link')!;assert.ok(mappingAction);
    const mappingInput={resultId:mappingResult.resultId,resultRevision:mappingResult.resultRevision,actionId:mappingAction.actionId,idempotencyKey:'human-confirmation'};
    assert.equal((await bridge.confirmMapping(mappingInput)).changed,true);
    assert.equal((await bridge.confirmMapping(mappingInput)).changed,true,'confirmation lost acknowledgment replays');
    assert.equal((await db.query("SELECT origin FROM requirement_documents WHERE application_id='b' AND requirement_id='rb' AND document_id='mapping-file'")).rows[0].origin,'human');
    await assert.rejects(bridge.confirmMapping({...mappingInput,idempotencyKey:'stale-confirmation'}),{status:409});
    assert.equal((await db.query("SELECT count(*)::int n FROM preparation_mapping_gates WHERE application_id='b' AND enabled")).rows[0].n,0,'manual confirmation never opens automatic quality gate');
    const jobsAfterWorker=(await db.query("SELECT count(*)::int n FROM preparation_runs WHERE application_id='b'")).rows[0].n;
    await bridge.read();assert.equal((await db.query("SELECT count(*)::int n FROM preparation_runs WHERE application_id='b'")).rows[0].n,jobsAfterWorker,'bridge GET does not admit work');
    console.log('PASS: borrower context and conversation isolated integration (authorization, races, replay, pagination, freshness, LOI isolation, upload anchors/backfill, grounded answers, citations, stale-source fences, polling/retrieval without dispatch).');
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}
main().catch(error=>{console.error('Borrower chat integration failed:',error instanceof Error ? error.message : 'Unknown error');process.exitCode=1;});
