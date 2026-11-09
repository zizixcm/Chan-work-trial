import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeConversationStream} from '../lib/borrower-chat/stream-browser';
import {ConversationUiError,type ConversationStreamState} from '../lib/borrower-chat/conversation-ui';
const state:ConversationStreamState={pending:true,activity:[],drafts:[{turnId:'t',sourceMessageId:'m',clientMessageId:'c',text:'Reading café…',status:'streaming',createdAt:'2026-11-08T00:00:00Z'}]};
test('browser receives incremental UTF-8 SSE frames before connection EOF',async()=>{
 let controller!:ReadableStreamDefaultController<Uint8Array>;
 const stream=new ReadableStream<Uint8Array>({start(c){controller=c;}}),encoder=new TextEncoder();
 const received:ConversationStreamState[]=[];
 let receivedFirst!:()=>void;const first=new Promise<void>(resolve=>{receivedFirst=resolve;});
 const done=consumeConversationStream(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),new AbortController().signal,value=>{received.push(value);receivedFirst();});
 const bytes=encoder.encode(`event: state\r\ndata: ${JSON.stringify(state)}\r\n\r\n`);
 for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));
 await first;assert.equal(received[0].drafts[0].text,'Reading café…');
 controller.enqueue(encoder.encode(`event: state\ndata: ${JSON.stringify({...state,pending:false,drafts:[{...state.drafts[0],status:'completed',text:'Done.'}]})}\n\n`));controller.close();
 await done;assert.equal(received.length,2);assert.equal(received[1].pending,false);
});
test('browser cancels stream on unmount and rejects unauthorized or malformed frames',async()=>{
 let cancelled=false;
 const controller=new AbortController();
 const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
 const done=consumeConversationStream(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),controller.signal,()=>{});
 controller.abort();await done;assert.equal(cancelled,true);
 await assert.rejects(consumeConversationStream(new Response('',{status:403}),new AbortController().signal,()=>{}),e=>e instanceof ConversationUiError&&e.kind==='denied');
 await assert.rejects(consumeConversationStream(new Response('event: state\ndata: {"pending":true}\n\n',{headers:{'Content-Type':'text/event-stream'}}),new AbortController().signal,()=>{}));
});
