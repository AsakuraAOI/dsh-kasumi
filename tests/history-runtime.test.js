import test from 'node:test';
import assert from 'node:assert/strict';
import {startProfile,creatorDevComposition,root} from '../scripts/runtime.mjs';
import {createUserMessage,LlmAdapter} from '@deepseek-ai/dsh-llm';
import {defineTool} from '@deepseek-ai/dsh-tools';
const SEARCH='kasumi_history_search',READ='kasumi_history_read';
const execute=(ctx,agent,name,args)=>ctx.tools.execute({name,arguments:args,callId:`history-test-${Math.random()}`,agent,signal:new AbortController().signal});
const create=(ctx,id,extra={})=>{const options={meta:{cwd:root},agentOptions:{provider:'hiagent',model:'test'},setup:async c=>{await ctx.agentPresets.mount(c,'hiagent-balanced-optimized');},...extra};return extra.resumeSessionId?ctx.agents.resume(options):ctx.agents.create({...options,sessionId:id});};
class Adapter extends LlmAdapter{
 sent=false;requests=[];
 async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:224000}};}
 async *stream(options){this.requests.push(options);if(options.purpose!=='compaction'&&!this.sent){this.sent=true;yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block:{type:'tool-call',id:'archived-evidence',name:'evidence_test',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:options.purpose==='compaction'?'Verified old evidence; pending next step. Exact details may be retrieved from history.':'done'}};yield {type:'finish',reason:{kind:'stop'}};}}
}
test('real DSH history tools restore omitted evidence through two checkpoints, fresh index and persisted session restart',async()=>{
 let ctx=(await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:{providers:{}}}])).ctx,handle,other;
 const id=`history-runtime-${Date.now()}`,evidence='first line\n'+'noise '.repeat(4000)+'\nLEGACY_API=mergeOrders_v7; hard limit=37.5\n'+'noise '.repeat(4000)+'\nlast line';
 const adapter=new Adapter();ctx.llm.registerAdapter(['hiagent'],adapter);
 try{
  ctx.tools.register(defineTool({name:'evidence_test',description:'Return original evidence for history verification.',parameters:{},output:{schema:{type:'string'},render:(_,value)=>[{type:'text',text:value}]},execute:async()=>evidence}));
  handle=await create(ctx,id);const agent=handle.agent;assert.ok(ctx.tools.get(SEARCH,agent));
  const send=async text=>{agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text}]}));await agent.whenIdle();};
  await send('Inspect evidence once and remember exact API and limit.');
  const messages=agent.session.deriveMessages();const tool=messages.find(x=>x.role==='tool'&&x.toolCallId==='archived-evidence');assert.ok(tool);assert.doesNotMatch(tool.content.map(x=>x.text??'').join(''),/mergeOrders_v7/);
  assert.match(tool.content.map(x=>x.text??'').join(''),/Durable history ref/);
  const engine=ctx.agentPresets.serviceFor(agent,'compaction');await engine.compactNow(agent,new AbortController().signal);
  await send('Continue to the next phase without repeating earlier details.');await engine.compactNow(agent,new AbortController().signal);
  assert.ok(adapter.requests.filter(x=>x.purpose==='compaction').every(x=>x.tools.length===0));
  assert.ok(adapter.requests.find(x=>x.purpose==='compaction').messages.some(x=>x.content.some(y=>y.text?.includes('CURRENT user goal'))));
  const search=await execute(ctx,agent,SEARCH,{query:'mergeOrders_v7'});assert.equal(search.isError,false,JSON.stringify(search.content));
  const found=search.value.results.find(x=>x.type==='archived-tool-output');assert.ok(found,JSON.stringify(search.value));
  const read=await execute(ctx,agent,READ,{ref:found.ref,offset:Math.max(0,found.matchOffset-30),limit:200});assert.equal(read.isError,false,JSON.stringify(read.content));assert.match(read.value.text,/mergeOrders_v7; hard limit=37.5/);assert.match(read.content[0].text,/Untrusted historical data/);
  const blocks=[...ctx.kasumiHistory.index.view(agent.session).blocks.values()];assert.ok(blocks.some(x=>x.tier>=2));
  const block=await execute(ctx,agent,READ,{ref:`h-${found.ref.split('-')[1]}-b${blocks.at(-1).seq}`,limit:200});assert.equal(block.isError,false);assert.ok(block.value.sourceRefs.length);assert.ok(block.value.parentBlocks.length);
  other=await create(ctx,id+'-other');const foreign=await execute(ctx,other.agent,READ,{ref:found.ref});assert.equal(foreign.isError,true);assert.match(foreign.content[0].text,/another session/);
  const ref=found.ref,offset=Math.max(0,found.matchOffset-30);await ctx.sessions.flush(agent.session);await other.dispose();other=undefined;await handle.dispose();handle=undefined;await ctx.fiber.dispose();
  ctx=(await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:{providers:{}}}])).ctx;
  handle=await create(ctx,undefined,{resumeSessionId:id});
  const afterRestart=await execute(ctx,handle.agent,READ,{ref,offset,limit:200});assert.equal(afterRestart.isError,false,JSON.stringify(afterRestart.content));assert.match(afterRestart.value.text,/mergeOrders_v7; hard limit=37.5/);
  assert.ok([...ctx.kasumiHistory.index.view(handle.agent.session).blocks.values()].some(x=>x.tier>=2));
 }finally{await other?.dispose();await handle?.dispose();await ctx.fiber.dispose();}
});

test('history tools are absent from other providers and are blocked immediately when the module is disabled',async()=>{
 const {ctx}=await startProfile('hiagent-dev',creatorDevComposition());let a,b;const original=ctx.settings.describe().find(x=>x.ns==='hiagent-global').value;
 try{
  a=await create(ctx,`history-switch-${Date.now()}`);b=await create(ctx,`history-other-${Date.now()}`,{agentOptions:{provider:'other',model:'test'}});
  assert.ok(ctx.tools.get(SEARCH,a.agent));assert.equal(ctx.tools.get(SEARCH,b.agent),undefined);
  await ctx.settings.update('hiagent-global',{historyRecall:false});const denied=await execute(ctx,a.agent,SEARCH,{query:'evidence'});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/disabled/);
 }finally{await ctx.settings.replace('hiagent-global',original);await a?.dispose();await b?.dispose();await ctx.fiber.dispose();}
});

test('pressure compacts a new complete tool interval while leaving the prior checkpoint and latest user request verbatim',async()=>{
 const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:{providers:{}}},{id:'hiagent-global',config:{outputBudget:false,minIncrementTokens:1024}},{id:'hiagent-global-compaction',config:{auto:false,thresholdRatio:0.1,headroomTokens:1024,retainTokens:0,maxTokens:256,compactionRetries:0,plainText:true}}]);let handle;
 class IncrementAdapter extends LlmAdapter{
  phase=0;summaries=0;
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:128000}};}
  async *stream(options){
   if(options.purpose!=='compaction'&&this.phase++===1){yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block:{type:'tool-call',id:'new-phase-tool',name:'increment_evidence',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};return;}
   yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:options.purpose==='compaction'?`Checkpoint ${++this.summaries}: source evidence preserved in history.`:'phase done'}};yield {type:'finish',reason:{kind:'stop'}};
  }
 }
 try{
  const adapter=new IncrementAdapter();ctx.llm.registerAdapter(['hiagent'],adapter);ctx.tools.register(defineTool({name:'increment_evidence',description:'Generate a new complete interval.',parameters:{},output:{schema:{type:'string'},render:(_,value)=>[{type:'text',text:value}]},execute:async()=>('new phase evidence '.repeat(9000))}));
  handle=await create(ctx,`increment-runtime-${Date.now()}`);const agent=handle.agent;
  for(const text of ['Old completed phase. '+'historical evidence '.repeat(9000),'Current intent KEEP_INTENT_91. Complete the next phase.']){agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text}]}));await agent.whenIdle();}
  const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i)),summaries=events.filter(x=>x.type==='compaction/summary');assert.equal(summaries.length,2,JSON.stringify({phase:adapter.phase,results:events.filter(x=>x.type==='tool/result').map(x=>({error:x.data.message.isError,bytes:JSON.stringify(x.data.message).length})),end:events.filter(x=>x.type==='turn/end').map(x=>x.data.reason),summaries:summaries.map(x=>({seq:x.seq,source:x.data.shadowedSeqs}))}));
  const firstCheckpoint=summaries[0].seq+1;assert.ok(!summaries[1].data.shadowedSeqs.includes(firstCheckpoint));assert.ok(agent.session.surface.nodes.includes(firstCheckpoint));
  assert.ok(agent.session.deriveMessages().some(x=>x.content.some(y=>y.text?.includes('KEEP_INTENT_91'))));
  const index=ctx.kasumiHistory.index.view(agent.session);assert.equal([...index.blocks.values()].filter(x=>x.tier===1).length,2);
 }finally{await handle?.dispose();await ctx.fiber.dispose();}
});
