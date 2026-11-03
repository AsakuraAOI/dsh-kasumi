import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startProfile,root} from '../scripts/runtime.mjs';
import {LlmAdapter,createUserMessage,resolveRetryPolicy} from '@deepseek-ai/dsh-llm';

test('real native engine consumes live retry config, guards partial output and emits valid bounded followups',async()=>{
 const home=mkdtempSync(join(tmpdir(),'kasumi-retry-native-')),previous=process.env.DSH_HOME;process.env.DSH_HOME=home;
 let ctx;const handles=[];
 try{
  ({ctx}=await startProfile('retry-test',[],true));await ctx.fiber.dispose();ctx=undefined;
  writeFileSync(join(home,'profiles/retry-test/cordis.patch.yml'),JSON.stringify([{insert:[{id:'kasumi-retry',name:pathToFileURL(join(root,'src/retry.js')).href,config:{enabled:true,initialDelayMs:1,maxDelayMs:1,jitterRatio:0,maxRetries:2,retryableCodes:['TIMEOUT'],autoContinue:true,maxContinuations:2,diagnostics:false}}]}]));
  ({ctx}=await startProfile('retry-test',[{id:'llm-pi-ai',config:{providers:{}}}]));
  const ns=ctx.settings.describe().find(x=>x.ns==='kasumi-retry');assert.ok(ns);assert.equal(ns.autoGenerate,true);assert.equal(ns.applies,'live');
  class Adapter extends LlmAdapter{
   calls=0;scenario='error';
   async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:128000}};}
   providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:0,retryableCodes:['RATE_LIMIT'],backoff:{initialDelayMs:1,maxDelayMs:1,jitterRatio:0}},'retry-runtime');}
   async *stream(){this.calls++;
    if(this.scenario!=='error'){yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'visible output'};yield {type:'block-end',index:0,block:{type:'text',text:'visible output'}};}
    yield {type:'finish',reason:this.scenario==='truncated'?{kind:'max-tokens'}:{kind:'error',failure:{code:'TIMEOUT',message:'synthetic timeout'}}};
   }
  }
  const adapter=new Adapter();ctx.llm.registerAdapter(['hiagent'],adapter);
  const create=async()=>{const h=await ctx.agents.create({sessionId:'retry-'+Date.now()+'-'+Math.random(),meta:{cwd:home},agentOptions:{provider:'hiagent',model:'test'},setup:async()=>{}});handles.push(h);return h.agent;};
  const send=async agent=>{agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Test the native event flow.'}]}));await agent.whenIdle();};
  let agent=await create();await send(agent);assert.equal(adapter.calls,3);assert.equal(ctx.kasumiRetry.snapshot().stats.retries,2);
  await ctx.settings.update('kasumi-retry',{maxRetries:1});const before=adapter.calls;agent=await create();await send(agent);assert.equal(adapter.calls-before,2);
  adapter.scenario='partial';const partialBefore=adapter.calls;agent=await create();await send(agent);assert.equal(adapter.calls-partialBefore,1);
  adapter.scenario='truncated';const truncatedBefore=adapter.calls;agent=await create();await send(agent);
  for(let i=0;i<5;i++){await ctx.kasumiRetry.drain();await agent.whenIdle();}
  assert.equal(adapter.calls-truncatedBefore,3);assert.equal(ctx.kasumiRetry.snapshot().stats.continues,2);
  const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));assert.equal(events.filter(e=>e.type==='user/message'&&e.data.source.kind==='plugin:kasumi-retry').length,2);
  const restored=ctx.sessions.prepare('restored-retry',{seed:events,meta:{...agent.session.header,id:'restored-retry'},eventState:'detached'});assert.deepEqual(restored.deriveMessages(),agent.session.deriveMessages());
 }finally{for(const h of handles)await h.dispose();await ctx?.fiber.dispose();if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;rmSync(home,{recursive:true,force:true});}
});
