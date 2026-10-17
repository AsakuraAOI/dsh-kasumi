import {startProfile,devComposition,root} from './runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import assert from 'node:assert/strict';
const dir=resolve(root,'benchmark-runs/final-160k-lite/single-bug-hiagent-lite-optimized-1');
const lines=(await readFile(resolve(dir,'metrics.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
const sessionId=lines.find(x=>x.sessionId)?.sessionId;
const metrics=resolve(root,'reports/real-compaction-roundtrip.metrics.jsonl');
const {ctx}=await startProfile('hiagent-dev',[...devComposition(),{id:'llm-pi-ai',config:providerConfig(160000)},{id:'session-persistence-jsonl',config:{root:resolve(dir,'sessions')}},{id:'hiagent-observability',config:{enabled:true,path:metrics}},{id:'fs-sandbox',config:{cwd:resolve(dir,'workspace')}}]);
let handle;
try {
 handle=await ctx.agents.resume({resumeSessionId:sessionId,agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-lite-optimized')}});
 const agent=handle.agent;await agent.whenIdle();
 const before=agent.session.deriveMessages();
 assert.ok(before.some(x=>x.content.some(y=>y.type==='tool-call')));
 assert.ok(before.some(x=>x.role==='tool'));
 const compact=await ctx.agentPresets.serviceFor(agent,'compaction').compactNow(agent,new AbortController().signal);assert.ok(compact);
 agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Without using tools, report the code file modified in the previous task and the verification command actually used. Keep your reply brief.'}]}));await agent.whenIdle();
 const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));
 const final=events.filter(x=>x.type==='assistant/message').at(-1).data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
 assert.match(final,/src[\\/]math\.js/);assert.match(final,/(?:node --test|npm test)/);
 await ctx.sessions.flush(agent.session);
 const result={success:true,sessionId,priorToolCalls:before.reduce((sum,x)=>sum+x.content.filter(y=>y.type==='tool-call').length,0),priorToolResults:before.filter(x=>x.role==='tool').length,compactionId:compact.compactionId,final};
 await writeFile(resolve(root,'reports/real-compaction-roundtrip.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await handle?.dispose();await ctx.fiber.dispose();}
