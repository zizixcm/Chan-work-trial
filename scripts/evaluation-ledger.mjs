// Deployment-only cumulative live evaluation ledger. Contains no prompts or secrets.
import { openSync, closeSync, fsyncSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
const LIMIT = 20_000_000;
function change(file, fn) {
 const lock=file+'.lock'; const descriptor=openSync(lock,'wx',0o600);
 try {
  const state=JSON.parse(readFileSync(file,'utf8'));
  if(![LIMIT,100_000_000].includes(state.limitMicros) || !Array.isArray(state.calls)) throw new Error('Invalid evaluation ledger');
  const result=fn(state);
  state.updatedAt=new Date().toISOString();
  const temporary=openSync(file+'.tmp','w',0o600);
  try{writeFileSync(temporary,JSON.stringify(state,null,2)+'\n');fsyncSync(temporary);}finally{closeSync(temporary);}
  renameSync(file+'.tmp',file);
  return result;
 } finally { closeSync(descriptor); unlinkSync(lock); }
}
function integer(value){if(!Number.isSafeInteger(value)||value<0)throw new Error('Expected nonnegative integer microdollars');}
function total(state){return state.calls.reduce((sum,c)=>sum+(c.actualMicros===null?c.reservedMicros:Math.max(c.actualMicros,c.reservedMicrosRetained||0)),0);}
function approvedBatchLimit(state,batchId){
 const calls=state.calls.filter(c=>c.batchId===batchId),amendments=(state.batchAmendments??[]).filter(a=>a.batchId===batchId);
 let limit=calls[0]?.batchLimitMicros;
 const approved=new Set(limit===undefined?[]:[limit]);
 for(const a of amendments){
  if(limit===undefined||a.previousLimitMicros!==limit||!Number.isSafeInteger(a.newLimitMicros)||a.newLimitMicros<=limit||a.newLimitMicros>state.limitMicros||!a.reason||!a.authorizationRef||!a.amendedAt)throw new Error('Invalid batch amendment history');
  limit=a.newLimitMicros;approved.add(limit);
 }
 if(calls.some(c=>!approved.has(c.batchLimitMicros)))throw new Error('Unapproved historical batch limit');
 return limit;
}
export function evaluationBatchLimit(file,batchId){const state=JSON.parse(readFileSync(file,'utf8'));if(![LIMIT,100_000_000].includes(state.limitMicros)||!Array.isArray(state.calls))throw Error('Invalid evaluation ledger');return approvedBatchLimit(state,batchId);}
/** Explicit operator action after human authorization; never called by reservation.
 * Keeps old call records unchanged and appends an auditable cap amendment.
 * @param {string} file
 * @param {{batchId:string,expectedLimitMicros:number,newLimitMicros:number,reason:string,authorizationRef:string}} amendment */
export function amendEvaluationBatchLimit(file,{batchId,expectedLimitMicros,newLimitMicros,reason,authorizationRef}){
 integer(expectedLimitMicros);integer(newLimitMicros);
 if(!/^[a-zA-Z0-9_.:-]{1,160}$/.test(batchId)||!reason?.trim()||!authorizationRef?.trim())throw new Error('Explicit budget authorization metadata required');
 if(newLimitMicros<=expectedLimitMicros||newLimitMicros>100_000_000)throw new Error('Invalid amended batch limit');
 return change(file,state=>{
  if(newLimitMicros>state.limitMicros)throw new Error('Invalid amended batch limit');
  if(state.calls.some(c=>c.actualMicros===null||c.reservedMicrosRetained>0||c.boundViolation))throw new Error('Budget amendment requires settled idle ledger');
  const current=approvedBatchLimit(state,batchId);
  if(current===undefined||current!==expectedLimitMicros)throw new Error('Batch limit changed or batch is unknown');
  const amendment={batchId,previousLimitMicros:current,newLimitMicros,reason:reason.trim(),authorizationRef:authorizationRef.trim(),amendedAt:new Date().toISOString()};
  state.batchAmendments??=[];state.batchAmendments.push(amendment);
  return amendment;
 });
}
export function initializeLedger(file){writeFileSync(file,JSON.stringify({evaluationId:'chat-processing-first-integrated-trial',limitMicros:LIMIT,calls:[]},null,2)+'\n',{flag:'wx',mode:0o600});}
/** Call immediately BEFORE dispatch; duplicate call IDs are rejected, not replayed.
 * @param {string} file
 * @param {{callId:string,model:string,upperBoundMicros:number,scenario:string,configurationDigest?:string|null,batchId?:string,batchLimitMicros?:number}} reservation */
export function reserveEvaluationCall(file,{callId,model,upperBoundMicros,scenario,configurationDigest=null,batchId,batchLimitMicros}){
 integer(upperBoundMicros); if(!upperBoundMicros||!callId||!model||!scenario)throw new Error('Missing reservation fields');
 return change(file,state=>{
  if(batchId!==undefined){
   if(!/^[a-zA-Z0-9_.:-]{1,160}$/.test(batchId))throw new Error('Invalid batch ID');
   integer(batchLimitMicros);if(!batchLimitMicros||batchLimitMicros>state.limitMicros)throw new Error('Invalid batch limit');
   const prior=state.calls.filter(c=>c.batchId===batchId);
   const approved=approvedBatchLimit(state,batchId);
   if((approved!==undefined&&approved!==batchLimitMicros)||total({calls:prior})+upperBoundMicros>batchLimitMicros)throw new Error('Batch budget unavailable');
  }
  if(state.calls.some(c=>c.callId===callId))throw new Error('Call ID already reserved; do not dispatch twice');
  if(state.calls.some(c=>c.boundViolation)||total(state)+upperBoundMicros>state.limitMicros)throw new Error('Evaluation budget unavailable');
  state.calls.push({callId,model,scenario,configurationDigest,...(batchId?{batchId,batchLimitMicros}:{}),reservedMicros:upperBoundMicros,actualMicros:null,status:'reserved',reservedAt:new Date().toISOString()});
  return {callId,remainingMicros:state.limitMicros-total(state)};
 });
}
/** Missing/ambiguous accounting retains the entire reservation indefinitely.
 * @param {string} file
 * @param {string} callId
 * @param {number|null} actualMicros */
export function settleEvaluationCall(file,callId,actualMicros=null){
 if(actualMicros!==null)integer(actualMicros);
 return change(file,state=>{
  const call=state.calls.find(c=>c.callId===callId); if(!call)throw new Error('No reservation');
  if(call.status==='settled')throw new Error('Already settled');
  call.actualMicros=actualMicros;call.status=actualMicros===null?'uncertain':'settled';
  call.boundViolation=actualMicros!==null&&actualMicros>call.reservedMicros;
  call.settledAt=new Date().toISOString();
  return {accountedMicros:total(state),remainingMicros:Math.max(0,state.limitMicros-total(state)),boundViolation:call.boundViolation};
 });
}
export function evaluationSummary(file){const state=JSON.parse(readFileSync(file,'utf8'));return {limitMicros:state.limitMicros,accountedMicros:total(state),knownMicros:state.calls.reduce((s,c)=>s+(c.actualMicros??0),0),heldMicros:state.calls.reduce((s,c)=>s+(c.actualMicros===null?c.reservedMicros:0),0),calls:state.calls.length};}

/** Explicit total-cap amendment; preserves every historical call. */
export function amendEvaluationTotalLimit(file,{expectedLimitMicros,newLimitMicros,reason,authorizationRef}){
 if(newLimitMicros!==100_000_000||!reason?.trim()||!authorizationRef?.trim())throw Error('Explicit $100 budget authorization required');
 return change(file,state=>{
  if(state.limitMicros!==expectedLimitMicros||newLimitMicros<=state.limitMicros)throw Error('Total budget changed');
  if(state.calls.some(c=>c.actualMicros===null||c.reservedMicrosRetained>0||c.boundViolation))throw Error('Budget amendment requires settled idle ledger');
  const amendment={previousLimitMicros:state.limitMicros,newLimitMicros,reason,authorizationRef,amendedAt:new Date().toISOString()};
  state.limitAmendments??=[];state.limitAmendments.push(amendment);state.limitMicros=newLimitMicros;return amendment;
 });
}
