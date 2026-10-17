import{startProfile,root,creatorDevComposition}from'./runtime.mjs';
import{providerConfig}from'../config/provider.mjs';
import{createUserMessage}from'@deepseek-ai/dsh-llm';
import{writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const model=process.argv[2]??'deepseek-v4.1-flash';
const config=providerConfig(224000,true);config.providers.hiagent.models.push({id:'mimov2.6pro',name:'mimov2.6pro',input:['text'],contextWindow:224000});
const{ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config}]);
const result={model,success:false};let handle,timer;
try{
 const started=performance.now();
 const direct=await ctx.web.search({query:'DeepSeek V3.2 发布日期',maxResults:5},AbortSignal.timeout(60000));
 result.direct={ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(JSON.stringify(direct)),...direct};
 assert.match(direct.content,/2025-12-01/);assert.match(direct.content,/2025-09-29/);assert.match(direct.content,/api-docs\.deepseek\.com/);
 const repeat=await ctx.web.search({query:'DeepSeek V3.2 发布日期',maxResults:5},AbortSignal.timeout(60000));
 result.cachedRepeat={bytes:Buffer.byteLength(JSON.stringify(repeat)),content:repeat.content};
 assert.match(repeat.content,/"cached":true/);assert.match(repeat.content,/"modelCalls":0/);
 handle=await ctx.agents.create({sessionId:`web-research-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-balanced-optimized');}});
 const agent=handle.agent;timer=setTimeout(()=>agent.cancel(),180000);
 agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'这是只读联网搜索验收。请调用 web_search 搜索 DeepSeek V3.2 发布日期，自行发现并核对原始来源，再回答 V3.2-Exp 和 V3.2 正式版各自的发布日期，并提供支持日期的实际来源链接。不要将网页更新日期当作发布事件；证据不足请 web_fetch 阅读相关原文，仍不足则明确未知。不要写文件、委派或使用其他工具。'}]}));
 await agent.whenIdle();clearTimeout(timer);
 const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));
 result.calls=events.filter(x=>x.type==='tool/call').map(x=>({name:x.data.name,arguments:x.data.arguments}));
 result.outputs=events.filter(x=>x.type==='tool/result').map(x=>({isError:x.data.message.isError,content:x.data.message.content}));
 result.reply=events.filter(x=>x.type==='assistant/message').at(-1)?.data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n')??'';
 result.turnEnd=events.filter(x=>x.type==='turn/end').at(-1)?.data.reason;
 result.usage=events.filter(x=>x.type==='assistant/message').map(x=>x.data.usage);
 assert.ok(result.calls.some(x=>x.name==='web_search'));assert.ok(result.outputs.every(x=>x.isError===false));assert.equal(result.turnEnd.kind,'completed');
 assert.match(result.reply,/2025.{0,6}(?:09|9).{0,6}29/u);assert.match(result.reply,/2025.{0,6}12.{0,6}(?:01|1)/u);assert.match(result.reply,/api-docs\.deepseek\.com/u);
 const normalize=url=>new URL(url).href.replace(/\/$/u,'');
 const acquired=new Set(result.outputs.flatMap(x=>x.content.filter(p=>p.type==='text').flatMap(p=>[...p.text.matchAll(/"url"\s*:\s*"(https?:[^"\s]+)"/gu)].map(m=>normalize(m[1])))));
 result.citations=[...result.reply.matchAll(/\]\((https?:[^)\s]+)\)/gu)].map(m=>m[1]);
 result.citationCoverage=result.citations.every(url=>acquired.has(normalize(url)));
 assert.equal(result.citationCoverage,true,'Final answer cites a URL absent from actually acquired tool source records.');
 result.success=true;console.log(JSON.stringify({model,success:true,ms:result.direct.ms,bytes:result.direct.bytes,calls:result.calls.map(x=>x.name),reply:result.reply}));
}catch(error){result.error=error.message;console.log(JSON.stringify({model,success:false,error:result.error,calls:result.calls,reply:result.reply}));process.exitCode=1;}
finally{clearTimeout(timer);await writeFile(root+`/reports/web-research-live-${model}.json`,JSON.stringify(result,null,2));await handle?.dispose();await ctx.fiber.dispose();}
