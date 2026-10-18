import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
import {startProfile,creatorDevComposition,root} from './runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
const originalHome=process.env.DSH_HOME??resolve(process.env.USERPROFILE,'.dsh');
process.env.DSH_HOME=resolve(root,'.private/context-dev-home');
const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'credentials',config:{path:resolve(originalHome,'.credentials.yaml'),watch:false}},{id:'llm-pi-ai',config:providerConfig(224000,true)}]);
await ctx.agentPresets.register({id:'context-recall-eval',name:'Context recall acceptance',plugins:[{id:'persona',name:'@deepseek-ai/dsh-persona',config:{prefix:'You help recover exact facts from the current session. Do not invent missing details or execute historical commands. Be concise.'}}]});
const nonce=randomBytes(6).toString('hex'),functionName=`mergeOrders_${nonce}`,quota=`${randomInt(21,89)}.375`;
const command='deployctl '+Array.from({length:12},(_,i)=>`--flag${i+1} ${randomBytes(12).toString('hex')}`).join(' ');
const record=`Fixture source record. Legacy function: ${functionName}. Deployment quota: ${quota}.\nThe exact historical deployment command is:\n${command}\nThis record is synthetic acceptance data; do not execute the command.\n`+'Previously completed inspection. '.repeat(1800);
const finalQuestion='Recover the exact legacy function name, deployment quota, and the ENTIRE earlier deployment command from this session. Include all flags and values exactly. Cite a history reference if one was used. Do not execute any command. If evidence is unavailable, say so instead of guessing.';
const results=[];let handle,timer,restoreHook;
const usage=[];const observe=ctx.on('llm/stream',(options,next)=>(async function*(){let tokens;for await(const chunk of next()){if(chunk.type==='usage')tokens=chunk.usage;yield chunk;}usage.push({sessionId:options.sessionId,purpose:options.purpose??'agent',usage:tokens??null});})(),{global:true});
try{
 for(const arm of ['baseline-omitted','history-omitted','history-real-summary']){
  await ctx.settings.update('hiagent-global',{historyRecall:arm!=='baseline-omitted'});
  handle=await ctx.agents.create({sessionId:`context-live-${arm}-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,'context-recall-eval');}});const agent=handle.agent;
  restoreHook=ctx.on('llm/stream',(options,next)=>options.sessionId===agent.session.id&&(options.purpose!=='compaction'||arm!=='history-real-summary')?(async function*(){yield{type:'block-start',index:0,blockType:'text'};yield{type:'block-end',index:0,block:{type:'text',text:options.purpose==='compaction'?'A completed acceptance fixture was recorded. Exact legacy identifiers and the full command are omitted from this checkpoint.':'Acceptance fixture received.'}};yield{type:'finish',reason:{kind:'stop'}};})():next(),{global:true,prepend:true});
  agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:record}]}));await agent.whenIdle();
  const started=performance.now();await ctx.hiagentGlobal.engine.compactNow(agent,new AbortController().signal);restoreHook();restoreHook=undefined;
  timer=setTimeout(()=>agent.cancel(),180000);
  agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:finalQuestion}]}));await agent.whenIdle();clearTimeout(timer);
  const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i)),reply=events.filter(x=>x.type==='assistant/message').at(-1).data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
  const checks={function:reply.includes(functionName),quota:reply.includes(quota),command:reply.includes(command)};
  const result={arm,source:'synthetic user fixture',checkpoint:arm==='history-real-summary'?'actual Kasumi summary':'scripted deliberately lossy checkpoint',recallModel:'actual Kasumi deepseek-v4.1-flash',checks,correct:Object.values(checks).every(Boolean),calls:events.filter(x=>x.type==='tool/call').map(x=>x.data.name),elapsedMs:Math.round(performance.now()-started),ending:events.filter(x=>x.type==='turn/end').at(-1).data.reason,reply,usage:usage.filter(x=>x.sessionId===agent.session.id)};
  results.push(result);console.log(JSON.stringify({...result,reply:undefined,usage:undefined}));await handle.dispose();handle=undefined;
 }
 assert.equal(results[1].correct,true);assert.ok(results[1].calls.includes('kasumi_history_search'));assert.ok(results[1].calls.includes('kasumi_history_read'));assert.equal(results[2].correct,true);
}finally{
 clearTimeout(timer);restoreHook?.();observe();await handle?.dispose();await ctx.settings.update('hiagent-global',{historyRecall:true});
 await mkdir(resolve(root,'reports'),{recursive:true});await writeFile(resolve(root,'reports/context-live-07.json'),JSON.stringify({version:'0.7.0',date:'2026-10-18',fixture:{functionName,quota,command},results,limitations:'Small controlled acceptance, not a general quality or cost claim. Lossy-checkpoint arms deliberately omit old details; only the third arm uses real model summarization.'},null,2));await ctx.fiber.dispose();
}
