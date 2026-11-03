import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VisionService,parseObservation,visionErrorCode} from '../src/vision.js';

test('OCR Markdown and malformed legacy JSON retain exact LaTeX and visible evidence',()=>{
  const markdown='# 定理\n\\frac{1}{2} + \\sqrt{x}，条件未知。';
  assert.equal(parseObservation(markdown).text,markdown);
  const invalid='{"text":"公式 \\sqrt{x}，见下行\n原条件","uncertainties":[]}';
  const recovered=parseObservation(invalid);assert.equal(recovered.text,invalid);assert.ok(recovered.uncertainties.length);
  const ambiguous='{"text":"\\frac{1}{2}","uncertainties":[]}';
  assert.equal(parseObservation(ambiguous).text,ambiguous);
  assert.throws(()=>parseObservation('   '));
  assert.throws(()=>parseObservation('{"text":"","uncertainties":[]}'));
  assert.equal(visionErrorCode(new DOMException('request expired','TimeoutError')),'VISION_TIMEOUT');
});

test('five queued image observations each receive their own provider timeout',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'kasumi-vision-queue-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  let calls=0,active=0,peak=0;
  const ctx={get:name=>name==='profileContext'?{dir:directory}:undefined,llm:{
    resolveModelInfo:async()=>({inputModalities:['image']}),
    async *stream(options){
      calls++;active++;peak=Math.max(peak,active);
      try{
        await new Promise(r=>setTimeout(r,35));options.signal.throwIfAborted();
        yield {type:'block-end',index:0,block:{type:'text',text:'清晰可见的公式 \\sqrt{x}。'}};
        yield {type:'finish',reason:{kind:'stop'}};
      }finally{active--;}
    },
  }};
  // Short deadlines keep the test fast; the five serial calls take longer
  // than one request's deadline, but every individual call fits inside it.
  const service=new VisionService(ctx,{concurrency:1,timeoutMs:100});
  const agent={session:{id:'queue-fixture',requestHeader:()=>({config:{provider:'test',model:'vision'}})}};
  const results=await Promise.all(Array.from({length:5},(_,i)=>service.transform(agent,[{type:'image',attachment:{attachmentId:'fixture-'+i,name:i+'.png'}}],'读取公式',new AbortController().signal)));
  assert.equal(calls,5);assert.equal(peak,1);
  for(const content of results){assert.match(content[0].text,/清晰可见的公式/);assert.doesNotMatch(content[0].text,/识别未完成/);}
  assert.equal(service.active,0);assert.equal(service.waiters.size,0);
  service.lifetime.abort();
});
