// Retry policy and continuation concepts adapted from dsh-llm-retry-settings
// 0.1.17 (MIT). See LICENSES/Retry-Settings-MIT.txt. Execution stays in DSH's
// native retry engine; this module owns configuration and bounded follow-ups.
import z from '@deepseek-ai/schemastery';
import {assistantStreamHasVisibleContent, createUserMessage} from '@deepseek-ai/dsh-llm';
import {appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export const name='kasumi-retry';
export const inject=['agents','sessions'];
export const DEFAULTS={enabled:false,providers:['hiagent'],maxRetries:2,initialDelayMs:500,maxDelayMs:10000,jitterRatio:0.1,retryableCodes:['INVALID_REQUEST','PI_AI_ERROR'],autoContinue:false,maxContinuations:2,continuationPrompt:'',continueOnError:false,overrides:[],diagnostics:true};
const inherit=()=>z.number().step(1).min(-1).default(-1);
export const Config=z.object({
 enabled:z.boolean().default(false),providers:z.array(z.string()).default(['hiagent']),
 maxRetries:z.number().step(1).min(0).default(2),initialDelayMs:z.number().step(1).min(1).default(500),maxDelayMs:z.number().step(1).min(1).default(10000),jitterRatio:z.number().min(0).max(1).default(0.1),
 retryableCodes:z.array(z.string()).default(DEFAULTS.retryableCodes),autoContinue:z.boolean().default(false),maxContinuations:z.number().step(1).min(0).default(2),continuationPrompt:z.string().default(''),continueOnError:z.boolean().default(false),
 overrides:z.array(z.object({provider:z.string().default('*'),model:z.string().default('*'),maxRetries:inherit(),initialDelayMs:inherit(),maxDelayMs:inherit(),jitterRatio:z.number().min(-1).max(1).default(-1)})).max(20).default([]),
 diagnostics:z.boolean().default(true),
}).i18n({zh:{enabled:'覆盖原生重试策略',providers:'适用的 Provider ID（留空适用所有通道）',maxRetries:'最多重试次数',initialDelayMs:'初始退避（毫秒）',maxDelayMs:'最大退避（毫秒）',jitterRatio:'退避抖动比例',retryableCodes:'额外可重试错误码（与原生列表合并）',autoContinue:'输出截断后自动续写',maxContinuations:'连续自动续写上限',continuationPrompt:'续写提示词（留空使用默认值）',continueOnError:'瞬时错误耗尽重试后允许续写',overrides:'按 Provider / Model 覆盖（首条命中，-1 继承）',diagnostics:'保留重试统计与诊断日志'}}).volatile();
const SOURCE='plugin:kasumi-retry';
const TRANSIENT=new Set(['PI_AI_ERROR','TRANSPORT','TIMEOUT','SERVER','EMPTY_RESPONSE','STREAM_CLOSED','MALFORMED_RESPONSE','INVALID_RESPONSE','PI_AI_NOT_WARMED','UNKNOWN']);
const PROMPT='上一条回复因达到输出 token 上限被截断。请从中断处直接继续输出，不要重复已经输出的内容，也不要重新开头。';
const ERROR_PROMPT='上一条回复因瞬时请求失败而中断。请从中断处继续完成用户的请求，不要重复已经执行的操作或已经输出的内容。';
const currentOf=config=>({...DEFAULTS,...(typeof config.get==='function'?config.get():config)});
export function globMatch(pattern,value){
 const parts=(pattern??'*').trim().toLowerCase().split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 return new RegExp('^'+(parts.join('.*')||'.*')+'$').test((value??'').toLowerCase());
}
export function overrideRetryPolicy(policy,config,provider,model){
 if(!config.enabled||!policy)return policy;
 const row=config.overrides.find(x=>globMatch(x.provider,provider)&&globMatch(x.model,model));
 const selected=key=>row?.[key]>=0?row[key]:config[key];
 const maxDelayMs=Math.max(1,selected('maxDelayMs'));
 return {...policy,...(policy.mode==='normal'?{maxRetries:selected('maxRetries')}:{}),initialDelayMs:Math.min(maxDelayMs,Math.max(1,selected('initialDelayMs'))),maxDelayMs,jitterRatio:selected('jitterRatio'),retryableCodes:[...new Set([...(policy.retryableCodes??[]),...config.retryableCodes])]};
}
function partialAttempt(session,turn,step){
 for(let i=session.seq-1;i>=0;i--){const e=session.eventAt(i);
  if(e.type==='assistant/attempt'&&e.data.turn===turn&&e.data.step===step)return assistantStreamHasVisibleContent(e.data.stream);
  if(e.type==='step/start')break;
 }
 return false;
}
const inboxBusy=agent=>(agent.inbox?.nextTurn?.length??0)>0||(agent.inbox?.nextStep?.length??0)>0;
const errorCode=reason=>reason?.error?.code??reason?.error?.failure?.code??reason?.failure?.code;

export function apply(ctx,config={}){
 const current=()=>currentOf(config),states=new Map(),models=new Map(),tasks=new Set();let disposed=false;
 const stats={startedAt:Date.now(),retries:0,continues:0,capped:0,skipped:0,byCode:Object.create(null),byProvider:Object.create(null),recent:[]};
 const logPath=join(ctx.profileContext?.home??process.env.DSH_HOME??join(homedir(),'.dsh'),'logs','kasumi','retry.jsonl');
 const targets=provider=>!current().providers.length||current().providers.includes(provider);
 const bump=(bag,key)=>{if(!key)return;if(!Object.hasOwn(bag,key)&&Object.keys(bag).length>=128)delete bag[Object.keys(bag)[0]];bag[key]=(bag[key]??0)+1;};
 const record=(kind,data={})=>{
  if(!current().diagnostics)return;
  const item={at:new Date().toISOString(),kind,...data};stats.recent.push(item);if(stats.recent.length>50)stats.recent.shift();
  try{mkdirSync(join(logPath,'..'),{recursive:true});let size=0;try{size=statSync(logPath).size;}catch{}const line=JSON.stringify(item)+'\n';if(size+Buffer.byteLength(line)>262144)writeFileSync(logPath,line);else appendFileSync(logPath,line);}catch{}
 };
 const stateOf=id=>{if(!states.has(id)){states.set(id,{chain:0,lastTurn:-1,generation:0,capped:false});if(states.size>200)states.delete(states.keys().next().value);}return states.get(id);};
 const route=session=>{const known=models.get(session.id);const header=session.requestHeader?.()?.config??{};return known??{provider:header.provider??'',model:header.model??''};};
 const snapshot=()=>({config:current(),stats:structuredClone(stats),models:Object.fromEntries(models),logPath});
 ctx.provide('kasumiRetry',{current,snapshot,drain:()=>Promise.allSettled([...tasks])});
 ctx.on('agent/request-error',async(payload,next)=>{
  const cfg=current();if(!cfg.enabled||!targets(payload.provider))return next();
  if(disposed||payload.signal.aborted||payload.failure?.code==='ABORTED'||partialAttempt(payload.agent.session,payload.turn,payload.step))return undefined;
  const known=route(payload.agent.session),model=known.provider===payload.provider?known.model:'';
  payload.retryPolicy=overrideRetryPolicy(payload.retryPolicy,cfg,payload.provider,model);
  const result=await next();
  if(result?.kind==='retry'&&!disposed&&!payload.signal.aborted){stats.retries++;bump(stats.byCode,payload.failure.code);bump(stats.byProvider,payload.provider);record('retry',{provider:payload.provider,model,code:payload.failure.code,turn:payload.turn,step:payload.step});}
  return result;
 },{prepend:true,global:true});
 const handleEnd=(session,event)=>{
  const state=stateOf(session.id),{turn,reason}=event.data;if(state.lastTurn===turn)return;state.lastTurn=turn;state.generation++;
  const transient=reason.kind==='error'&&TRANSIENT.has(errorCode(reason));
  if(reason.kind!=='max-tokens'&&!transient){state.chain=0;state.capped=false;return;}
  const cfg=current(),known=route(session);
  if(!cfg.autoContinue||!targets(known.provider)||(transient&&!cfg.continueOnError))return;
  if(state.chain>=cfg.maxContinuations){if(!state.capped){state.capped=true;stats.capped++;record('cap',{session:session.id,turn});}return;}
  const agent=ctx.agents.get(session.id);if(!agent||agent.session!==session||inboxBusy(agent))return;
  const generation=state.generation;
  const pending=Promise.resolve().then(async()=>{
   await agent.whenIdle();
   const fresh=current(),latest=route(session);
   if(disposed||states.get(session.id)!==state||state.generation!==generation||!fresh.autoContinue||!targets(latest.provider)||(transient&&!fresh.continueOnError)||state.chain>=fresh.maxContinuations||inboxBusy(agent)||ctx.agents.get(session.id)!==agent){stats.skipped++;record('skip',{session:session.id,turn});return;}
   const prompt=fresh.continuationPrompt.trim()||(transient?ERROR_PROMPT:PROMPT);
   state.chain++;
   agent.followup(createUserMessage({source:{kind:SOURCE},content:[{type:'text',text:prompt}]}));
   stats.continues++;record('continue',{session:session.id,turn,provider:latest.provider,model:latest.model,chain:state.chain});
  }).catch(()=>{record('continuation-failed',{session:session.id,turn});}).finally(()=>tasks.delete(pending));
  tasks.add(pending);
 };
 ctx.on('session/event',(session,event)=>{
  if(disposed)return;
  if(event.type==='request/context'||event.type==='request/header'){
   const value=event.type==='request/context'?event.data:event.data?.header?.config;
   if(typeof value?.provider==='string'&&typeof value.model==='string'){models.set(session.id,{provider:value.provider,model:value.model});if(models.size>200)models.delete(models.keys().next().value);}return;
  }
  if(event.type==='user/message'&&event.data.source?.kind!==SOURCE){const state=stateOf(session.id);state.chain=0;state.capped=false;state.generation++;return;}
  if(event.type==='turn/start'){stateOf(session.id).generation++;return;}
  if(event.type==='turn/end')handleEnd(session,event);
 },{global:true});
 ctx.on('session/disposed',session=>{states.delete(session.id);models.delete(session.id);},{global:true});
 ctx.effect(()=>()=>{disposed=true;states.clear();models.clear();});
 ctx.inject(['connection'],owner=>{
  owner.effect(()=>owner.connection.fetch.register({path:'/api/plugins/kasumi/retry/stats',methods:['GET'],fetch:()=>Response.json({...snapshot(),config:{...current(),continuationPrompt:current().continuationPrompt.trim()?'(custom)':'(default)'}},{headers:{'Cache-Control':'no-store'}})}));
  owner.effect(()=>owner.connection.fetch.register({path:'/api/plugins/kasumi/retry/log',methods:['GET'],fetch:()=>{let lines=[];try{lines=readFileSync(logPath,'utf8').trimEnd().split('\n').slice(-80);}catch{}return Response.json({lines},{headers:{'Cache-Control':'no-store'}});}}));
 });
}
