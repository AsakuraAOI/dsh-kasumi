import z from '@deepseek-ai/schemastery';
import {assistantStreamHasVisibleContent} from '@deepseek-ai/dsh-llm';
import {budgetResult} from './output-budget.js';
export const name='hiagent-global';
export const inject=['tools','spillStore','compaction'];
export const Config=z.object({
 enabled:z.boolean().default(true),providers:z.array(z.string()).default(['hiagent']),
 outputBudget:z.boolean().default(true),genericOutputs:z.boolean().default(true),
 readBatchGuard:z.boolean().default(true),maxReadCallsPerStep:z.number().step(1).min(1).max(64).default(8),
 pressureCompaction:z.boolean().default(true),recoveryGuard:z.boolean().default(true),
 readBytes:z.number().step(1).min(1024).default(12288),searchBytes:z.number().step(1).min(1024).default(6144),shellBytes:z.number().step(1).min(1024).default(8192),otherBytes:z.number().step(1).min(1024).default(16384),
}).i18n({zh:{enabled:'全局适配总开关',providers:'匹配的 Provider ID（精确匹配）',outputBudget:'工具输出预算',genericOutputs:'同时限制其他工具的纯文本呈现（技能除外）',readBatchGuard:'每步读取批次保护',maxReadCallsPerStep:'每步最多放行的文本读取调用',pressureCompaction:'自动纯文本压缩',recoveryGuard:'取消/部分输出后禁止重放',readBytes:'文件读取呈现预算（UTF-8 字节）',searchBytes:'搜索呈现预算（字节）',shellBytes:'终端呈现预算（字节）',otherBytes:'其他工具纯文本预算（字节）'}}).volatile();
export function apply(ctx,config={}){
 const current=()=>typeof config.get==='function'?config.get():config;
 const targets=()=>current().providers??['hiagent'];
 const matches=agent=>!!agent&&targets().includes(agent.session.requestHeader()?.config.provider??agent.options.provider);
 const enabled=()=>current().enabled!==false;
 const handlesOutput=agent=>enabled()&&current().outputBudget!==false&&matches(agent);
 const handlesReads=agent=>enabled()&&current().readBatchGuard!==false&&matches(agent);
 const wantsCompaction=agent=>enabled()&&current().pressureCompaction!==false&&matches(agent);
 const pressureOwners=new WeakSet();
 const handlesCompaction=agent=>wantsCompaction(agent)&&pressureOwners.has(agent);
 const engine=ctx.compaction;
 ctx.provide('hiagentGlobal',{matches,handlesOutput,handlesReads,handlesCompaction,enabled,engine});
 ctx.on('tools/post-execute',(exec,result,next)=>{const cfg=current();return handlesOutput(exec.agent)?budgetResult(ctx,{includeRead:true,genericOutputs:cfg.genericOutputs!==false,otherBytes:cfg.otherBytes??16384,budgets:{read:cfg.readBytes??12288,search:cfg.searchBytes??6144,directory:cfg.searchBytes??6144,shell:cfg.shellBytes??8192}},exec,result,next):next();},{global:true,prepend:true});
 const state=new WeakMap();
 ctx.tools.guard(exec=>{
  if(exec.name!=='read'||!handlesReads(exec.agent))return;
  const agent=exec.agent,session=agent.session;let cursor=state.get(agent);
  if(!cursor){cursor={seq:0,reads:0};state.set(agent,cursor);}
  for(let seq=cursor.seq;seq<session.seq;seq++)if(session.eventAt(seq)?.type==='step/start')cursor.reads=0;
  cursor.seq=session.seq;const limit=current().maxReadCallsPerStep??8;
  if(cursor.reads>=limit)return `Kasumi global: this step already admitted ${limit} text-read calls. Continue the remaining relevant reads in a later step with offset/limit. Load only the needed skills and references; use read_image for images.`;
  cursor.reads++;
 });
 // One isolated backend, explicitly auto:false. The Host owns only this
 // provider-filtered pressure hook; preset services and their commands remain.
 ctx.on('agent/pre-step',async({agent,signal},next)=>{
  const before=agent.session.seq;
  if(wantsCompaction(agent)&&!signal.aborted){
   try{const result=await engine.compactIfNeeded(agent,'pressure',signal);if(result!==null)pressureOwners.add(agent);}
   catch(error){
    // A real summary attempt owns this boundary even after failure. No-op or
    // invalid-window configuration leaves the preset's own policy available.
    for(let seq=before;seq<agent.session.seq;seq++)if(agent.session.eventAt(seq)?.type==='compaction/start')pressureOwners.add(agent);
    if(!signal.aborted)ctx.logger.warn(`Kasumi global compaction: ${error.message}; preserving the turn`);
   }
  }
  try{return await next();}finally{pressureOwners.delete(agent);}
 },{global:true,prepend:true});
 ctx.on('agent/request-error',async({agent,provider,turn,step,signal},next)=>{
  if(!enabled()||current().recoveryGuard===false||!targets().includes(provider))return next();
  if(signal.aborted)return undefined;
  for(let i=agent.session.seq-1;i>=0;i--){const event=agent.session.eventAt(i);if(event.type==='assistant/attempt'&&event.data.turn===turn&&event.data.step===step){if(assistantStreamHasVisibleContent(event.data.stream))return undefined;break;}if(event.type==='step/start')break;}
  return next();
 },{global:true,prepend:true});
}
