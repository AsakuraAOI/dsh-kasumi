import {startProfile,root,creatorDevComposition} from './runtime.mjs';
import {providerConfig} from '../config/provider.mjs';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const model=process.argv[2]??'deepseek-v4.1-flash';
const config=providerConfig(224000,true);
config.providers.hiagent.models.push({id:'mimov2.6pro',name:'mimov2.6pro',input:['text'],contextWindow:224000});
const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config}]);
const result={model,success:false};let handle,timer;
try{
 const direct=await ctx.web.fetch({url:'https://macin.top/posts/360e83e7/'},AbortSignal.timeout(20000));
 assert.equal(direct.statusCode,200);assert.match(direct.body.content,/2025-12-07/);assert.match(direct.body.content,/2026-09-28/);assert.match(direct.body.content,/不代表陈述真实/);
 result.directFetch={statusCode:direct.statusCode,bytes:Buffer.byteLength(direct.body.content)};
 handle=await ctx.agents.create({sessionId:`web-evidence-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-balanced-optimized');}});
 const agent=handle.agent;timer=setTimeout(()=>agent.cancel(),180000);
 agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'这是网页事实核验的只读验收。先调用一次 web_search 搜索 DeepSeek V3.2 发布日期，然后必须用 web_fetch 读取官方更新日志 https://api-docs.deepseek.com/updates/ 。只根据实际获得的官方正文回答 V3.2-Exp 和 V3.2 正式版各自的发布日期，提供官方链接，区分网页更新时间和模型发布事件。若读取失败明确说明未核实。不要写文件、委派或调用其他工具。'}]}));
 await agent.whenIdle();clearTimeout(timer);
 const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));
 const calls=events.filter(x=>x.type==='tool/call');const outputs=events.filter(x=>x.type==='tool/result').map(x=>x.data.message);
 result.calls=calls.map(x=>({name:x.data.name,arguments:x.data.arguments}));result.outputs=outputs.map(x=>({isError:x.isError,content:x.content}));
 result.reply=events.filter(x=>x.type==='assistant/message').at(-1)?.data.message.content.filter(x=>x.type==='text').map(x=>x.text).join('\n')??'';
 result.turnEnd=events.filter(x=>x.type==='turn/end').at(-1)?.data.reason;result.usage=events.filter(x=>x.type==='assistant/message').map(x=>x.data.usage);
 assert.ok(calls.some(x=>x.data.name==='web_search'));assert.ok(calls.some(x=>x.data.name==='web_fetch'));assert.ok(outputs.every(x=>x.isError===false));
 assert.equal(result.turnEnd.kind,'completed');assert.match(result.reply,/2025.{0,6}(?:09|9).{0,6}29/u);assert.match(result.reply,/2025.{0,6}12.{0,6}(?:01|1)/u);assert.match(result.reply,/api-docs\.deepseek\.com/u);
 result.success=true;console.log(JSON.stringify({model,success:true,calls:result.calls.map(x=>x.name),reply:result.reply,directFetch:result.directFetch}));
}catch(error){result.error=error.message;console.log(JSON.stringify({model,success:false,error:result.error,calls:result.calls,reply:result.reply}));process.exitCode=1;}
finally{clearTimeout(timer);await writeFile(root+`/reports/web-evidence-live-${model}.json`,JSON.stringify(result,null,2));await handle?.dispose();await ctx.fiber.dispose();}
