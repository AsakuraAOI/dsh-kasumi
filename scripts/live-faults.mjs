import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {startProfile,devComposition,root} from './runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import assert from 'node:assert/strict';
const dir=root+'/benchmark-runs/live-faults-03';await mkdir(dir,{recursive:true});
const records=[];let mode='drop',forwarded=0;const pending=new Set();
const server=createServer(async(req,res)=>{const scenario=mode,abort=new AbortController();pending.add(abort);res.on('close',()=>{if(!res.writableEnded)abort.abort();});try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers={...req.headers};for(const name of ['host','connection','content-length','transfer-encoding'])delete headers[name];records.push({type:'upstream-request-start',scenario,at:new Date().toISOString()});const response=await fetch('https://api.asakuraaoi.cn/anthropic'+req.url,{method:req.method,headers,body:Buffer.concat(chunks),signal:abort.signal});forwarded++;records.push({type:'forward',scenario,status:response.status,at:new Date().toISOString()});
 if(scenario==='drop'){res.destroy();abort.abort();records.push({type:'controlled-transport-disconnect'});return;}
 res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'text/event-stream'});for await(const chunk of response.body){if(!res.write(chunk))await once(res,'drain',{signal:abort.signal});}res.end();
 }catch(error){records.push({type:'transport-end',scenario,cancelled:abort.signal.aborted,code:error.code??error.name});if(!res.headersSent)res.writeHead(502);res.destroy();}finally{pending.delete(abort);}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const config=providerConfig(224000,true);config.providers.hiagent.baseURL=`http://127.0.0.1:${server.address().port}`;
const {ctx}=await startProfile('hiagent-dev',[...devComposition(),{id:'llm-pi-ai',config},{id:'session-persistence-jsonl',config:{root:dir+'/sessions'}},{id:'hiagent-observability',config:{enabled:true,path:dir+'/metrics.jsonl'}}]);let handle;
try{
 handle=await ctx.agents.create({sessionId:'live-faults-'+Date.now(),meta:{cwd:dir},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,'hiagent-lite-optimized')}});const agent=handle.agent;
 const send=async text=>{agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text}]}));await agent.whenIdle();};
 await send('Without tools, return TRANSPORT_PROBE.');let events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));const drop=events.filter(x=>x.type==='turn/end').at(-1).data.reason;assert.equal(drop.kind,'error');assert.equal(events.filter(x=>x.type==='llm/retry').length,0);assert.equal(events.filter(x=>x.type==='tool/result').length,0);
 mode='cancel';const before=agent.session.seq;let cancelIssued=false;const cancel=setTimeout(()=>{cancelIssued=true;agent.cancel();},900);await send('Without tools, write a long numbered explanation of JavaScript parsing edge cases.');clearTimeout(cancel);events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));const cancelled=events.filter(x=>x.seq>=before&&x.type==='turn/end').at(-1).data.reason;assert.ok(cancelIssued);assert.notEqual(cancelled?.kind,'completed');assert.equal(events.filter(x=>x.type==='llm/retry').length,0);
 mode='normal';await send('The previous turn was cancelled. Without tools, reply exactly RECOVERY_LIVE_OK.');events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));const final=events.filter(x=>x.type==='assistant/message').at(-1).data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');assert.match(final,/RECOVERY_LIVE_OK/);assert.equal(events.filter(x=>x.type==='turn/end').at(-1).data.reason.kind,'completed');await ctx.sessions.flush(agent.session);
 const result={success:true,method:'controlled disconnect and cancellation of actual remote Provider requests; no mock LLM',drop,cancelled,cancelIssued,final,forwarded,retries:events.filter(x=>x.type==='llm/retry').length,toolExecutions:events.filter(x=>x.type==='tool/result').length,records};await writeFile(root+'/reports/live-faults.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await handle?.dispose();await ctx.fiber.dispose();for(const p of pending)p.abort();server.closeAllConnections();await new Promise(done=>server.close(done));}
