"use client";
import ChatMessage from './chat-message';
import ResponseProgress from './response-progress';
import {useEffect,useRef,useState} from 'react';
import type {ConversationUiProps,ConversationUiSnapshot,ConversationUiIntent,ConversationUiAdapter,ConversationStreamState} from '@/lib/borrower-chat/conversation-ui';
import type {ProcessingProjection} from '@/lib/borrower-chat/processing-projection';
import type {processingQuestionSchema} from '@/lib/preparation/protocol';
import {ConversationUiError} from '@/lib/borrower-chat/conversation-ui';
import styles from './processing-conversation.module.css';
import DocumentPreview from './document-preview';
import {ArrowUp,Paperclip,FileText,X,Sparkles} from 'lucide-react';
import type {AnswerSource} from '@/lib/borrower-chat/retrieval';

type Question=ReturnType<typeof processingQuestionSchema.parse>;
const intents:Record<ConversationUiIntent,string>={requested:"What's requested?",uploaded:"What's been uploaded?",missing:"What's still missing?",investigate_gap:'Investigate a request',review_documents:'Check document completeness'};
const ownerLabel=(owner:string,reason?:string|null)=>owner==='borrower'?'Your next step':owner==='lender'?'Requires lender input':reason==='budget_exhausted'?'Requires a budget review':'Requires service attention';
const detailLabels:Record<string,string>={clarification_required:'A clarification will help continue this check.',budget_exhausted:'Processing paused because its configured budget is exhausted.',provider_outcome_unknown:'The service could not confirm the previous attempt. Your files remain saved.',tool_or_validation_limit:'A document-checking step could not finish. Your files remain saved; the service needs to recover this check.',execution_limit:'The investigation reached its step limit before finishing. Your files and findings remain saved.',invalid_model_output:'The response could not be verified.',clarification_received:'Your answer was received.',reviewing_evidence:'Reviewing document evidence.',borrower_cancelled:'You canceled this investigation.'};
const states={queued:'Queued',running:'Investigating documents',waiting_input:'Waiting for an action',succeeded:'Investigation finished',partial:'Findings available; some questions remain',failed:'Investigation could not finish',canceled:'Investigation canceled',superseded:'Out of date'};
function Questions({projection,onAnswer,disabled}:{projection:ProcessingProjection;onAnswer:(q:Question,value:string|boolean)=>Promise<void>;disabled:boolean}) {
  const questions=new Map(projection.questions.map(q=>[q.questionId,q]));
  for(const card of Object.values(projection.cards))if(card.question)questions.set(card.question.questionId,card.question);
  return <>{[...questions.values()].map(question=><QuestionForm key={question.questionId} question={question} onAnswer={onAnswer} disabled={disabled||projection.resyncRequired||question.allowedActionIds.length===0}/>)}</>;
}
function QuestionForm({question,onAnswer,disabled}:{question:Question;onAnswer:(q:Question,value:string|boolean)=>Promise<void>;disabled:boolean}) {
  const [value,setValue]=useState(''),[error,setError]=useState('');
  const schema=question.answerSchema;
  async function submit(answer:string|boolean){setError('');try{await onAnswer(question,answer);}catch(e){setError(e instanceof Error?e.message:'Could not confirm the answer. Your input is retained.');}}
  return <section className={styles.question} aria-label="Clarification">
    <h4>{question.prompt}</h4>
    {question.requiredActor!=='borrower'?<p>{ownerLabel(question.requiredActor)}. No answer is needed from you, and no message has been sent.</p>:<>
      <p>{schema.kind==='link_confirmation'?'Confirming changes a file association. You can correct associations using existing file controls.':'Your answer is recorded as your statement; it does not replace document evidence.'}</p>
      {schema.kind==='attributed_text'&&<label>Your answer<textarea value={value} maxLength={schema.maxLength} onChange={e=>setValue(e.target.value)}/></label>}
      {schema.kind==='choice'&&<fieldset><legend>Choose an answer</legend>{schema.options.map(option=><label key={option.id}><input type="radio" name={question.questionId} value={option.id} checked={value===option.id} onChange={()=>setValue(option.id)}/>{option.label}</label>)}</fieldset>}
      <div className={styles.actions}>{schema.kind==='link_confirmation'?<><button disabled={disabled} onClick={()=>void submit(true)}>Confirm link</button><button disabled={disabled} onClick={()=>void submit(false)}>Reject link</button></>:<button disabled={disabled||!value.trim()} onClick={()=>void submit(value)}>Send answer</button>}</div>
    </>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
/** Persisted conversation; injected test adapters remain explicitly labelled. */
export default function ProcessingConversation({applicationId,adapter,uploadSlot,uploadCommit,onUpdated,initialSnapshot,workspaceTitle,documents}:ConversationUiProps) {
  const [snapshot,setSnapshot]=useState<ConversationUiSnapshot|null>(initialSnapshot??null),[error,setError]=useState('');
  const [optimistic,setOptimistic]=useState<{clientMessageId:string;text:string;createdAt:string;status:'sending'|'sent'|'failed'}[]>([]);
  const [live,setLive]=useState<ConversationStreamState|null>(null),[streamError,setStreamError]=useState('');
  const [committedUploads,setCommittedUploads]=useState<NonNullable<ConversationUiProps['uploadCommit']>[]>([]);
  const terminalStream=useRef('');
  const stickToBottom=useRef(true);
  const [intent,setIntent]=useState<ConversationUiIntent>('requested'),[text,setText]=useState(''),[requirementId,setRequirementId]=useState('');
  const [busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[source,setSource]=useState<Awaited<ReturnType<ConversationUiAdapter['source']>>|null>(null);
  const [selectedDocument,setSelectedDocument]=useState<string|null>(null),[recordSource,setRecordSource]=useState<AnswerSource|null>(null),[showUpload,setShowUpload]=useState(false);
  const pending=useRef<{clientMessageId:string;text:string;intent:ConversationUiIntent;requirementId?:string}|null>(null);
  const timelineRef=useRef<HTMLDivElement>(null),scrollAfterReply=useRef(false);
  useEffect(()=>{
    if(!uploadCommit)return;
    setCommittedUploads(previous=>[...previous,uploadCommit]);
    if(uploadCommit.complete)setShowUpload(false);
    scrollAfterReply.current=true;stickToBottom.current=true;setRefresh(n=>n+1);
  },[uploadCommit]);
  useEffect(()=>{if(scrollAfterReply.current||stickToBottom.current){timelineRef.current?.scrollTo({top:timelineRef.current.scrollHeight,behavior:'auto'});scrollAfterReply.current=false;}},[snapshot?.turns.length,optimistic,live,busy,committedUploads]);
  useEffect(()=>{
    if(!adapter?.listen||!snapshot?.agentEnabled)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function connect(){
      try{
        await adapter!.listen!(controller.signal,next=>{
          if(controller.signal.aborted)return;
          setLive(next);setStreamError('');
          const terminal=JSON.stringify(next.drafts.filter(d=>d.status!=='streaming').map(d=>[d.turnId,d.status]));
          if(terminal!==terminalStream.current){terminalStream.current=terminal;setRefresh(n=>n+1);}
        });
      }catch(e){
        if(controller.signal.aborted)return;
        setStreamError('Live response interrupted. Reconnecting…');
        if(e instanceof ConversationUiError&&e.kind==='denied'){setLive(null);setSnapshot(null);setError('Conversation access is unavailable.');return;}
      }
      if(!controller.signal.aborted)timer=setTimeout(connect,750);
    }
    void connect();return()=>{controller.abort();clearTimeout(timer);};
  },[adapter,snapshot?.agentEnabled]);
  const mappingKeys=useRef(new Map<string,string>());
  const pendingAnswer=useRef<{signature:string;clientActionId:string}|null>(null);
  const actionController=useRef<AbortController|null>(null),sourceController=useRef<AbortController|null>(null),sourceHeading=useRef<HTMLHeadingElement>(null),sourceOpener=useRef<HTMLElement|null>(null);
  useEffect(()=>()=>{actionController.current?.abort();sourceController.current?.abort();},[]);
  useEffect(()=>{sourceHeading.current?.focus();},[source,selectedDocument,recordSource]);
  useEffect(()=>{
    if(!adapter)return;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){let delay=5000;
      try{const next=await adapter!.read(controller.signal);if(!controller.signal.aborted){setSnapshot(next);setError('');delay=next.pollAfterMs;}}
      catch(e){if(!controller.signal.aborted){if(e instanceof ConversationUiError&&e.kind==='denied')setSnapshot(null);setSource(null);setError(e instanceof Error?e.message:'Conversation unavailable. Your draft is retained.');}}
      finally{if(!controller.signal.aborted)timer=setTimeout(poll,Math.max(2000,Math.min(delay,15000)));}
    }
    void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[adapter,refresh]);
  async function send(selectedIntent?:ConversationUiIntent){
    if(!adapter||actionController.current)return;
    const sendingIntent=selectedIntent??intent;
    pending.current??={clientMessageId:crypto.randomUUID(),intent:sendingIntent,text:selectedIntent?intents[sendingIntent]:text.trim()||intents[sendingIntent],...(sendingIntent==='investigate_gap'?{requirementId}:{})};
    const outgoing=pending.current;
    setOptimistic(items=>[...items.filter(item=>item.clientMessageId!==outgoing.clientMessageId),{...outgoing,createdAt:new Date().toISOString(),status:'sending'}]);
    setText('');scrollAfterReply.current=true;stickToBottom.current=true;
    const controller=new AbortController();actionController.current=controller;setBusy(true);setError('');
    try{await adapter.send(pending.current,controller.signal);if(!controller.signal.aborted){setOptimistic(items=>items.map(item=>item.clientMessageId===outgoing.clientMessageId?{...item,status:'sent'}:item));pending.current=null;scrollAfterReply.current=true;setRefresh(n=>n+1);}}
    catch(e){if(!controller.signal.aborted){setOptimistic(items=>items.map(item=>item.clientMessageId===outgoing.clientMessageId?{...item,status:'failed'}:item));setText(outgoing.text);if(e instanceof ConversationUiError&&e.kind==='conflict')pending.current=null;if(e instanceof ConversationUiError&&e.kind==='denied')setSnapshot(null);setError(e instanceof Error?e.message:'Could not confirm receipt. Retry the same message.');}}
    finally{actionController.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  async function answer(question:Question,value:string|boolean){
    if(!adapter||actionController.current)throw new Error('Wait for the current action.');
    const signature=JSON.stringify([question.questionId,question.questionRevision,value]);
    if(pendingAnswer.current&&pendingAnswer.current.signature!==signature)throw new Error('Retry your previous answer before sending a different one.');
    pendingAnswer.current??={signature,clientActionId:crypto.randomUUID()};
    const controller=new AbortController();actionController.current=controller;setBusy(true);
    try{await adapter.answer({clientActionId:pendingAnswer.current.clientActionId,questionId:question.questionId,expectedQuestionRevision:question.questionRevision,actionId:question.allowedActionIds[0],answer:value},controller.signal);pendingAnswer.current=null;setRefresh(n=>n+1);}
    catch(e){if(e instanceof ConversationUiError&&e.kind==='conflict'){pendingAnswer.current=null;setRefresh(n=>n+1);}if(e instanceof ConversationUiError&&e.kind==='denied')setSnapshot(null);throw e;}
    finally{actionController.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  async function confirmMapping(resultId:string,resultRevision:string,actionId:string){
    if(!adapter?.confirmMapping||actionController.current)return;
    const key=`${resultId}:${resultRevision}:${actionId}`;
    if(!mappingKeys.current.has(key))mappingKeys.current.set(key,crypto.randomUUID());
    const controller=new AbortController();actionController.current=controller;setBusy(true);setError('');
    try{await adapter.confirmMapping({resultId,resultRevision,actionId,idempotencyKey:mappingKeys.current.get(key)!},controller.signal);if(!controller.signal.aborted){setRefresh(n=>n+1);await onUpdated?.();}}
    catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Could not confirm this link. Retry to reconcile the same action.');if(e instanceof ConversationUiError&&e.kind==='denied')setSnapshot(null);}}
    finally{actionController.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  async function openSource(resultId:string,resultRevision:string,citationId:string){
    if(!adapter)return;setRecordSource(null);setSelectedDocument(null);sourceOpener.current=document.activeElement as HTMLElement;sourceController.current?.abort();const controller=new AbortController();sourceController.current=controller;setSource(null);
    try{const next=await adapter.source({resultId,resultRevision,citationId},controller.signal);if(!controller.signal.aborted)setSource(next);}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Source unavailable.');}
  }
  function closeSource(){setSource(null);setSelectedDocument(null);setRecordSource(null);requestAnimationFrame(()=>{if(sourceOpener.current?.isConnected)sourceOpener.current.focus();});}
  function openDocument(id:string){sourceOpener.current=document.activeElement as HTMLElement;sourceController.current?.abort();setSource(null);setRecordSource(null);setSelectedDocument(id);}
  function openRecord(citation:AnswerSource){sourceOpener.current=document.activeElement as HTMLElement;sourceController.current?.abort();setSource(null);setSelectedDocument(citation.reference.kind==='document'?citation.reference.documentVersionId:null);setRecordSource(citation);}
  const previewDocument=documents?.find(d=>d.id===(selectedDocument??(source&&source.kind!=='structured_record'?source.documentId:null)));
  const hasPreview=!!(source||selectedDocument||recordSource);
  const processing=snapshot?.processing;
  const result=processing?.currentResult;
  const disconnected=!adapter||snapshot?.executionLabel==='not_connected';
  const activity=live?.activity??snapshot?.activity??[];
  const activeActivity=activity.filter(item=>item.status==='running').at(-1);
  const investigation=intent==='investigate_gap'||intent==='review_documents';
  const cards=processing?[...new Map(Object.values(processing.cards).map(card=>[card.artifactId??card.runId,card])).values()]:[];
  const unconfirmed=optimistic.filter(item=>!snapshot?.turns.some(turn=>turn.role==='borrower'&&turn.clientMessageId===item.clientMessageId));
  const drafts=(live?.drafts??[]).filter(d=>!snapshot?.turns.some(turn=>turn.id===d.turnId));
  const streaming=drafts.filter(d=>d.status!=='interrupted'&&d.text);
  const latestBorrower=snapshot?.turns.filter(turn=>turn.role==='borrower').at(-1);
  const interrupted=drafts.some(d=>d.status==='interrupted'&&d.sourceMessageId===latestBorrower?.id);
  const awaiting=unconfirmed.some(item=>item.status!=='failed'&&!live?.drafts.some(d=>d.clientMessageId===item.clientMessageId));
  const reviewing=cards.some(card=>card.state==='running'||card.state==='queued');
  const receiptMap=new Map<string,NonNullable<ConversationUiProps['uploadCommit']>['receipts'][number]&{createdAt:string}>();
  for(const commit of committedUploads)for(const receipt of commit.receipts){
    const prior=receiptMap.get(receipt.batchId);
    receiptMap.set(receipt.batchId,{...receipt,createdAt:prior?.createdAt??commit.createdAt,files:[...new Map([...(prior?.files??[]),...receipt.files].map(file=>[file.id,file])).values()]});
  }
  const localUploads=[...receiptMap.values()].filter(receipt=>!snapshot?.turns.some(turn=>turn.uploadBatchId===receipt.batchId&&receipt.files.every(file=>turn.files?.some(saved=>saved.id===file.id)))).map(receipt=>({id:`local-upload:${receipt.batchId}`,clientMessageId:receipt.batchId,uploadBatchId:receipt.batchId,role:'borrower' as const,text:`Uploaded ${receipt.files.length} file${receipt.files.length===1?'':'s'}`,files:receipt.files,createdAt:receipt.createdAt,freshness:'current' as const}));
  const dialogue:ConversationUiSnapshot['turns']=[...(snapshot?.turns??[]).filter(turn=>!localUploads.some(local=>local.uploadBatchId===turn.uploadBatchId)),...localUploads].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  const working=busy||awaiting||(live?live.pending:!!snapshot?.agentPending||!!activeActivity||reviewing);
  return <section className={`${styles.shell} ${workspaceTitle?styles.workspace:""} ${hasPreview?styles.hasPreview:""}`} aria-label="Application conversation">
    <div className={styles.scrollArea} ref={timelineRef} onScroll={()=>{const element=timelineRef.current;if(element)stickToBottom.current=element.scrollHeight-element.scrollTop-element.clientHeight<100;}}>
    {workspaceTitle?<header className={styles.welcome}><div className={styles.assistantMark}><Sparkles size={24}/></div><p className={styles.kicker}>YOUR LOAN, A LITTLE SIMPLER</p><h1>Let’s move your loan forward.</h1><p>I’m here to help with your documents and requests.<br/>Your existing loan is connected. Where would you like to start?</p></header>:<header className={styles.header}><div><h2>Your application</h2><p>Upload documents, understand requests, and follow completeness checks.</p></div><span className={styles.meta}>One conversation</span></header>}
    {workspaceTitle&&!!snapshot?.documents?.length&&<details className={styles.files}><summary><FileText size={15}/> Loan documents <span>{snapshot.documents.length}</span></summary><div>{snapshot.documents.map(doc=><button key={doc.id} onClick={()=>openDocument(doc.id)}><FileText size={15}/>{doc.name}</button>)}</div></details>}
    {disconnected&&<p className={styles.notice}>Document investigation is not connected. No processing request can be sent from this preview.</p>}
    {snapshot?.executionLabel==='simulated'&&<p className={styles.notice}>Simulated integration preview. These findings do not demonstrate real document investigation.</p>}
    {error&&<p role="alert" className={styles.error}>{error} <button onClick={()=>setRefresh(n=>n+1)}>Refresh conversation</button></p>}
    <div className={styles.timeline}>
      {snapshot?.agentBlocked&&<p role="status">An assistant step could not finish. Your documents and progress are saved; the service needs to recover this step.</p>}
      {snapshot?.pendingRequests?.map(request=><article className={styles.card} key={request.id}><h3>Request saved</h3><p>Processing has not yet been admitted. This request remains saved if you close the browser.</p></article>)}
      {processing?.resyncRequired&&<p role="status">Evidence changed. Refreshing current findings; earlier results are not treated as current.</p>}

      {processing&&cards.filter(card=>!snapshot?.uploads?.some(upload=>upload.artifactId===card.artifactId)).map(card=><article className={styles.card} key={card.artifactId??card.runId}><h3>{states[card.state]}</h3>{card.detail&&<p>{detailLabels[card.detail]??'The investigation status changed.'}</p>}{card.result&&!card.current&&<p>These findings are historical or out of date.</p>}{card.requiredActor&&<p>{ownerLabel(card.requiredActor,card.detail)}</p>}</article>)}
      {result&&!processing?.resyncRequired&&!error&&<article className={styles.card}><details><summary>Current completeness findings</summary>{result.requirements.map(requirement=><div key={requirement.requirementId}><h4>{snapshot?.requirements.find(r=>r.id===requirement.requirementId)?.title??'Other request'}</h4><p>{requirement.assessment==='appears_complete'?'Appears complete':requirement.assessment==='incomplete'?'Incomplete':'Cannot determine yet'}</p><ul>{requirement.checks.map(check=><li key={check.criterionId}>{check.explanation}</li>)}{requirement.gaps.map((gap,i)=><li key={i}>{gap.description} · {ownerLabel(gap.owner)}</li>)}</ul></div>)}{result.allowedNextActions.filter(action=>action.kind==='confirm_link'&&action.owner==='borrower').map(action=><div key={action.actionId}><p>Suggested link: {snapshot?.documents?.find(d=>d.id===action.documentId)?.name??'Saved document'} → {snapshot?.requirements.find(r=>r.id===action.requirementId)?.title??'Request'}. Confirm only if this association is correct; existing file controls remain available to change it.</p><button disabled={busy||!adapter?.confirmMapping} onClick={()=>void confirmMapping(result.resultId,result.resultRevision,action.actionId)}>Confirm suggested link</button></div>)}<p>{result.limitations.length} limitations; {result.conflicts.length} conflicts. AI completeness is not lender acceptance.</p><div className={styles.actions}>{result.citations.map((citation,index)=><button key={citation.citationId} disabled={!adapter} onClick={()=>void openSource(result.resultId,result.resultRevision,citation.citationId)}>Source {index+1}</button>)}</div></details></article>}
      {processing&&<Questions projection={processing} onAnswer={answer} disabled={busy||disconnected||!snapshot||!!error}/>}
      {dialogue.map(turn=><article key={turn.id} className={`${styles.card} ${turn.role==='borrower'?styles.borrower:''}`}><p className={styles.meta}>{turn.role==='borrower'?'You':'Application assistant'} · {new Date(turn.createdAt).toLocaleString()}</p>{turn.role==='assistant'?<ChatMessage text={turn.text}/>:<div><p className={styles.borrowerText}>{turn.text}</p>{turn.files&&<ul className={styles.uploadReceipt}>{turn.files.map(file=><li key={file.id}>{file.documentId?<button type="button" aria-label={`Preview ${file.name}`} aria-expanded={selectedDocument===file.documentId} onClick={()=>openDocument(file.documentId!)}><FileText size={16}/><span>{file.name}</span></button>:<><FileText size={16}/><span>{file.name}</span></>}</li>)}</ul>}</div>}{turn.freshness==='outdated'?<details className={styles.freshness}><summary>Earlier context</summary><p>The conversation, files, or processing status changed after this reply. It may still be useful; ask again if you need the latest status.</p></details>:turn.answer&&<><p>{turn.answer.summary}</p>{turn.answer.notes.map((note,i)=><p key={i}>{note}</p>)}{turn.answer.items.map((item,i)=><div key={i}><h4>{item.title}</h4><ul>{item.lines.map((line,j)=><li key={j}>{line}</li>)}</ul><div className={styles.actions}>{item.sourceIds.map(id=>{const citation=turn.answer!.sources.find(s=>s.id===id);return citation?<button className={styles.citationButton} key={id} onClick={()=>openRecord(citation)}><FileText size={13}/>{citation.label}</button>:null;})}</div></div>)}</>}</article>)}
      {unconfirmed.map(item=><article key={`local:${item.clientMessageId}`} className={`${styles.card} ${styles.borrower}`}><p className={styles.meta}>You · {item.status==='sending'?'Sending…':item.status==='failed'?'Not confirmed — retry your message':'Sent'}</p><p className={styles.borrowerText}>{item.text}</p></article>)}
      {streaming.map(draft=><article key={draft.turnId} className={styles.card} aria-label="Assistant response"><p className={styles.meta}>Application assistant{draft.status==='streaming'?' · Writing…':''}</p><ChatMessage text={draft.text}/></article>)}
      {interrupted&&<p role="status" className={styles.notice}>The response was interrupted. Your message is saved.</p>}
      {working&&<div className={styles.inlineActivity} aria-label="Assistant working"><ResponseProgress uploading={live?.uploadPending} saving={busy} pending={working} reviewing={reviewing} queued={!busy&&snapshot?.agentActivity==='queued'} unavailable={!!error||!!streamError} activity={activity}/></div>}
    </div>
    </div>
    {hasPreview&&<aside className={styles.source} aria-label="Document preview" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();closeSource();}}}><div className={styles.sourceHeader}><div><span className={styles.kicker}>LOAN DOCUMENTS</span><h3 ref={sourceHeading} tabIndex={-1}>{recordSource?.label??previewDocument?.original_name??'Cited source'}</h3></div><button aria-label="Close preview" onClick={closeSource}><X size={19}/></button></div>
      {source&&(source.kind==='structured_record'?<p>Record {source.recordId}, revision {source.recordRevision}, field {source.field}</p>:<><p>{snapshot?.documents?.find(d=>d.id===source.documentId)?.name??'Original document'} · {source.kind==='artifact'?source.sourceLocation??`page ${source.page}`:`record ${source.record}, column ${source.column}`}</p><blockquote>{source.quote}</blockquote></>)}
      {recordSource&&<div className={styles.recordDetails}>{recordSource.detail.filter(line=>!line.startsWith('SHA-256:')).map((line,i)=><p key={i}>{line}</p>)}</div>}
      {previewDocument&&applicationId?<><a className={styles.download} href={`/api/documents/${encodeURIComponent(previewDocument.id)}?applicationId=${encodeURIComponent(applicationId)}`}>Download original ↗</a><div className={styles.documentCanvas}><DocumentPreview portablePdf key={previewDocument.id} document={previewDocument} applicationId={applicationId}/></div></>:selectedDocument&&<p>This document is not available in the current application snapshot. Refresh and try again.</p>}
    </aside>}
    <div className={styles.composerDock}>
    {workspaceTitle&&<nav className={styles.quickQuestions} aria-label="Quick questions">{(['requested','uploaded','missing'] as const).map(value=><button type="button" key={value} disabled={busy||!!pending.current||!snapshot} onClick={()=>{setIntent(value);void send(value);}}>{intents[value]}</button>)}</nav>}
    {uploadSlot&&<section hidden={!!workspaceTitle&&!showUpload} className={styles.uploadTray} aria-label="Upload documents">{uploadSlot}</section>}
    <form className={styles.composer} onSubmit={e=>{e.preventDefault();void send();}}>
      {!snapshot?.agentEnabled&&<label className={styles.actionSelect}><span>Ask about</span> <select value={intent} disabled={busy||!!pending.current} onChange={e=>setIntent(e.target.value as ConversationUiIntent)}>{Object.entries(intents).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
      {!snapshot?.agentEnabled&&intent==='investigate_gap'&&<label>Request <select value={requirementId} disabled={busy||!!pending.current} onChange={e=>setRequirementId(e.target.value)}><option value="">Choose a request</option>{snapshot?.requirements.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>}
      <label className={styles.messageLabel}><span>Message</span><textarea value={text} maxLength={16000} disabled={busy||!!pending.current} onChange={e=>setText(e.target.value)} onKeyDown={e=>{
        if(e.key!=='Enter'||e.shiftKey||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;
        e.preventDefault();
        if(e.repeat||!text.trim())return;
        const submit=e.currentTarget.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
        if(submit&&!submit.disabled)e.currentTarget.form?.requestSubmit(submit);
      }} placeholder={snapshot?.agentEnabled?"Ask anything…":workspaceTitle?"Add a note…":"Optional note"}/></label>
      <div className={styles.composerTools}>{workspaceTitle&&<button type="button" className={styles.attach} aria-label="Attach documents" aria-expanded={showUpload} onClick={()=>setShowUpload(v=>!v)}><Paperclip size={19}/></button>}<button className={styles.send} aria-label={busy?'Saving message':pending.current?'Retry message':'Send message'} type="submit" disabled={busy||!adapter||(investigation&&disconnected)||!snapshot||(!snapshot?.agentEnabled&&intent==='investigate_gap'&&!requirementId)}>{workspaceTitle?<ArrowUp size={21}/>:busy?'Saving…':pending.current?'Retry message':'Send'}</button></div>
    </form>
    </div>
  </section>;
}
