import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply,Config,DEFAULTS,overrideRetryPolicy} from '../src/retry.js';

const setup=(initial={})=>{
 const home=mkdtempSync(join(tmpdir(),'kasumi-retry-')),listeners=new Map(),disposers=[],agents=new Map(),routes=new Map();let config={...DEFAULTS,...initial};
 const ctx={profileContext:{home},agents:{get:id=>agents.get(id)},provide:(key,value)=>ctx[key]=value,on:(event,fn)=>{listeners.set(event,fn);},effect:fn=>{disposers.push(fn());},inject:(_,fn)=>fn({effect:fn=>disposers.push(fn()),connection:{fetch:{register:route=>{routes.set(route.path,route);return()=>routes.delete(route.path);}}}})};
 apply(ctx,{get:()=>config});
 const session={id:'test',seq:0,eventAt:()=>undefined,requestHeader:()=>({config:{provider:'hiagent',model:'deepseek-test'}})},messages=[];
 const agent={session,inbox:{nextTurn:[],nextStep:[]},whenIdle:async()=>{},followup:message=>messages.push(message)};agents.set(session.id,agent);
 const unload=()=>{for(const fn of disposers.splice(0))fn?.();};
 return {ctx,session,agent,messages,agents,routes,home,set:patch=>config={...config,...patch},emit:(type,data)=>listeners.get('session/event')(session,{type,data}),error:(payload,next)=>listeners.get('agent/request-error')({agent,turn:1,step:1,provider:'hiagent',failure:{code:'TIMEOUT'},signal:new AbortController().signal,...payload},next),unload,dispose:()=>{unload();rmSync(home,{recursive:true,force:true});},listeners};
};
const end=(h,turn,kind='max-tokens',extra={})=>h.emit('turn/end',{turn,reason:{kind,...extra}});
const normal={mode:'normal',maxRetries:1,retryableCodes:['RATE_LIMIT'],initialDelayMs:1,maxDelayMs:2,jitterRatio:0};

test('schema exposes native volatile config, rejects invalid values, defaults disabled',()=>{
 const cfg=Config({}).get();assert.equal(cfg.enabled,false);assert.equal(cfg.autoContinue,false);assert.deepEqual(cfg.providers,['hiagent']);
 assert.throws(()=>Config({maxRetries:-1}));assert.throws(()=>Config({jitterRatio:2}));
});
test('first matching provider/model override merges codes and preserves native policy mode',()=>{
 const cfg={...DEFAULTS,enabled:true,retryableCodes:['RATE_LIMIT','CUSTOM'],overrides:[{provider:'other',model:'*',maxRetries:8},{provider:'HI*',model:'deepseek-*',maxRetries:3,initialDelayMs:50,maxDelayMs:10,jitterRatio:-1},{provider:'*',model:'*',maxRetries:9}]};
 const result=overrideRetryPolicy(normal,cfg,'hiagent','deepseek-test');assert.equal(result.maxRetries,3);assert.equal(result.initialDelayMs,10);assert.equal(result.maxDelayMs,10);assert.equal(result.jitterRatio,0.1);assert.deepEqual(result.retryableCodes,['RATE_LIMIT','CUSTOM']);assert.equal(normal.maxRetries,1);
 const always=overrideRetryPolicy({...normal,mode:'always',maxRetries:undefined},cfg,'hiagent','deepseek-test');assert.equal(always.mode,'always');assert.equal(always.maxRetries,undefined);
});
test('disabled policy and other providers pass through unchanged; live enable takes effect',async()=>{
 const h=setup();try{let observed;await h.error({retryPolicy:normal},()=>{observed=normal;});assert.equal(observed,normal);
 h.set({enabled:true});await h.error({provider:'another',retryPolicy:normal},()=>({kind:'retry'}));assert.equal(h.ctx.kasumiRetry.snapshot().stats.retries,0);
 let p={retryPolicy:normal};await h.error(p,()=>({kind:'retry'}));assert.equal(h.ctx.kasumiRetry.snapshot().stats.retries,1);
 }finally{h.dispose();}
});
test('cancelled and partial visible attempts never enter the native retry chain',async()=>{
 const h=setup({enabled:true});try{const abort=new AbortController();abort.abort();await h.error({signal:abort.signal},()=>assert.fail('cancelled retry'));
 h.session.seq=1;h.session.eventAt=()=>({type:'assistant/attempt',data:{turn:1,step:1,stream:[{type:'chunk',time:1,chunk:{type:'text-delta',index:0,text:'already shown'}}]}});
 await h.error({},()=>assert.fail('partial replay'));
 }finally{h.dispose();}
});
test('truncation creates a v4 producer-owned message, respects cap and resets after completion',async()=>{
 const h=setup({autoContinue:true,maxContinuations:1,continuationPrompt:'继续当前任务'});try{
 end(h,1);await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,1);assert.equal(h.messages[0].source.kind,'plugin:kasumi-retry');assert.equal(h.messages[0].content[0].text,'继续当前任务');
 end(h,2);await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,1);assert.equal(h.ctx.kasumiRetry.snapshot().stats.capped,1);
 end(h,3,'completed');end(h,4);await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,2);
 }finally{h.dispose();}
});
test('transient error continuation is opt-in; deterministic and aborted errors never continue',async()=>{
 const h=setup({autoContinue:true});try{end(h,1,'error',{error:{code:'TIMEOUT'}});await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,0);
 h.set({continueOnError:true});end(h,2,'error',{error:{code:'AUTH'}});end(h,3,'aborted');await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,0);
 end(h,4,'error',{error:{code:'TIMEOUT'}});await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,1);
 }finally{h.dispose();}
});
test('pending continuation yields to user input, new turns, changed switches and disposal',async()=>{
 for(const change of ['user','turn','off','error-off','dispose','session-dispose','inbox']){
  const h=setup({autoContinue:true,continueOnError:true});let release;h.agent.whenIdle=()=>new Promise(r=>{release=r;});
  try{end(h,1,...(change==='error-off'?['error',{error:{code:'TIMEOUT'}}]:[]));await Promise.resolve();
   if(change==='user')h.emit('user/message',{source:{kind:'user'}});
   if(change==='turn')h.emit('turn/start',{turn:2});
   if(change==='off')h.set({autoContinue:false});
   if(change==='error-off')h.set({continueOnError:false});
   if(change==='dispose')h.unload();
   if(change==='session-dispose')h.listeners.get('session/disposed')(h.session);
   if(change==='inbox')h.agent.inbox.nextTurn.push({});
   release();await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,0,change);
  }finally{h.dispose();}
 }
});
test('new user message resets chain; duplicate turn/end is delivered once',async()=>{
 const h=setup({autoContinue:true,maxContinuations:1});try{end(h,1);end(h,1);await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,1);
 h.emit('user/message',{source:{kind:'user'}});end(h,2);await h.ctx.kasumiRetry.drain();assert.equal(h.messages.length,2);
 }finally{h.dispose();}
});
test('stats count actual retry decisions and redact the prompt in the read-only route',async()=>{
 const h=setup({enabled:true,continuationPrompt:'private prompt'});try{await h.error({failure:{code:'__proto__'},retryPolicy:normal},()=>undefined);assert.equal(h.ctx.kasumiRetry.snapshot().stats.retries,0);
 await h.error({failure:{code:'__proto__'},provider:'hiagent',retryPolicy:normal},()=>({kind:'retry'}));const snapshot=h.ctx.kasumiRetry.snapshot();assert.equal(snapshot.stats.byCode.__proto__,1);
 const route=h.routes.get('/api/plugins/kasumi/retry/stats');assert.deepEqual(route.methods,['GET']);const body=await(await route.fetch()).json();assert.equal(body.config.continuationPrompt,'(custom)');
 assert.doesNotMatch(readFileSync(snapshot.logPath,'utf8'),/private prompt/);assert.ok(statSync(snapshot.logPath).size<=262144);
 }finally{h.dispose();}
});
