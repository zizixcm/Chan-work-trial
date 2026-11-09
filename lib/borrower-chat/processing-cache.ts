import type {Pool} from 'pg';
import type {Access} from '../authorization';
import {pool} from '../db';
import {UploadError} from '../validation';
import {borrowerTransaction} from './transaction';
import {preparationSnapshotSchema,parseCompletenessResult,processingQuestionSchema,revisionSchema} from '../preparation/protocol';
import type {ProcessingProjection} from './processing-projection';
/** Private projection cache; never authoritative preparation state. A caller
 * must refresh against authorized processor snapshots before presenting it. */
export class ChatProcessingCache {
  constructor(private readonly access:Access,private readonly database:Pool=pool()){}
  async read(preparationId:string) {
    return borrowerTransaction(this.database,this.access,async db=>{
      const row=(await db.query(`SELECT revision::text,projection FROM borrower_chat_processing_views
        WHERE application_id=$1 AND borrower_user_id=$2 AND preparation_id=$3`,[this.access.applicationId,this.access.userId,preparationId])).rows[0];
      return row?{revision:row.revision as string,projection:row.projection as ProcessingProjection,requiresRefresh:true as const}:null;
    });
  }
  async save(expectedRevision:string,projection:ProcessingProjection) {
    revisionSchema.parse(expectedRevision);
    const snapshot=preparationSnapshotSchema.parse(projection.snapshot);
    if(snapshot.applicationId!==this.access.applicationId)throw new UploadError('Wrong projection scope.',404);
    for(const result of [projection.currentResult,...Object.values(projection.cards).map(c=>c.result)]) {
      if(!result)continue;const parsed=parseCompletenessResult(result);
      if(parsed.applicationId!==snapshot.applicationId||parsed.preparationId!==snapshot.preparationId)throw new UploadError('Wrong result scope.',404);
    }
    for(const question of [...projection.questions,...Object.values(projection.cards).flatMap(c=>c.question?[c.question]:[])])
      if(processingQuestionSchema.parse(question).preparationId!==snapshot.preparationId)throw new UploadError('Wrong question scope.',404);
    return borrowerTransaction(this.database,this.access,async db=>{
      const prior=(await db.query(`SELECT revision::text FROM borrower_chat_processing_views WHERE application_id=$1
        AND borrower_user_id=$2 AND preparation_id=$3`,[this.access.applicationId,this.access.userId,snapshot.preparationId])).rows[0];
      if((prior?.revision??'0')!==expectedRevision)throw new UploadError('Processing view changed. Reload the current snapshot.',409);
      const revision=(BigInt(expectedRevision)+1n).toString();
      await db.query(`INSERT INTO borrower_chat_processing_views(application_id,borrower_user_id,preparation_id,revision,projection)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(application_id,borrower_user_id,preparation_id)
        DO UPDATE SET revision=excluded.revision,projection=excluded.projection`,[this.access.applicationId,this.access.userId,snapshot.preparationId,revision,projection]);
      return {revision};
    });
  }
}
