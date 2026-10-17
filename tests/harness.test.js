import test from 'node:test';
import assert from 'node:assert/strict';
import {startProfile,devComposition,root} from '../scripts/runtime.mjs';
import {createUserMessage,LlmAdapter} from '@deepseek-ai/dsh-llm';
import {loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
const textChunks = async function*(text) {yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'finish',reason:{kind:'stop'}};};
class TestAdapter extends LlmAdapter {
  requests=[]; summaryFailure=false; sentTool=false;
  async resolveModel(provider,model){return {provider,id:model,name:model,context:{contextWindow:128000}};}
  async *stream(options){this.requests.push(options);if(options.purpose==='compaction'&&this.summaryFailure) {yield {type:'finish',reason:{kind:'error',failure:{code:'PROTOCOL',message:'invalid structure'}}};return;}
    if(options.purpose!=='compaction'&&!this.sentTool){this.sentTool=true;yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block:{type:'tool-call',id:'history-tool',name:'pwsh',arguments:JSON.stringify({command:'Write-Output HISTORY_TOOL_RESULT'})}};yield {type:'finish',reason:{kind:'tool-calls'}};return;}
    yield* textChunks(options.purpose==='compaction'?'Files: src/a.js edited. Pending: run checks. Verified: initial failing test.': 'ack');}
}
test('real DSH compaction backend: plain text, durable checkpoint, restore, continuation and bounded failures',async()=>{
  const {ctx}=await startProfile('hiagent-dev',[...devComposition(),{id:'llm-pi-ai',config:{providers:{}}}]);
  try {
    const adapter=new TestAdapter();ctx.llm.registerAdapter(['hiagent'],adapter);
    const handle=await ctx.agents.create({sessionId:`regression-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-lite-optimized');}});
    const agent=handle.agent;
    agent.followup(createUserMessage({content:[{type:'text',text:'Remember src/a.js is modified; initial test failed; next run checks. '+'history '.repeat(8000)}],source:{kind:'user'}}));await agent.whenIdle();
    const engine=ctx.agentPresets.serviceFor(agent,'compaction');
    const compact=await engine.compactNow(agent,new AbortController().signal);assert.ok(compact);
    const request=adapter.requests.find(x=>x.purpose==='compaction');assert.deepEqual(request.tools,[]);assert.ok(request.messages.some(x=>x.content.some(y=>y.text?.includes('src/a.js'))));assert.equal(request.provider,'hiagent');assert.ok(request.signal);
    assert.ok(request.messages.some(x=>x.content.some(y=>y.type==='tool-call'&&y.id==='history-tool')));
    assert.ok(request.messages.some(x=>x.role==='tool'&&x.content.some(y=>y.text?.includes('HISTORY_TOOL_RESULT'))));
    const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));assert.ok(events.some(x=>x.type==='compaction/summary'));assert.ok(events.some(x=>x.type==='compaction/end'));
    // Restore uses the actual Session v4 validator and reconstructs the surface.
    const restoredId=`restored-${Date.now()}`;
    const restored=ctx.sessions.prepare(restoredId,{seed:events,meta:{...agent.session.header,id:restoredId},eventState:'detached'});
    assert.deepEqual(restored.surface.nodes,agent.session.surface.nodes);
    assert.deepEqual(restored.requestHeader(),agent.session.requestHeader());
    assert.deepEqual(restored.deriveMessages(),agent.session.deriveMessages());
    agent.followup(createUserMessage({content:[{type:'text',text:'continue'}],source:{kind:'user'}}));await agent.whenIdle();
    assert.ok(adapter.requests.at(-1).messages.some(x=>x.content.some(y=>y.text?.includes('Pending: run checks'))));
    adapter.summaryFailure=true;
    const input={messages:request.messages,tools:[{name:'a'}]};
    for(let i=0;i<2;i++) await assert.rejects(engine.summarize(input,agent,new AbortController().signal),/invalid structure/);
    const before=adapter.requests.length;await assert.rejects(engine.summarize(input,agent,new AbortController().signal),/budget exhausted/);assert.equal(adapter.requests.length,before);
    await assert.rejects(engine.summarize({...input,messages:[...input.messages,createUserMessage({source:{kind:'user'},content:[{type:'text',text:'another tool step'}]})]},agent,new AbortController().signal),/budget exhausted/);
    const abort=new AbortController();abort.abort();await assert.rejects(engine.summarize({messages:[]},agent,abort.signal));assert.equal(adapter.requests.length,before);
    await handle.dispose();
  } finally {await ctx.fiber.dispose();}
});
test('automatic pressure compaction runs between native tool steps and preserves pending tool pairing',async()=>{
 const {ctx}=await startProfile('hiagent-dev',[...devComposition(),{id:'llm-pi-ai',config:{providers:{}}}]);
 try {
  const row=loadOverlayPatches('regression',root+'/cordis.patch.yml')[0].insert.find(x=>x.config?.id==='hiagent-lite-optimized');
  const definition=structuredClone(row.config);definition.id='auto-pressure-regression';
  const config=definition.plugins.find(x=>x.id==='compaction').config.find(x=>x.id==='compaction-basic').config;
  delete config.retainRatio;config.retainTokens=0;
  const disposePreset=await ctx.agentPresets.register(definition);
  const adapter=new TestAdapter();ctx.llm.registerAdapter(['hiagent'],adapter);
  const handle=await ctx.agents.create({sessionId:`auto-pressure-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,definition.id)}});
  handle.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Record prior edits and pending checks. '+'history '.repeat(60000)}]}));await handle.agent.whenIdle();
  const events=Array.from({length:handle.agent.session.seq},(_,i)=>handle.agent.session.eventAt(i));
  assert.ok(adapter.requests.some(x=>x.purpose==='compaction'));
  assert.equal(events.filter(x=>x.type==='turn/end').at(-1).data.reason.kind,'completed');
  const messages=handle.agent.session.deriveMessages();
  assert.ok(messages.some(x=>x.content.some(y=>y.type==='tool-call'&&y.id==='history-tool')));
  assert.ok(messages.some(x=>x.role==='tool'&&x.content.some(y=>y.text?.includes('HISTORY_TOOL_RESULT'))));
  assert.ok(events.some(x=>x.type==='compaction/summary'));
  await handle.dispose();await disposePreset();
 }finally{await ctx.fiber.dispose();}
});
