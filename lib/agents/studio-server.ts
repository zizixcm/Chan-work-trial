import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {Hono} from 'hono';
import {MastraServer} from '@mastra/hono';
import {serveStatic} from '@hono/node-server/serve-static';
import type {LocalMastraObservability} from '../evaluation-observability';
import {createBorrowerPreparationAgent,createDocumentInvestigationAgent} from './definitions';

/** Native Studio and native read APIs, on the same loopback origin. Generation
 * belongs to the durable metered worker, never the generic playground endpoints. */
export async function createPilotStudio(observer:LocalMastraObservability,port:number){
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid Studio port');
 const unavailable=async()=>{throw Error('Execute through the authorized borrower controller');};
 observer.attachAgent(createBorrowerPreparationAgent({execute:unavailable}));
 observer.attachAgent(createDocumentInvestigationAgent({execute:unavailable}));
 const app=new Hono();
 app.use('*',async(c,next)=>{
  const host=c.req.header('host');
  if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`)return c.json({error:'Loopback host required'},403);
  // Mastra's advanced trace discovery and metric queries use POST for reads.
  // Keep this allowlist distinct from scoring, feedback and generation writes.
  const readQuery=c.req.method==='POST'&&(/^\/api\/observability\/(traces|spans)\/(query|aggregate)$/.test(c.req.path)||/^\/api\/observability\/traces\/query\/(fields|values)$/.test(c.req.path)||c.req.path==='/api/observability/threads/query'||/^\/api\/observability\/(metrics|scores|feedback)\/(aggregate|breakdown|timeseries|percentiles)$/.test(c.req.path));
  if(!['GET','HEAD'].includes(c.req.method)&&!readQuery){if(process.env.MASTRA_PILOT_HTTP_LOG==='1')console.log(JSON.stringify({path:c.req.path,method:c.req.method,status:403}));return c.json({error:'Studio is for inspection; execute through the metered borrower controller'},403);}
  await next();
  if(process.env.MASTRA_PILOT_HTTP_LOG==='1')console.log(JSON.stringify({path:c.req.path,status:c.res.status}));
 });
 app.get('/refresh-events',c=>c.body(null,204));
 app.get('/pilot/health',c=>c.json({status:'ready',execution:'durable-controller-only',storage:'single-process'}));
 const server=new MastraServer({app,mastra:observer.mastra});
 await server.init();
 app.all('/api/*',c=>c.json({error:'Unknown Mastra API route'},404));
 const require=createRequire(import.meta.url);
 const root=path.join(path.dirname(require.resolve('mastra/package.json')),'dist/studio');
 const values:Record<string,string>={MASTRA_SERVER_HOST:'127.0.0.1',MASTRA_SERVER_PORT:String(port),MASTRA_SERVER_PROTOCOL:'http',MASTRA_API_PREFIX:'/api',MASTRA_TELEMETRY_DISABLED:'true',MASTRA_HIDE_CLOUD_CTA:'true',MASTRA_AGENT_SIGNALS:'false',MASTRA_EXPERIMENTAL_FEATURES:'false',MASTRA_EXPERIMENTAL_UI:'false',MASTRA_TEMPLATES:'false',MASTRA_SIGNALS_UI:'false'};
 const html=(await readFile(path.join(root,'index.html'),'utf8')).replace(/%%([A-Z_]+)%%/g,(_,key)=>values[key]??'');
 app.get('/assets/*',serveStatic({root:path.relative(process.cwd(),root)}));
 app.get('/*.svg',serveStatic({root:path.relative(process.cwd(),root)}));
 app.get('*',c=>c.html(html));
 return app;
}
