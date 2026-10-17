import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {startProfile,creatorDevComposition,root} from '../scripts/runtime.mjs';
import {createUserMessage,LlmAdapter} from '@deepseek-ai/dsh-llm';
import {defineTool} from '@deepseek-ai/dsh-tools';
const rolePlugins=[{id:'persona',name:'@deepseek-ai/dsh-persona',config:{prefix:'You are an independent third-party test role.'}},{id:'fs',name:'@deepseek-ai/dsh-tool-fs'}];
const create=async(ctx,provider,id='arbitrary-role')=>ctx.agents.create({sessionId:`global-${provider}-${Date.now()}-${Math.random()}`,meta:{cwd:root},agentOptions:{provider,model:'test'},setup:async c=>{await ctx.agentPresets.mount(c,id);}});
const call=(ctx,agent,name,args)=>ctx.tools.execute({name,arguments:args,callId:`global-test-${Math.random()}`,agent,signal:new AbortController().signal});

test('global policies adapt an untouched third-party role; other providers and structured values are preserved',async()=>{
 const {ctx}=await startProfile('hiagent-dev',creatorDevComposition());const area=await mkdtemp(resolve(tmpdir(),'hiagent-global-'));let a,b;
 try{
  await ctx.agentPresets.register({id:'arbitrary-role',name:'Third-party test',plugins:rolePlugins});
  a=await create(ctx,'hiagent');b=await create(ctx,'another-provider');
  assert.deepEqual(ctx.tools.schemas(a.agent),ctx.tools.schemas(b.agent));
  const file=resolve(area,'long.txt');await writeFile(file,'First important line\n'+Array.from({length:200},(_,i)=>`row ${i}: ${'large data '.repeat(10)}`).join('\n')+'\nLast important line');
  const guarded=await call(ctx,a.agent,'read',{file_path:file,limit:2000});assert.equal(guarded.isError,false);const text=guarded.content.map(x=>x.text??'').join('');assert.match(text,/reduced preview/);assert.ok(Buffer.byteLength(text)<13500);
  const spill=text.match(/full formatted output: (.*?). Use /)[1];assert.match(await readFile(spill,'utf8'),/Last important line/);
  const untouched=await call(ctx,b.agent,'read',{file_path:file,limit:2000});assert.equal(untouched.isError,false);assert.doesNotMatch(untouched.content.map(x=>x.text??'').join(''),/reduced preview/);
  for(let i=0;i<7;i++)assert.equal((await call(ctx,a.agent,'read',{file_path:file,offset:1,limit:1})).isError,false);
  const denied=await call(ctx,a.agent,'read',{file_path:file,offset:1,limit:1});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/Kasumi global/);
  for(let i=0;i<10;i++)assert.equal((await call(ctx,b.agent,'read',{file_path:file,offset:1,limit:1})).isError,false);
  const value={complete:'payload '.repeat(5000),verified:true};
  ctx.tools.register(defineTool({name:'thirdparty_report',parameters:{},description:'Generate a third-party structured report.',output:{schema:{type:'json'},render:()=>[{type:'text',text:value.complete}]},execute:async()=>value}));
  const rendered=await call(ctx,a.agent,'thirdparty_report',{});assert.deepEqual(rendered.value,value);assert.match(rendered.content[0].text,/reduced preview/);
 }finally{await a?.dispose();await b?.dispose();await ctx.fiber.dispose();assert.equal(dirname(area),resolve(tmpdir()));await rm(area,{recursive:true,force:true});}
});

test('global off restores arbitrary role behavior',async()=>{
 const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'hiagent-global',config:{enabled:false}}]);let handle;
 try{
  await ctx.agentPresets.register({id:'arbitrary-role',plugins:rolePlugins});handle=await create(ctx,'hiagent');
  for(let i=0;i<10;i++)assert.equal((await call(ctx,handle.agent,'read',{file_path:root+'/README.md',offset:1,limit:1})).isError,false);
  assert.equal(ctx.hiagentGlobal.enabled(),false);
 }finally{await handle?.dispose();await ctx.fiber.dispose();}
});

test('native live settings switch global policy for an existing agent without remounting it',async()=>{
 const {ctx}=await startProfile('hiagent-dev',creatorDevComposition());let handle;const original=ctx.settings.describe().find(x=>x.ns==='hiagent-global').value;
 try{
  await ctx.agentPresets.register({id:'arbitrary-role',plugins:rolePlugins});handle=await create(ctx,'hiagent');
  await ctx.settings.update('hiagent-global',{enabled:false});assert.equal(ctx.hiagentGlobal.enabled(),false);
  for(let i=0;i<10;i++)assert.equal((await call(ctx,handle.agent,'read',{file_path:root+'/README.md',offset:1,limit:1})).isError,false);
  await ctx.settings.update('hiagent-global',{enabled:true,maxReadCallsPerStep:2});
  assert.equal((await call(ctx,handle.agent,'read',{file_path:root+'/README.md',offset:1,limit:1})).isError,false);
  assert.equal((await call(ctx,handle.agent,'read',{file_path:root+'/README.md',offset:1,limit:1})).isError,false);
  assert.equal((await call(ctx,handle.agent,'read',{file_path:root+'/README.md',offset:1,limit:1})).isError,true);
  await ctx.settings.update('hiagent-global',{enabled:false});assert.equal((await call(ctx,handle.agent,'read',{file_path:root+'/README.md',offset:1,limit:1})).isError,false);
 }finally{await ctx.settings.replace('hiagent-global',original);await handle?.dispose();await ctx.fiber.dispose();}
});

test('provider switching follows the logged actual route and preset-local output budgets do not spill twice',async()=>{
 const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:{providers:{}}},{id:'hiagent-global',config:{searchBytes:2048}}]);let handle;
 class Adapter extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:224000}};}
  async *stream(){yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'done'}};yield {type:'finish',reason:{kind:'stop'}};}
 }
 try{
  await ctx.agentPresets.register({id:'budget-compat-role',plugins:[...rolePlugins,{id:'local-budget',name:'@local/dsh-kasumi/output-budget'}]});
  ctx.llm.registerAdapter(['hiagent','another-provider'],new Adapter());handle=await create(ctx,'hiagent','budget-compat-role');let provider='another-provider';
  handle.agent.ctx.on('agent/request',async(_,next)=>Object.freeze({...await next(),provider}),{prepend:true});
  const send=async()=>{handle.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Confirm current route without tools.'}]}));await handle.agent.whenIdle();};
  await send();assert.equal(ctx.hiagentGlobal.matches(handle.agent),false);
  provider='hiagent';await send();assert.equal(ctx.hiagentGlobal.matches(handle.agent),true);
  ctx.tools.register(defineTool({name:'grep',parameters:{},description:'Generate a synthetic search report for policy-chain testing.',output:{schema:{type:'string'},render:(_,value)=>[{type:'text',text:value}]},execute:async()=>('payload '.repeat(5000))}));
  const large=await call(ctx,handle.agent,'grep',{});const content=large.content.map(x=>x.text??'').join('');assert.equal((content.match(/hiagent-output-budget/g)??[]).length,1);assert.ok(Buffer.byteLength(content)<=2048);
  const locator=content.match(/full formatted output: (.*?). Use /)[1];assert.equal(await readFile(locator,'utf8'),'payload '.repeat(5000));
  provider='another-provider';await send();assert.equal(ctx.hiagentGlobal.matches(handle.agent),false);
  const normal=await call(ctx,handle.agent,'grep',{});assert.ok(Buffer.byteLength(normal.content[0].text)>2048);assert.ok(Buffer.byteLength(normal.content[0].text)<=6144);
 }finally{await handle?.dispose();await ctx.fiber.dispose();}
});

test('global pure-text pressure compaction works without a preset backend; replay and pending tool pairs remain valid',async()=>{
 const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:{providers:{}}},{id:'hiagent-global-compaction',config:{auto:false,thresholdRatio:0.2,headroomTokens:4096,retainTokens:0,maxTokens:8192,compactionRetries:0,maxOverflowRetries:0,plainText:true}}]);let handle;
 class Adapter extends LlmAdapter{
  requests=[];sent=false;
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:128000}};}
  async *stream(options){this.requests.push(options);
   if(options.purpose!=='compaction'&&!this.sent){this.sent=true;yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'block-end',index:0,block:{type:'tool-call',id:'global-native-read',name:'read',arguments:JSON.stringify({file_path:root+'/README.md',offset:1,limit:1})}};yield {type:'finish',reason:{kind:'tool-calls'}};}
   else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:options.purpose==='compaction'?'Remember GLOBAL_CONTEXT_OK. Pending native read must finish.':'done'}};yield {type:'finish',reason:{kind:'stop'}};}
  }
 }
 try{
  await ctx.agentPresets.register({id:'arbitrary-role',plugins:rolePlugins});const adapter=new Adapter();ctx.llm.registerAdapter(['hiagent'],adapter);handle=await create(ctx,'hiagent');
  assert.equal(ctx.agentPresets.serviceFor(handle.agent,'compaction'),undefined);
  handle.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Remember GLOBAL_CONTEXT_OK. '+'historical project evidence. '.repeat(12000)}]}));await handle.agent.whenIdle();
  const summaries=adapter.requests.filter(x=>x.purpose==='compaction');assert.equal(summaries.length,1);assert.deepEqual(summaries[0].tools,[]);assert.equal(summaries[0].provider,'hiagent');assert.ok(summaries[0].signal);
  const events=Array.from({length:handle.agent.session.seq},(_,i)=>handle.agent.session.eventAt(i));assert.equal(events.filter(x=>x.type==='compaction/summary').length,1);assert.equal(events.filter(x=>x.type==='turn/end').at(-1).data.reason.kind,'completed');
  const restoredId='global-replay-'+Date.now();const restored=ctx.sessions.prepare(restoredId,{seed:events,meta:{...handle.agent.session.header,id:restoredId},eventState:'detached'});assert.deepEqual(restored.deriveMessages(),handle.agent.session.deriveMessages());
  handle.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Continue after the checkpoint.'}]}));await handle.agent.whenIdle();assert.ok(adapter.requests.at(-1).messages.some(x=>x.content.some(y=>y.text?.includes('GLOBAL_CONTEXT_OK'))));
 }finally{await handle?.dispose();await ctx.fiber.dispose();}
});
