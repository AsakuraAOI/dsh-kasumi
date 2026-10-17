import {startProfile,root,creatorDevComposition} from './runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:providerConfig(224000,true)}]);
const report={success:false,searchProvider:'hiagent-websearch'};let handle,timer;
try{
 const sources=await ctx.web.search({query:'NumPy documentation',maxResults:5},AbortSignal.timeout(25000));
 assert.ok(sources.sources.some(x=>new URL(x.url).hostname==='numpy.org'));
 report.directSearch=sources;
 handle=await ctx.agents.create({sessionId:`websearch-live-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-balanced-optimized');}});
 const agent=handle.agent;assert.ok(ctx.tools.schemas(agent).some(x=>x.name==='web_search'));
 timer=setTimeout(()=>agent.cancel(),180000);
 agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'这是网页搜索接入的只读验收。必须调用一次 web_search，queries 只包含 "Jupyter Notebook official documentation"。从真实工具结果中给出一个 Jupyter 官方网站 URL，并输出 WEBSEARCH_GATEWAY_OK。不要写文件、读取本地资料、委派或调用其他工具。'}]}));
 await agent.whenIdle();clearTimeout(timer);
 const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));
 const calls=events.filter(x=>x.type==='tool/call');
 const results=events.filter(x=>x.type==='tool/result').map(x=>x.data.message);
 report.calls=calls.map(x=>({name:x.data.name,arguments:x.data.arguments}));
 assert.equal(calls.length,1);assert.equal(calls[0].data.name,'web_search');
 assert.equal(results[0].isError,false);
 report.toolResult=results[0].content;
 assert.match(JSON.stringify(results[0].content),/jupyter\.org/);
 const end=events.filter(x=>x.type==='turn/end').at(-1);assert.equal(end.data.reason.kind,'completed');
 report.reply=events.filter(x=>x.type==='assistant/message').at(-1).data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
 assert.match(report.reply,/WEBSEARCH_GATEWAY_OK/);assert.match(report.reply,/jupyter\.org/);
 report.usage=events.filter(x=>x.type==='assistant/message').map(x=>x.data.usage);
 report.success=true;console.log(JSON.stringify({success:true,calls:report.calls.map(x=>x.name),sources:report.directSearch.sources.length,reply:report.reply}));
}catch(error){report.error=error.message;throw error;}
finally{clearTimeout(timer);await writeFile(root+'/reports/websearch-live-01.json',JSON.stringify(report,null,2));await handle?.dispose();await ctx.fiber.dispose();}
