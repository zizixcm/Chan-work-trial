import {UploadError} from '../validation';
// An authenticated manual upload commit requests a response, including older
// clients that did not send this flag. Internal finalization keeps its own default.
export function finalizeUpload<T>(service:{finalize(id:string,requestProcessing:boolean):Promise<T>},input:Record<string,unknown>):Promise<T> {
 if(input.requestProcessing!==undefined&&typeof input.requestProcessing!=='boolean')throw new UploadError('Invalid processing request.');
 if(typeof input.id!=='string'||input.id.length<1||input.id.length>160)throw new UploadError('A request key is required.');
 return service.finalize(input.id,input.requestProcessing!==false);
}
