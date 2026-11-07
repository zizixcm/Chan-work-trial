import path from 'node:path';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import type {Access} from '../authorization';
import {pool} from '../db';
import {authorize,transaction,digest} from '../jobs/core';
import {LocalBlobStorage} from '../storage/local';
import {UploadError} from '../validation';

export interface Disagreement {requestId:string;jobId:string;expected:string;reason:string}
/** A human disagreement is a private candidate, never automatically scored truth. */
export async function captureDisagreement(access:Access,value:Disagreement,database:Pool=pool(),root=path.resolve(process.env.PORTAL_DATA_DIR||'.data','evaluation-candidates')){
 if(!value||!/^[a-zA-Z0-9-]{1,80}$/.test(value.requestId)||typeof value.jobId!=='string'||value.jobId.length>100||
   !['fulfilled','partially_fulfilled','not_fulfilled','unable_to_determine','incorrect_match'].includes(value.expected)||
   typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>2000)throw new UploadError('Provide a valid analysis result and correction.');
 return transaction(database,async db=>{
  const role=await authorize(db,access);
  const row=(await db.query(`SELECT * FROM analysis_jobs WHERE application_id=$1 AND id=$2 AND initiated_by=$3 AND consent_scope=$4 AND state='succeeded'`,[access.applicationId,value.jobId,access.userId,role])).rows[0];
  if(!row)throw new UploadError('Analysis result not found.',404);
  if((row.task==='match_document.v1')!==(value.expected==='incorrect_match'))throw new UploadError('Correction does not match the analysis task.');
  const hash=createHash('sha256').update(JSON.stringify([access.applicationId,access.userId,value.requestId])).digest('hex');
  const id=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
  const store=new LocalBlobStorage(root),requestDigest=digest(value);
  const prior=await store.get(id).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(prior){if(JSON.parse(Buffer.from(prior).toString()).requestDigest!==requestDigest)throw new UploadError('Feedback request was already used for a different correction.',409);return {id,status:'pending_review'};}
  const candidate={id,status:'pending_review',createdAt:new Date().toISOString(),applicationId:access.applicationId,reviewerId:access.userId,role,requestDigest,
    jobId:row.id,task:row.task,fingerprint:row.result_fingerprint||row.fingerprint,input:row.input,output:row.result,expected:value.expected,reason:value.reason};
  const bytes=Buffer.from(JSON.stringify(candidate));if(bytes.length>500000)throw new UploadError('Analysis is too large to capture as one feedback case.',413);
  await store.put(id,bytes);
  return {id,status:'pending_review'};
 });
}
