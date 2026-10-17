import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createUserMessage,LlmAdapter} from '@deepseek-ai/dsh-llm';
import {startLearningProfile,learningArea} from './learning-runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {root} from './runtime.mjs';
const live=process.argv.includes('--live');
const {ctx}=await startLearningProfile([{id:'llm-pi-ai',config:live?providerConfig(224000,true):{providers:{}}},{id:'session-persistence-jsonl',config:{root:resolve(learningArea,'global-sessions')}}]);
const result={version:'0.6.0',preset:'learning',originalStudyMateMode:true,live};let handle,timer;
try{
 assert.equal(ctx.hiagentGlobal.enabled(),true);const form=ctx.settings.describe().find(x=>x.ns==='hiagent-global');assert.ok(form);assert.equal(form.applies,'live');result.globalForm={ns:form.ns,applies:form.applies,value:form.value};
 const original=(await readFile(root+'/.private/learning-session-f120e501.v4.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse);
 const batch=original.filter(x=>x.type==='tool/call'&&x.data.step===8);
 class Adapter extends LlmAdapter{
  sent=false;
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:224000}};}
  async *stream(){if(!this.sent){this.sent=true;for(let i=0;i<batch.length;i++){const call=batch[i].data;yield{type:'block-start',index:i,blockType:'tool-call'};yield{type:'block-end',index:i,block:{type:'tool-call',id:`global-replay-${i}`,name:call.name,arguments:call.arguments}};}yield{type:'finish',reason:{kind:'tool-calls'}};}else{yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:'Replay done.'}};yield{type:'finish',reason:{kind:'stop'}};}}
 }
 if(!live)ctx.llm.registerAdapter(['hiagent'],new Adapter());
 handle=await ctx.agents.create({sessionId:`global-original-learning-${Date.now()}`,meta:{cwd:process.env.LEARN_WORKSPACE},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,'learning');}});const agent=handle.agent;
 result.tools=ctx.tools.schemas(agent).map(x=>x.name).sort();
 const started=performance.now();timer=setTimeout(()=>agent.cancel(),330000);
 agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:live?'这是原版学习模式配合 Kasumi 全局适配的只读验收。请加载 learning-system 并调用 studymate_workspace_context。不要创建科目、写档案、批量读文档或委派。确认工作区可用后，用一句话说明下一步并返回 HIAGENT_GLOBAL_LEARNING_OK。':'Replay the historical read-only batch.'}]}));await agent.whenIdle();clearTimeout(timer);
 const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));assert.equal(events.filter(x=>x.type==='turn/end').at(-1).data.reason.kind,'completed');
 const results=events.filter(x=>x.type==='tool/result').map(x=>x.data.message),calls=events.filter(x=>x.type==='tool/call');
 result.calls=calls.map(x=>x.data.name);
 if(!live){result.replay={calls:calls.length,successfulReads:calls.filter(x=>x.data.name==='read'&&results.find(r=>r.toolCallId===x.data.callId)?.isError===false).length,denials:results.filter(x=>x.isError&&x.content.some(y=>/Kasumi global/.test(y.text??''))).length,toolResultBytes:results.reduce((s,x)=>s+x.content.reduce((n,y)=>n+Buffer.byteLength(y.text??''),0),0),originalToolResultBytes:464357,scriptedModel:true};assert.equal(result.replay.successfulReads,8);assert.equal(result.replay.denials,53);assert.ok(result.replay.toolResultBytes<130000);}
 else{assert.ok(result.calls.includes('skill'));assert.ok(result.calls.includes('studymate_workspace_context'));result.reply=events.filter(x=>x.type==='assistant/message').at(-1).data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');assert.match(result.reply,/HIAGENT_GLOBAL_LEARNING_OK/);}
 result.elapsedMs=Math.round(performance.now()-started);result.success=true;console.log(JSON.stringify({success:true,preset:'learning',live,calls:result.calls,replay:result.replay,elapsedMs:result.elapsedMs}));
}catch(error){result.success=false;result.error=error.message;throw error;}
finally{clearTimeout(timer);await mkdir(root+'/reports',{recursive:true});await writeFile(root+`/reports/global-learning-${live?'live':'replay'}-06.json`,JSON.stringify(result,null,2));await handle?.dispose();await ctx.fiber.dispose();}
