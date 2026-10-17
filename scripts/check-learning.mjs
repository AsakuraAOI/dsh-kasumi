import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createUserMessage,LlmAdapter} from '@deepseek-ai/dsh-llm';
import {loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
import {root} from './runtime.mjs';
import {startLearningProfile,learningArea} from './learning-runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
const live=process.argv.includes('--live');
const {ctx,profile}=await startLearningProfile([{id:'llm-pi-ai',config:live?providerConfig(224000,true):{providers:{}}},{id:'session-persistence-jsonl',config:{root:resolve(learningArea,'sessions')}},{id:'spill-local',config:{root:resolve(learningArea,'spill'),cleanupPeriodDays:7}}]);
const result={runtime:'0.2.1-rc.1',version:'0.6.0',originalStudyMateVersion:'2.0.1',checks:{},live};let handle,timer;
try{
 const roster=await ctx.agentPresets.remoteExportList();result.presets=roster.presets.map(x=>({id:x.id,name:x.name}));
 assert.ok(result.presets.some(x=>x.id==='learning'));assert.ok(result.presets.some(x=>x.id==='hiagent-learning'));
 const create=preset=>ctx.agents.create({sessionId:`learning-${preset}-${Date.now()}`,meta:{cwd:process.env.LEARN_WORKSPACE},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,preset);}});
 handle=await create('hiagent-learning');const agent=handle.agent;
 const native=await create('learning');
 const schemas=ctx.tools.schemas(agent),official=ctx.tools.schemas(native.agent);
 result.tools=schemas.map(x=>x.name).sort();result.schemaBytes=Buffer.byteLength(JSON.stringify(schemas));
 assert.deepEqual(result.tools,official.map(x=>x.name).sort());assert.ok(!result.tools.includes('run_code'));assert.ok(result.tools.includes('studymate_workspace_context'));assert.ok(!result.tools.includes('subagent_fork'));
 result.checks.nativeToolParity=true;await native.dispose();assert.ok(ctx.agentPresets.serviceFor(agent,'compaction'));
 const call=(name,args)=>ctx.tools.execute({name,arguments:args,callId:`learning-${name}-${Date.now()}`,agent,signal:new AbortController().signal});
 const skill=await call('skill',{name:'learning-system'});assert.equal(skill.isError,false,JSON.stringify(skill.content));
 const text=skill.content.map(x=>x.text??'').join('\n');assert.match(text,/<\/skill_content>/);assert.doesNotMatch(text,/hiagent-output-budget/);
 const require=createRequire(resolve(profile.dir,'package.json')),studyDir=resolve(require.resolve('@yunmiao/studymate/package.json'),'..');
 const source=(await readFile(resolve(studyDir,'preset/skills/learning-system/SKILL.md'),'utf8')).split('---').slice(2).join('---').trim();assert.ok(text.includes(source));result.checks.fullSkillPreserved=true;
 const context=await call('studymate_workspace_context',{});assert.equal(context.isError,false,JSON.stringify(context.content));assert.equal(context.value.workspace.path,process.env.LEARN_WORKSPACE);assert.equal(context.value.workspace.ready,true);result.checks.isolatedWorkspace=true;
 if(!live){
  // Reproduce the user's actual 63-call batch through the official agent loop
  // and native executors. No historical results or LLM success are fabricated.
  const original=(await readFile(root+'/.private/learning-session-f120e501.v4.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const batch=original.filter(x=>x.type==='tool/call'&&x.data.step===8);
  class ReplayAdapter extends LlmAdapter{
   sent=false;
   async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:224000}};}
   async *stream(){
    if(!this.sent){this.sent=true;for(let i=0;i<batch.length;i++){const call=batch[i].data;yield {type:'block-start',index:i,blockType:'tool-call'};yield {type:'block-end',index:i,block:{type:'tool-call',id:`replay-${i}`,name:call.name,arguments:call.arguments}};}yield {type:'finish',reason:{kind:'tool-calls'}};}
    else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'Replay complete.'}};yield {type:'finish',reason:{kind:'stop'}};}
   }
  }
  ctx.llm.registerAdapter(['hiagent'],new ReplayAdapter());
  agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Replay the historical read-only batch for output-policy verification.'}]}));await agent.whenIdle();
  const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));
  const results=events.filter(x=>x.type==='tool/result').map(x=>x.data.message);
  const reads=events.filter(x=>x.type==='tool/call'&&x.data.name==='read');
  const allowedReads=reads.filter(c=>results.find(r=>r.toolCallId===c.data.callId)?.isError===false);
  assert.equal(allowedReads.length,8);
  const denials=results.filter(x=>x.isError&&x.content.some(y=>/Kasumi learning/.test(y.text??'')));assert.equal(denials.length,53);
  const total=results.reduce((sum,x)=>sum+x.content.reduce((s,y)=>s+Buffer.byteLength(y.text??''),0),0);
  assert.ok(total<130000);result.replay={actualNativeExecution:true,scriptedModel:true,originalCalls:batch.length,successfulReads:allowedReads.length,guardDenials:denials.length,toolResultBytes:total,originalToolResultBytes:464357};
  // A new turn/step gets a fresh allowance; a sibling Balanced agent has no
  // learning guard. The binary fixture never contains user data.
  agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Start another step.'}]}));await agent.whenIdle();
  const reset=await call('read',{file_path:resolve(studyDir,'README.md'),offset:1,limit:3});assert.equal(reset.isError,false);result.checks.guardReset=true;
  const image=resolve(learningArea,'fixture.png');await writeFile(image,Buffer.from([137,80,78,71,13,10,26,10]));
  const blocked=await call('read',{file_path:image});assert.equal(blocked.isError,true);assert.match(blocked.content.map(x=>x.text??'').join(''),/binary file|invalid UTF-8 text/);result.checks.nativeBinaryRejection=true;
  const balanced=await create('hiagent-balanced-optimized');try{const unguarded=await ctx.tools.execute({name:'read',arguments:{file_path:image},callId:'balanced-scoping-check',agent:balanced.agent,signal:new AbortController().signal});assert.doesNotMatch(unguarded.content.map(x=>x.text??'').join(''),/Kasumi learning/);}finally{await balanced.dispose();}
  result.checks.scopedGuard=true;
 }else{
  timer=setTimeout(()=>agent.cancel(),330000);const started=performance.now();
  agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'这是 Kasumi 学习模式的只读验收。请通过 skill 加载 learning-system，并调用 studymate_workspace_context 确认工作区可用。不要创建科目、修改档案、遍历文档或委派。随后用两句话说明如何开始学习，并包含验收标记 HIAGENT_LEARNING_OK。'}]}));await agent.whenIdle();clearTimeout(timer);
  const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));const end=events.filter(x=>x.type==='turn/end').at(-1);assert.equal(end.data.reason.kind,'completed',JSON.stringify(end.data));
  const calls=events.filter(x=>x.type==='tool/call').map(x=>x.data.name);assert.ok(calls.includes('skill'));assert.ok(calls.includes('studymate_workspace_context'));
  const reply=events.filter(x=>x.type==='assistant/message').at(-1).data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');assert.match(reply,/HIAGENT_LEARNING_OK/);result.actualKasumi={calls,elapsedMs:Math.round(performance.now()-started),reply};
 }
 result.success=true;console.log(JSON.stringify({success:true,checks:result.checks,replay:result.replay,actualKasumi:result.actualKasumi}));
}catch(error){result.success=false;result.error=error.message;throw error;}
finally{clearTimeout(timer);await mkdir(root+'/reports',{recursive:true});await writeFile(root+`/reports/learning-${live?'live':'replay'}-05.json`,JSON.stringify(result,null,2));await handle?.dispose();await ctx.fiber.dispose();}
