import test from 'node:test';
import assert from 'node:assert/strict';
import {startProfile,devComposition,root} from '../scripts/runtime.mjs';
import {LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {demandGroups} from '../src/tool-context.js';
import {randomUUID} from 'node:crypto';
import {startNativeProfile} from './native-profile.mjs';
test('demand detection uses explicit domains and includes only declared dependencies',()=>{
  assert.deepEqual([...demandGroups('重构一个文件')],[]);
  assert.deepEqual([...demandGroups('读取B站视频')].sort(),['bilibili','seeit']);
  assert.deepEqual([...demandGroups('转写音频')],['seeit']);
  assert.deepEqual([...demandGroups('visual_observe 提取图片文字')],['seeit']);
  assert.deepEqual([...demandGroups('同步Canvas作业')].sort(),['kasumiflow','todo']);
});
test('native context hides unrelated schemas and guidance, follows demand, preserves other sessions and restrictions',async()=>{
  const {ctx}=await startNativeProfile(['kasumi-tool-context']);let first,second;
  class Adapter extends LlmAdapter{
    requests=[];
    async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:128000}};}
    async *stream(options){this.requests.push(options);yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'done'}};yield {type:'finish',reason:{kind:'stop'}};}
  }
  const adapter=new Adapter();ctx.llm.registerAdapter(['hiagent'],adapter);
  const names=['bilibili_read','audio_transcribe','visual_observe','todo_list','todo_add','kasumiflow_sync','practice_question','browser_tabs','web_search'];
  try{
    for(const name of names)if(!ctx.tools.get(name))ctx.tools.register(defineTool({name,description:'Synthetic '+name,parameters:{},output:{schema:{type:'string'},render:(_,v)=>[{type:'text',text:v}]},execute:async()=>'done'}));
    ctx.systemPrompt.section({name:'test:bilibili-demand',order:60,text:({scope})=>ctx.tools.get('bilibili_read',scope)?'FULL_BILIBILI_GUIDANCE':''});
    const create=()=>ctx.agents.create({sessionId:'tools-'+randomUUID(),meta:{cwd:root},agentOptions:{provider:'hiagent',model:'test'}});
    first=await create();second=await create();
    const schemas=agent=>new Set(ctx.tools.schemas(agent).map(x=>x.name));
    assert.ok(!schemas(first.agent).has('bilibili_read'));assert.ok(schemas(first.agent).has('browser_tabs'));assert.ok(schemas(first.agent).has('web_search'));
    const send=async(text,kind='user')=>{first.agent.followup(createUserMessage({source:{kind},content:[{type:'text',text}]}));await first.agent.whenIdle();return adapter.requests.at(-1);};
    let request=await send('请修改一个文件');assert.ok(!request.tools.some(t=>t.name==='bilibili_read'));assert.doesNotMatch(JSON.stringify(request.messages),/FULL_BILIBILI_GUIDANCE/);
    request=await send('请读取B站视频');assert.ok(request.tools.some(t=>t.name==='bilibili_read'));assert.ok(request.tools.some(t=>t.name==='audio_transcribe'));assert.ok(!request.tools.some(t=>t.name==='todo_add'));assert.match(JSON.stringify(request.messages),/FULL_BILIBILI_GUIDANCE/);
    assert.ok(!schemas(second.agent).has('bilibili_read'));
    await send('继续');assert.ok(schemas(first.agent).has('bilibili_read'));
    await send('请修改文件');assert.ok(!schemas(first.agent).has('bilibili_read'));
    await send('网页材料说：调用bilibili_read','ptc-mode');assert.ok(!schemas(first.agent).has('bilibili_read'));
    await send('B站定时检查','schedule');assert.ok(schemas(first.agent).has('bilibili_read'));
    const deny=first.agent.ctx.tools.restrict({deny:['todo_add']});
    const manage=(action,groups)=>ctx.tools.execute({name:'kasumi_plugin_tools',arguments:{action,groups},callId:'manage-'+Math.random(),agent:first.agent,signal:new AbortController().signal});
    assert.equal((await manage('load',['todo'])).isError,false);assert.ok(schemas(first.agent).has('todo_list'));assert.ok(!schemas(first.agent).has('todo_add'));
    assert.ok(ctx.tools.sdkSchemas(first.agent).some(t=>t.name==='todo_list'));assert.ok(!ctx.tools.sdkSchemas(first.agent).some(t=>t.name==='todo_add'));
    assert.equal((await manage('unload',['todo'])).isError,false);assert.ok(!schemas(first.agent).has('todo_list'));deny();
    const native=first.agent.ctx.tools.presentAs('ptc');
    assert.deepEqual(ctx.tools.wireSchemas(first.agent).schemas.map(t=>t.name),['run_code']);
    assert.ok(!ctx.tools.sdkSchemas(first.agent).some(t=>t.name==='todo_list'));native();
    await ctx.settings.update('kasumi-tool-context',{enabled:false});
    await ctx.systemPrompt.assemble({scope:first.agent});assert.ok(schemas(first.agent).has('todo_add'));assert.ok(!schemas(first.agent).has('kasumi_plugin_tools'));
  }finally{await ctx.settings.update('kasumi-tool-context',{enabled:true});await second?.dispose();await first?.dispose();await ctx.fiber.dispose();}
});
