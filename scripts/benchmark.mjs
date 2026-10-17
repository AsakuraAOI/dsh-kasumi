import {startProfile,devComposition,root} from './runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {cases,createFixture,longHistory} from '../benchmarks/cases.mjs';
import {createUserMessage,LlmAdapter} from '@deepseek-ai/dsh-llm';
import {mkdir,writeFile,readFile,rm,realpath,cp} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const repetitions=Number(arg('--repeat','2')), selected=arg('--case','all'), presetFilter=arg('--preset','all');
const matched=args.includes('--matched'),budgetOnly=args.includes('--budget-only');
const runRoot=resolve(root,'benchmark-runs',arg('--run',new Date().toISOString().replaceAll(':','-')));
await mkdir(runRoot,{recursive:true});
const variants=budgetOnly?['budget-only-off','budget-only-on']:['hiagent-lite','hiagent-lite-optimized','hiagent-balanced','hiagent-balanced-optimized'].filter(x=>presetFilter==='all'||presetFilter.split(',').includes(x));
const snapshots=session=>Array.from({length:session.seq},(_,i)=>session.eventAt(i));
// No subagents: each run is one ordinary DSH Agent with one preset, serially driven.
for(let rep=0;rep<repetitions;rep++)for(const task of cases.filter(x=>selected==='all'?!x.extra:selected===x.id))for(const preset of (rep%2 ? [...variants].reverse() : variants)) {
 const id=`${task.id}-${preset}-${rep+1}`,dir=resolve(runRoot,id),workspace=matched?resolve(runRoot,'paired-workspace'):resolve(dir,'workspace');
 if(matched){const actual=await realpath(workspace).catch(()=>workspace);const rel=relative(runRoot,actual);if(isAbsolute(rel)||rel.startsWith('..')||actual===runRoot)throw Error('Unsafe benchmark workspace reset');await rm(workspace,{recursive:true,force:true});}
 await createFixture(workspace,task);
 spawnSync('git',['init','-q'],{cwd:workspace});spawnSync('git',['add','.'],{cwd:workspace});spawnSync('git',['-c','user.name=DSH Benchmark','-c','user.email=benchmark@localhost','commit','-qm','Fixture baseline'],{cwd:workspace});
 const optimized=preset.endsWith('-optimized'),metrics=resolve(dir,'metrics.jsonl');
 const contextWindow=matched?Number(arg('--window','224000')):(optimized?Number(arg('--window','128000')):224000);
 const overrides=[...devComposition(),{id:'llm-pi-ai',config:providerConfig(contextWindow,matched||optimized)},{id:'session-persistence-jsonl',config:{root:resolve(dir,'sessions')}},{id:'hiagent-observability',config:{enabled:true,path:metrics}},{id:'fs-sandbox',config:{cwd:workspace}},{id:'spill-local',config:{root:resolve(dir,'spill'),cleanupPeriodDays:7}}];
 const {ctx}=await startProfile('hiagent-dev',overrides);
 const begin=performance.now();let handle,timeout,finalText='',exception=null,compaction=null;
 try {
  if(budgetOnly){const row=loadOverlayPatches('budget-only',resolve(root,'baseline/cordis.patch.yml'))[0].insert.find(x=>x.config.id==='hiagent-balanced');const definition=structuredClone(row.config);definition.id=preset;definition.plugins.push({id:'isolated-output-budget',name:'@local/dsh-kasumi/output-budget',config:{enabled:preset==='budget-only-on'}});await ctx.agentPresets.register(definition);}
  handle=await ctx.agents.create({sessionId:`benchmark-${randomUUID()}`,meta:{cwd:workspace},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,preset)}});
  const agent=handle.agent;
  // Seed through the real Agent loop, with deterministic model output only for
  // setup. This is explicitly synthetic history, excluded from inference metrics.
  if(task.id==='long-compaction') {
   const stop=ctx.on('llm/stream',(options,next)=>options.sessionId===agent.session.id && options.purpose!=='compaction' ? (async function*(){yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'Recorded inspection; src/policy.js and node --test remembered. Pending maintainer fix.'}};yield {type:'finish',reason:{kind:'stop'}};})() : next(),{global:true,prepend:true});
   agent.followup(createUserMessage({content:[{type:'text',text:longHistory()}],source:{kind:'user'}}));await agent.whenIdle();stop();
   const engine=ctx.agentPresets.serviceFor(agent,'compaction');
   if(engine) {try {const before=performance.now();await engine.compactNow(agent,new AbortController().signal);compaction={success:true,durationMs:performance.now()-before};}catch(error){compaction={success:false,code:error.code??null};}}
   else compaction={available:false};
  }
  let steps=0;
  const stopSteps=ctx.on('session/event',(session,event)=>{if(session.id===agent.session.id && event.type==='step/end' && ++steps>24)agent.cancel();});
  timeout=setTimeout(()=>agent.cancel(),Number(arg('--timeout','480000')));
  agent.followup(createUserMessage({content:[{type:'text',text:task.prompt}],source:{kind:'user'}}));await agent.whenIdle();clearTimeout(timeout);stopSteps();
  await ctx.sessions.flush(agent.session);
  const events=snapshots(agent.session),messages=events.filter(x=>x.type==='assistant/message');
  finalText=messages.at(-1)?.data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n')??'';
  const end=events.filter(x=>x.type==='turn/end').at(-1),outcome=end?.data.reason.kind;
  let correct=false,verificationError=null;
  try {await task.verify(workspace,finalText);correct=outcome==='completed';}catch(error){verificationError=error.message;}
  const result={id,preset,case:task.id,repeat:rep+1,model:'deepseek-v4.1-flash',contextWindow,matched,budgetOnly,workspace,sessionId:agent.session.id,correct,outcome,verificationError,compaction,totalMs:performance.now()-begin,toolCalls:events.filter(x=>x.type==='tool/result').length,toolRounds:new Set(events.filter(x=>x.type==='tool/result').map(x=>`${x.data.turn}/${x.data.step}`)).size,stepCount:events.filter(x=>x.type==='step/end').length,retries:events.filter(x=>x.type==='llm/retry').length,syntheticHistory:task.id==='long-compaction'};
  await writeFile(resolve(dir,'result.json'),JSON.stringify(result,null,2));await writeFile(resolve(dir,'final.txt'),finalText);
  console.log(JSON.stringify(result));
 }catch(error){exception={name:error.name,code:error.code??null,message:error.message};await writeFile(resolve(dir,'result.json'),JSON.stringify({id,preset,case:task.id,repeat:rep+1,correct:false,exception,totalMs:performance.now()-begin},null,2));console.log(JSON.stringify({id,exception}));}
 finally {clearTimeout(timeout);await handle?.dispose();await ctx.fiber.dispose();if(matched)await cp(workspace,resolve(dir,'workspace'),{recursive:true,dereference:false});}
}
console.log(`Results: ${runRoot}`);
