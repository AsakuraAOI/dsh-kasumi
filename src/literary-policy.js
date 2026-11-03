import fs from 'node:fs';
import path from 'node:path';
import z from '@deepseek-ai/schemastery';
export const name='hiagent-literary-policy';
export const inject=['tools'];
export const Config=z.object({
 enabled:z.boolean().default(true),
 maxReadCallsPerStep:z.number().step(1).min(1).max(64).default(8),
 protectExistingWrites:z.boolean().default(true),
}).i18n({zh:{enabled:'启用文学模式稿件保护',maxReadCallsPerStep:'每步最多执行的文本读取次数',protectExistingWrites:'覆盖既有稿件前要求先读取'}});
export function apply(ctx,config={}){
 if(config.enabled===false)return;
 const limit=config.maxReadCallsPerStep??8,protect=config.protectExistingWrites!==false,state=new WeakMap();
 const entry=agent=>{let s=state.get(agent);if(!s){s={seq:0,reads:0,read:new Set()};state.set(agent,s);}return s;};
 ctx.tools.guard(exec=>{
  if(ctx.get?.('hiagentGlobal')?.handlesReads(exec.agent))return;
  const agent=exec.agent;if(!agent)return;
  const s=entry(agent),session=agent.session;
  for(let seq=s.seq;seq<session.seq;seq++)if(session.eventAt(seq)?.type==='step/start')s.reads=0;
  s.seq=session.seq;
  const raw=exec.arguments?.file_path;
  const file=typeof raw==='string'?path.resolve(agent.session?.header?.meta?.cwd??process.cwd(),raw):undefined;
  if(exec.name==='read'){
   if(s.reads>=limit)return `Kasumi literary: this step already admitted ${limit} text-read calls. Continue the remaining reads in a later step with offset/limit, and load only the passages this scene needs.`;
   s.reads++;
   if(file)s.read.add(file);
   return;
  }
  if(exec.name==='write'&&protect&&file&&!s.read.has(file)){
   let exists=false;
   try{const stat=fs.statSync(file);exists=stat.isFile()&&stat.size>0;}catch{}
   if(exists)return `Kasumi literary: ${raw} already exists and was not read in this session. Read it first, or write to a new file; do not overwrite an existing manuscript blindly.`;
  }
 });
}