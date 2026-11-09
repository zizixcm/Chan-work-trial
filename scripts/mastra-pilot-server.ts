import './env';
import path from 'node:path';
import {serve} from '@hono/node-server';
import {createLocalMastraObservability} from '../lib/evaluation-observability';
import {createPilotStudio} from '../lib/agents/studio-server';
import {createBorrowerPilot} from './borrower-agents-worker';

async function main(){
 const port=Number(process.env.MASTRA_PILOT_PORT??4111);
 const observer=await createLocalMastraObservability({directory:path.resolve(process.env.MASTRA_OBSERVABILITY_DIR??'.data/mastra-observability')});
 let pilot:Awaited<ReturnType<typeof createBorrowerPilot>>|undefined;
 try{
  const app=await createPilotStudio(observer,port);
  if(process.env.BORROWER_AGENT_EXECUTION==='live')pilot=await createBorrowerPilot(observer);
  const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port});
  let stopping=false,timer:ReturnType<typeof setTimeout>|undefined,active:Promise<void>|undefined;
  const tick=()=>{active=(async()=>{
   try{if(pilot){const result=await pilot.tick();await observer.flush();console.log(JSON.stringify({type:'pilot_tick',...result}));}}
   catch{console.error('Pilot worker paused after an error. Inspect durable state and budget before restarting.');return;}
   if(!stopping&&pilot)timer=setTimeout(tick,2000);
  })();};
  const stop=async()=>{if(stopping)return;stopping=true;clearTimeout(timer);server.close();await active;await pilot?.close();await observer.close();};
  process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  console.log(JSON.stringify({studio:`http://127.0.0.1:${port}`,worker:pilot?'bounded-live':'disabled'}));
  if(pilot)tick();
 }catch(error){await pilot?.close();await observer.close();throw error;}
}
main().catch(()=>{console.error('Mastra pilot failed to start. Check isolated configuration and port availability.');process.exitCode=1;});
