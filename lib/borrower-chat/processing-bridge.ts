import {readAgentActivity} from '../agents/activity';
import {BorrowerAgentService} from '../agents/borrower-service';
import type {Pool} from 'pg';
import type {Access} from '../authorization';
import {pool} from '../db';
import {UploadError} from '../validation';
import {confirmPreparationMapping} from '../preparation/mapping';
import {processorMode} from '../preparation/ownership';
import {PreparationService,preparationIntentSchema} from '../preparation/service';
import {parseCompletenessResult,processingQuestionSchema,publicStateSchema,revisionSchema} from '../preparation/protocol';
import {ChatDelegationRepository,type DelegationCard} from './delegation';
import {ChatProcessingCache} from './processing-cache';
import {consumeProcessingPage,hydrateProcessingSnapshot,type ProcessingProjection} from './processing-projection';
import {BorrowerContextService} from './context';
import {ConversationRepository} from './repository';
import {prepareQuestionAction} from './question-actions';
import {ConversationUploads} from './uploads';
import {ConversationAnswers} from './answers';
import type {ConversationUiSnapshot,ConversationUiTurn} from './conversation-ui';

/** Input must be a server-loaded durable card; never call on browser fields. */
export function processingIntentForCard(card:DelegationCard) {
  return preparationIntentSchema.parse({commandId:card.id,idempotencyKey:card.id,objective:card.intent==='investigate_gap'?'resolve_gap':'understand_and_assess',
      assessmentScope:card.intent==='investigate_gap'?'affected_requirements':'application',documentIds:[],requirementIds:card.requirementId?[card.requirementId]:[],
      origin:{kind:'borrower_request',conversationId:card.conversationId,artifactId:card.id,domainEventId:card.messageId},uploadBatchId:null,expectedContentRevision:card.contentRevision,retryOf:null});
}

/** Trusted server bridge. Owns chat links only; processor owns admission, grants,
 * mode/epoch, inventory, budgets, questions and all authoritative mutations. */
export class ChatProcessingBridge {
  private readonly processor:PreparationService;
  constructor(private readonly access:Access,private readonly database:Pool=pool()){this.processor=new PreparationService(database);}
  async delegate(value:unknown) {
    const repository=new ChatDelegationRepository(this.access,this.database);
    const {card,replayed}=await repository.request(value);
    return {...await this.dispatch(card.id),replayed};
  }
  async dispatch(cardId:string) {
    const repository=new ChatDelegationRepository(this.access,this.database);
    const card=(await repository.read()).find(row=>row.id===cardId);
    if(!card)throw new UploadError('Conversation request not found.',404);
    if(card.processingRunId)return {card,receipt:await this.processor.transaction(this.access,db=>this.processor.receipt(db,this.access,card.processingRunId!))};
    const intent=processingIntentForCard(card);
    const receipt=await this.processor.accept(this.access,intent);
    // Read the immutable admitted command/event under the processor's own auth
    // transaction. Replace with a public run-details method when it is published.
    const binding=await this.processor.transaction(this.access,async db=>{
      const run=(await db.query('SELECT request FROM preparation_runs WHERE id=$1 AND application_id=$2 AND user_id=$3',[receipt.runId,this.access.applicationId,this.access.userId])).rows[0];
      const event=(await db.query(`SELECT payload FROM preparation_stream WHERE application_id=$1 AND user_id=$2
        AND payload->>'runId'=$3 AND payload->>'type'='run.accepted' ORDER BY sequence LIMIT 1`,[this.access.applicationId,this.access.userId,receipt.runId])).rows[0];
      if(!run||!event)throw new UploadError('Processing accepted the request but its receipt is unavailable. Retry the same request.',503);
      return {request:run.request,event:event.payload};
    });
    await repository.bindAdmission(card.id,binding.request,binding.event);
    return {card:{...card,state:'admitted' as const,processingRunId:receipt.runId,executionMode:'processor_owned' as const},receipt};
  }
  async processing():Promise<ProcessingProjection|null> {
    let snapshot=await this.processor.snapshot(this.access);
    if(!snapshot.preparation)return null;
    const cache=new ChatProcessingCache(this.access,this.database),saved=await cache.read(snapshot.preparation.preparationId);
    let projection=saved?.projection;
    if(projection) {
      const page=await this.processor.events(this.access,projection.cursor);
      if(!page.resyncRequired)projection=await consumeProcessingPage(projection,projection.cursor,page.events,page.cursor,(id,revision)=>this.processor.result(this.access,id,revision));
      snapshot=await this.processor.snapshot(this.access);
      if(!snapshot.preparation)return null;
    }
    const currentSnapshot=snapshot;
    projection=await hydrateProcessingSnapshot(snapshot.preparation,
      (id,revision)=>this.processor.result(this.access,id,revision),
      async(id,revision)=>{
        const question=(currentSnapshot.pendingQuestions as unknown[]).map(q=>processingQuestionSchema.parse(q)).find(q=>q.questionId===id&&q.questionRevision===revision);
        if(!question)throw new UploadError('The current question is unavailable. Refresh before answering.',409);
        return question;
      },projection);
    // Snapshots, not replay assumptions, restore in-flight run cards after reload.
    // Durable chat anchors also recover terminal runs that are no longer active.
    const linked=await new ChatDelegationRepository(this.access,this.database).read();
    const receipts=new Map(snapshot.activeRuns.map(run=>[run.runId,run]));
    for(const link of linked)if(link.processingRunId&&!receipts.has(link.processingRunId)) {
      const receipt=await this.processor.transaction(this.access,db=>this.processor.receipt(db,this.access,link.processingRunId!));receipts.set(receipt.runId,receipt);
    }
    for(const receipt of receipts.values()) {
      const prior=projection.cards[receipt.runId];
      projection.cards[receipt.runId]={runId:receipt.runId,artifactId:receipt.artifactId,runRevision:revisionSchema.parse(receipt.runRevision),state:publicStateSchema.parse(receipt.state),
        result:prior?.result??null,current:prior?.current??false,question:prior?.question??null,requiredActor:prior?.requiredActor??null,detail:prior?.detail??null};
    }
    try{await cache.save(saved?.revision??'0',projection);}catch(error){if(!(error instanceof UploadError&&error.status===409))throw error;/* another poll won; this authorized snapshot remains a safe read */}
    return projection;
  }
  async read():Promise<ConversationUiSnapshot> {
    const context=await new BorrowerContextService(this.access,this.database).read();
    const conversations=new ConversationRepository(this.access,this.database),answers=new ConversationAnswers(this.access,this.database);
    const entries=[];let before:string|undefined;
    do {const page=await answers.read(before);entries.push(...page.entries);before=page.nextBefore??undefined;}while(before);
    const turns:ConversationUiTurn[]=[];let after='0',conversationId='';
    for(;;) {
      const page=await conversations.read({after,limit:100});conversationId=page.conversation?.id??'';
      for(const message of page.messages) {
        turns.push({id:message.id,clientMessageId:message.clientMessageId,role:'borrower',text:message.text,createdAt:message.createdAt,freshness:'current'});
        const entry=entries.find(e=>e.messageId===message.id);
        if(entry)turns.push({id:entry.id,clientMessageId:message.clientMessageId,role:'assistant',text:entry.question,createdAt:entry.createdAt,freshness:entry.freshness, ...(entry.answer?{answer:entry.answer}:{})});
      }
      if(!page.hasMore||!page.nextAfter)break;after=page.nextAfter;
    }
    const mode=await this.processor.transaction(this.access,db=>processorMode(db,this.access.applicationId));
    const agentEnabled=process.env.BORROWER_AGENT_CHAT==='1'&&mode.mode==='adaptive';
    const agentTurns=agentEnabled?await new BorrowerAgentService(this.database).read(this.access):[];
    for(const t of agentTurns)if(t.text)turns.push({id:t.id,clientMessageId:t.sourceMessageId??t.id,role:'assistant',text:t.text,createdAt:t.createdAt,freshness:t.freshness});
    turns.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const pendingRequests=(await new ChatDelegationRepository(this.access,this.database).read()).filter(card=>card.state==='pending_admission');
    const uploads=[];let uploadBefore:string|undefined;
    do {const page=await new ConversationUploads(this.access,this.database).read(uploadBefore);uploads.push(...page.cards);uploadBefore=page.nextBefore??undefined;}while(uploadBefore);
    for(const upload of uploads){
      const saved=upload.members.filter(file=>file.state==='saved');
      if(upload.state!=='open'&&saved.length)turns.push({id:upload.artifactId,clientMessageId:upload.artifactId,uploadBatchId:upload.batchId,role:'borrower',text:`Uploaded ${saved.length} file${saved.length===1?'':'s'}`,files:saved.map(file=>({id:file.id,name:file.name,documentId:file.document_id??undefined})),createdAt:upload.createdAt,freshness:'current'});
    }
    turns.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    const processing=await this.processing();
    const activity=await readAgentActivity(this.processor,this.access);
    return {activity,agentEnabled,agentActivity:agentTurns.some(t=>t.state==='running')?'running':agentTurns.some(t=>t.state==='queued')?'queued':undefined,agentPending:agentTurns.some(t=>t.state==='queued'||t.state==='running'),agentBlocked:agentTurns.some(t=>t.state==='blocked'),conversationId,turns,processing,pendingRequests,uploads,documents:context.documents.map(d=>({id:d.id,name:d.name})),requirements:context.requirements.filter(r=>r.collection==='borrower').map(r=>({id:r.id,title:r.title})),pollAfterMs:3000,executionLabel:mode.mode==='adaptive'?'live':'not_connected',contextRevision:context.revision};
  }
  async confirmMapping(input:unknown) {
    try{return await confirmPreparationMapping(this.processor,this.access,input);}
    catch(error){if(error instanceof Error&&/outdated|conflict|changed|precedence|unavailable/i.test(error.message))throw new UploadError('This mapping suggestion changed or is no longer available. Refresh before confirming.',409);throw error;}
  }
  async answer(input:unknown) {
    const questionId=(input as {questionId?:unknown})?.questionId;
    if(typeof questionId!=='string'||!questionId||questionId.length>256)throw new UploadError('Invalid question.',400);
    const question=await this.processor.transaction(this.access,async db=>{
      const row=(await db.query('SELECT payload FROM preparation_questions WHERE id=$1 AND application_id=$2 AND user_id=$3',[questionId,this.access.applicationId,this.access.userId])).rows[0];
      if(!row)throw new UploadError('Question not found.',404);
      return processingQuestionSchema.parse(row.payload);
    });
    // Final inventory/epoch/dependency equality and idempotent replay are enforced
    // by PreparationService.answer, including already-answered questions.
    const command=prepareQuestionAction(question,question.dependencyFingerprint,input);
    if(command.kind==='confirm_link')throw new UploadError('Link confirmation is not connected to the processor yet. Use existing file controls.',503);
    try{return await this.processor.answer(this.access,{questionId:command.questionId,expectedQuestionRevision:command.expectedQuestionRevision,idempotencyKey:command.clientActionId,text:command.answer});}
    catch(error){if(error instanceof Error&&['Question is outdated','Answer conflict'].includes(error.message))throw new UploadError('This question changed. Refresh it; your entered answer is retained.',409);throw error;}
  }
  async source(resultId:string,resultRevision:string,citationId:string) {
    const result=parseCompletenessResult(await this.processor.result(this.access,resultId,resultRevision));
    const citation=result.citations.find(c=>c.citationId===citationId);
    if(!citation)throw new UploadError('Citation not found.',404);
    if(citation.kind!=='structured_record')await this.processor.transaction(this.access,async db=>{
      if(!(await db.query('SELECT 1 FROM documents WHERE application_id=$1 AND id=$2 AND sha256=$3',[this.access.applicationId,citation.documentId,citation.sha256])).rowCount)
        throw new UploadError('Cited original is unavailable.',404);
    });
    return citation;
  }
}
