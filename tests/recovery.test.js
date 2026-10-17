import test from 'node:test';
import assert from 'node:assert/strict';
import {startProfile,devComposition,root} from '../scripts/runtime.mjs';
import {LlmAdapter,createUserMessage,resolveRetryPolicy} from '@deepseek-ai/dsh-llm';
import * as recovery from '../src/recovery.js';
test('native retry coordination: only unsubmitted RATE_LIMIT retries once; protocol, timeout, oversized, deadline and cancelled requests do not replay',async()=>{
 const {ctx}=await startProfile('hiagent-dev',[...devComposition(),{id:'llm-pi-ai',config:{providers:{}}}]);
 try {
  await ctx.plugin(recovery);
  for(const [code,partial,expected] of [['RATE_LIMIT',false,2],['RATE_LIMIT',true,1],['PROTOCOL',false,1],['TRANSPORT',false,1],['TIMEOUT',false,1],['REQUEST_TOO_LARGE',false,1],['GENERATION_DEADLINE',false,1],['ABORTED',false,1]]) {
   class FailingAdapter extends LlmAdapter {
    calls=0;
    async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:128000}};}
    providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:1,retryableCodes:['RATE_LIMIT'],backoff:{initialDelayMs:1,maxDelayMs:1,jitterRatio:0}},'test');}
    async *stream(){this.calls++;if(partial){yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'submitted partial'};yield {type:'block-end',index:0,block:{type:'text',text:'submitted partial'}};}yield {type:'finish',reason:{kind:code==='ABORTED'?'aborted':'error',failure:{code,message:'test failure'}}};}
   }
   const adapter=new FailingAdapter();const unregister=ctx.llm.registerAdapter(['hiagent'],adapter);
   const handle=await ctx.agents.create({sessionId:`recover-${code}-${partial}-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,'hiagent-lite-optimized')}});
   handle.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'hello'}]}));await handle.agent.whenIdle();
   assert.equal(adapter.calls,expected,`${code}/${partial}`);await handle.dispose();unregister();
  }
 }finally{await ctx.fiber.dispose();}
});
