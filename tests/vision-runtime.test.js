import test from 'node:test';
import assert from 'node:assert/strict';
import {startProfile,devComposition,root} from '../scripts/runtime.mjs';
import {LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {parseObservation} from '../src/vision.js';
import {randomUUID} from 'node:crypto';
import {startNativeProfile} from './native-profile.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGP4DwYMEAoAU7oL9ZisIGcAAAAASUVORK5CYII=','base64');
const chunks=async function*(text){yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'finish',reason:{kind:'stop'}};};
const send=async(agent,text,images=[],kind='user')=>{agent.followup(createUserMessage({source:{kind},content:[{type:'text',text},...images]}));await agent.whenIdle();};
class Adapter extends LlmAdapter{
  main=[];visual=[];capture=true;failVision=false;active=0;peak=0;
  async resolveModel(provider,id){return {provider,id,name:id,inputModalities:['text','image'],context:{contextWindow:128000}};}
  async *stream(options){
    if(!options.sessionId){
      this.visual.push(options);
      assert.deepEqual(options.tools,[]);assert.equal(options.messages.length,1);
      assert.ok(options.messages[0].content.filter(b=>b.type==='image').length<=4);
      if(this.failVision){yield {type:'finish',reason:{kind:'error',failure:{code:'TIMEOUT',message:'synthetic'}}};return;}
      this.active++;this.peak=Math.max(this.peak,this.active);
      try{await new Promise(r=>setTimeout(r,5));yield* chunks(JSON.stringify({text:'观察：'+options.messages[0].content.filter(b=>b.type==='image').map(b=>b.attachment.name).join(','),uncertainties:['边缘文字不清晰']}));}finally{this.active--;}
      return;
    }
    this.main.push(options);
    if(this.capture){
      this.capture=false;yield {type:'block-start',index:0,blockType:'tool-call'};
      yield {type:'block-end',index:0,block:{type:'tool-call',id:'capture-'+this.main.length,name:'capture_test',arguments:'{}'}};
      yield {type:'finish',reason:{kind:'tool-calls'}};return;
    }
    yield* chunks('done');
  }
}
async function fixture(count=9){
  const {ctx}=await startNativeProfile(['kasumi-vision']);
  const adapter=new Adapter();ctx.llm.registerAdapter(['hiagent','vision-provider'],adapter);
  const images=[];
  for(let i=0;i<count;i++)images.push({type:'image',attachment:await ctx.attachments.saveImage({data:png,mediaType:'image/png',name:'image-'+i+'.png'})});
  let calls=0;
  ctx.tools.register(defineTool({name:'capture_test',description:'Synthetic images from a tool.',parameters:{},output:{schema:{type:'json'},render:(_,value)=>[{type:'text',text:'原工具完成'},...value.images]},execute:async()=>{calls++;return {images};}}));
  const create=()=>ctx.agents.create({sessionId:'vision-'+randomUUID(),meta:{cwd:root},agentOptions:{provider:'hiagent',model:'test'}});
  return {ctx,adapter,images,create,calls:()=>calls};
}
test('native tools isolate nine images in fresh batches, preserve user images and provide scoped re-query',async()=>{
  const f=await fixture();let handle,other;
  try{
    handle=await f.create();await send(handle.agent,'读取这些测试图片，判断布局',[f.images[0]]);
    assert.equal(f.calls(),1);assert.equal(f.adapter.visual.length,3);
    assert.deepEqual(f.adapter.visual.map(r=>r.messages[0].content.filter(b=>b.type==='image').length).sort(),[1,4,4]);
    assert.ok(f.adapter.peak<=2);
    await f.ctx.kasumiVision.transform(handle.agent,f.images,'读取这些测试图片，判断布局',new AbortController().signal);
    assert.equal(f.adapter.visual.length,3);
    for(const request of f.adapter.main){
      assert.equal(request.messages.filter(m=>m.role==='user'&&m.source.kind==='user').flatMap(m=>m.content).filter(b=>b.type==='image').length,1);
      assert.ok(!request.messages.some(m=>m.source.kind!=='user'&&m.content.some(b=>b.type==='image')));
    }
    const tool=handle.agent.session.deriveMessages().find(m=>m.role==='tool');
    assert.ok(!tool.content.some(b=>b.type==='image'));
    assert.match(tool.content.map(b=>b.text).join(''),/image-8.png/);
    const evidence=tool.content.map(b=>b.text).join('');
    assert.ok(evidence.indexOf('观察：image-0.png')<evidence.indexOf('观察：image-4.png'));
    assert.ok(evidence.indexOf('观察：image-4.png')<evidence.indexOf('观察：image-8.png'));
    const ref=tool.content.map(b=>b.text).join('').match(/v-[a-f0-9]{64}/)[0];
    const query=await f.ctx.tools.execute({name:'kasumi_visual_query',arguments:{ref,question:'左下角是什么？'},callId:'query-detail',agent:handle.agent,signal:new AbortController().signal});
    assert.equal(query.isError,false);assert.equal(f.calls(),1);assert.equal(f.adapter.visual.length,4);
    other=await f.create();
    const denied=await f.ctx.tools.execute({name:'kasumi_visual_query',arguments:{ref,question:'read'},callId:'foreign-ref',agent:other.agent,signal:new AbortController().signal});
    assert.equal(denied.isError,true);assert.equal(f.adapter.visual.length,4);
  }finally{await other?.dispose();await handle?.dispose();await f.ctx.fiber.dispose();}
});
test('old tool-image history is durably replaced and replays without changing identities or user uploads',async()=>{
  const f=await fixture(2);let handle;
  try{
    await f.ctx.settings.update('kasumi-vision',{enabled:false});
    handle=await f.create();await send(handle.agent,'先记录历史',[f.images[0]]);
    const old=handle.agent.session.deriveMessages().find(m=>m.role==='tool');assert.ok(old.content.some(b=>b.type==='image'));
    await f.ctx.settings.update('kasumi-vision',{enabled:true});await send(handle.agent,'继续');
    const session=handle.agent.session,tool=session.deriveMessages().find(m=>m.role==='tool');
    assert.equal(tool.id,old.id);assert.equal(tool.toolCallId,old.toolCallId);assert.deepEqual(tool.source,old.source);
    assert.ok(!tool.content.some(b=>b.type==='image'));
    const events=Array.from({length:session.seq},(_,i)=>session.eventAt(i));
    assert.ok(events.some(e=>e.type==='tool/result'&&e.surfaceOp?.op==='replace'));
    assert.ok(events.some(e=>e.type==='tool/result'&&e.surfaceOp==='append'&&e.data.message.content.some(b=>b.type==='image')));
    const restored=f.ctx.sessions.prepare('vision-replayed',{seed:events,meta:{...session.header,id:'vision-replayed'},eventState:'detached'});
    assert.deepEqual(restored.deriveMessages(),session.deriveMessages());
    assert.ok(session.deriveMessages().some(m=>m.role==='user'&&m.source.kind==='user'&&m.content.some(b=>b.type==='image')));
    const visualCount=f.adapter.visual.length;await send(handle.agent,'继续');assert.equal(f.adapter.visual.length,visualCount);
  }finally{await f.ctx.settings.update('kasumi-vision',{enabled:true,visionProvider:'',visionModel:''});await handle?.dispose();await f.ctx.fiber.dispose();}
});
test('plugin/PTC input images and failed observations never leak to the main request; explicit route works',async()=>{
  const f=await fixture(1);let handle;
  try{
    handle=await f.create();f.adapter.capture=false;f.adapter.failVision=true;
    await send(handle.agent,'plugin image',f.images,'ptc-mode');
    const last=f.adapter.main.at(-1);assert.ok(!last.messages.some(m=>m.content.some(b=>b.type==='image')));
    assert.match(JSON.stringify(last.messages),/视觉识别未完成/);
    f.adapter.failVision=false;
    await f.ctx.settings.update('kasumi-vision',{visionProvider:'vision-provider',visionModel:'visual-test'});
    await send(handle.agent,'plugin image',f.images,'ptc-mode');
    assert.equal(f.adapter.visual.at(-1).provider,'vision-provider');assert.equal(f.adapter.visual.at(-1).model,'visual-test');
    assert.ok(!f.adapter.main.at(-1).messages.some(m=>m.content.some(b=>b.type==='image')));
    const abort=new AbortController();abort.abort();
    await assert.rejects(f.ctx.kasumiVision.transform(handle.agent,f.images,'cancelled',abort.signal),{name:'AbortError'});
  }finally{await f.ctx.settings.update('kasumi-vision',{enabled:true,visionProvider:'',visionModel:''});await handle?.dispose();await f.ctx.fiber.dispose();}
});
test('real PTC keeps structured values and forwards text observations through additional context',async()=>{
  const f=await fixture(1);let handle;
  try{
    handle=await f.create();handle.agent.ctx.tools.presentAs('ptc');
    const result=await f.ctx.tools.execute({name:'run_code',arguments:{code:'const value = await tools.capture_test({}); console.log(JSON.stringify(value));',description:'Read synthetic image evidence'},callId:'ptc-image-test',agent:handle.agent,signal:new AbortController().signal});
    assert.equal(result.isError,false,JSON.stringify(result));
    assert.ok(result.additionalContexts?.some(m=>m.source.kind==='plugin:kasumi-vision'&&m.content.some(b=>b.type==='text'&&b.text.includes('观察：'))),JSON.stringify(result));
    assert.ok(!result.additionalContexts.some(m=>m.content.some(b=>b.type==='image')));
    assert.equal(f.calls(),1);
    assert.match(JSON.stringify(result.value),/attachmentId/);
  }finally{await handle?.dispose();await f.ctx.fiber.dispose();}
});
test('vision parser rejects empty or malformed evidence',()=>{
  assert.throws(()=>parseObservation('{"text":"","uncertainties":[]}'));
  assert.throws(()=>parseObservation('{"text":"guess","uncertainties":[{}]}'));
  assert.deepEqual(parseObservation('```json\n{"text":"42","uncertainties":[]}\n```'),{text:'42',uncertainties:[]});
});

test('Seeit native frames pass directly to a capable main model without duplicate visual requests',async()=>{
  const f=await fixture(1);let handle;
  try{
    handle=await f.create();f.adapter.capture=false;
    const frame={...f.images[0],attachment:{...f.images[0].attachment,name:'seeit-native-'+ 'a'.repeat(64)+'-2.5.jpg'}};
    await send(handle.agent,'查看指定画面',[frame],'ptc-mode');
    assert.equal(f.adapter.visual.length,0);
    assert.ok(f.adapter.main.at(-1).messages.some(m=>m.content.some(b=>b.type==='image'&&b.attachment.name===frame.attachment.name)));
    const count=handle.agent.session.seq;
    await send(handle.agent,'继续');
    assert.equal(f.adapter.visual.length,0);
    assert.ok(!Array.from({length:handle.agent.session.seq-count},(_,i)=>handle.agent.session.eventAt(count+i)).some(e=>e.surfaceOp?.op==='replace'));
    const result=await f.ctx.kasumiVision.transform(handle.agent,[frame,f.images[0]],'描述可见内容',new AbortController().signal);
    assert.equal(result.filter(b=>b.type==='image').length,1);
    assert.equal(f.adapter.visual.length,1);
  }finally{await handle?.dispose();await f.ctx.fiber.dispose();}
});
