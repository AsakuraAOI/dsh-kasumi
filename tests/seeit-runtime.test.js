import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import { startNativeProfile } from './native-profile.mjs';
import { root } from '../scripts/runtime.mjs';
import { realMedia } from '../../dsh-seeit-video/tests/fixture.mjs';

test('real DSH tool pipeline supports native frames, independent ASR and text-model visual extraction', async t => {
  const media = await realMedia(t), previousFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push(url);
    if (url.endsWith('/audio/transcriptions')) {
      const bytes = Buffer.from(await init.body.get('file').arrayBuffer()); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      return Response.json({ text: '测试音轨原始转写' });
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(init.body); assert.equal(body.model, 'independent-vision');
      assert.ok(body.messages[1].content.filter(c => c.type === 'image_url').length <= 4);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '可见彩色测试图案。' } }] });
    }
    assert.fail('unexpected provider call');
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const { ctx } = await startNativeProfile(['kasumi-vision', { id: 'seeit-video', name: pathToFileURL(join(root, '../dsh-seeit-video/src/index.js')).href, config: {
    dataDir: join(media.directory, 'native'), asrBaseUrl: 'https://asr.invalid/v1', asrModel: 'independent-asr', asrApiKeyRef: '',
    visionBaseUrl: 'https://vision.invalid/v1', visionModel: 'independent-vision', visionApiKeyRef: '',
  } }]);
  const handles = [];
  try {
    class Adapter extends LlmAdapter {
      requests = [];
      async resolveModel(provider, id) { return { provider, id, name: id, inputModalities: id === 'image' ? ['text', 'image'] : ['text'] }; }
      async *stream(options) {
        this.requests.push(options);
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    }
    const adapter = new Adapter(); ctx.llm.registerAdapter(['test'], adapter);
    const create = async model => { const h = await ctx.agents.create({ sessionId: 'seeit-' + randomUUID(), meta: { cwd: media.directory }, agentOptions: { provider: 'test', model } }); handles.push(h); return h.agent; };
    const imageAgent = await create('image'), textAgent = await create('text');
    const call = (name, args, agent = imageAgent) => ctx.tools.execute({ name, arguments: args, agent, callId: randomUUID(), signal: new AbortController().signal });
    const opened = await call('media_open', { path: media.video }); assert.equal(opened.isError, false, JSON.stringify(opened));
    const { mediaId } = opened.value; assert.ok(mediaId);
    const native = await call('visual_observe', { mediaId, times: [1, 2] }); assert.equal(native.isError, false, JSON.stringify(native));
    assert.equal(requests.length, 0); assert.equal(native.content.filter(c => c.type === 'image').length, 2);
    imageAgent.followup(createUserMessage({ source: { kind: 'ptc-mode' }, content: native.content })); await imageAgent.whenIdle();
    assert.ok(adapter.requests.at(-1).messages.some(m => m.content.some(c => c.type === 'image')));
    const asr = await call('audio_transcribe', { mediaId, start: 0, end: 1 }, textAgent);
    assert.equal(asr.isError, false, JSON.stringify(asr)); assert.equal(asr.value.status, 'complete');
    const visual = await call('visual_observe', { mediaId, times: [1, 2], instruction: '描述颜色' }, textAgent);
    assert.equal(visual.isError, false, JSON.stringify(visual)); assert.equal(visual.value.mode, 'describe');
    assert.equal(visual.content.filter(c => c.type === 'image').length, 0);
    assert.equal(requests.length, 2);
  } finally { for (const h of handles) await h.dispose(); await ctx.fiber.dispose(); }
});

test('Seeit describe reuses Kasumi session vision with relative paths and no separate endpoint configuration',async t=>{
  const media=await realMedia(t);
  const {ctx}=await startNativeProfile(['kasumi-vision',{id:'seeit-video',name:pathToFileURL(join(root,'../dsh-seeit-video/src/index.js')).href,config:{dataDir:join(media.directory,'bridge'),visionBaseUrl:'',visionModel:''}}]);
  let handle;
  class Adapter extends LlmAdapter{
    requests=[];
    async resolveModel(provider,id){return {provider,id,name:id,inputModalities:['text','image']};}
    async *stream(options){
      this.requests.push(options);assert.equal(options.sessionId,undefined);assert.deepEqual(options.tools,[]);
      assert.equal(options.messages.length,1);assert.ok(options.messages[0].content.filter(b=>b.type==='image').length<=4);
      yield {type:'block-end',index:0,block:{type:'text',text:'# 原题\n公式 \\frac{1}{2} + \\sqrt{x}。\n不确定项：页脚模糊。'}};
      yield {type:'finish',reason:{kind:'stop'}};
    }
  }
  const adapter=new Adapter();ctx.llm.registerAdapter(['test'],adapter);
  try{
    handle=await ctx.agents.create({sessionId:'seeit-bridge-'+randomUUID(),meta:{cwd:media.directory},agentOptions:{provider:'test',model:'current-session'}});
    const args={paths:['still.png'],mode:'describe',instruction:'保留原题公式，不推导。'};
    const call=(extra={})=>ctx.tools.execute({name:'visual_observe',arguments:{...args,...extra},agent:handle.agent,callId:randomUUID(),signal:new AbortController().signal});
    const result=await call();assert.equal(result.isError,false,JSON.stringify(result));assert.equal(result.value.status,'complete');assert.equal(result.value.mode,'describe');
    assert.equal(result.value.observations[0].source,'kasumi');assert.equal(result.value.observations[0].model,'current-session');
    assert.match(result.value.observations[0].text,/\\frac\{1\}\{2\}/);
    assert.equal(result.content.filter(b=>b.type==='image').length,0);
    assert.equal(adapter.requests.length,1);await call();assert.equal(adapter.requests.length,1);
    await call({force:true});assert.equal(adapter.requests.length,2);
  }finally{await handle?.dispose();await ctx.fiber.dispose();}
});
