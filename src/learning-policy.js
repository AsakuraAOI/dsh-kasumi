import z from '@deepseek-ai/schemastery';
export const name='hiagent-learning-policy';
export const inject=['tools'];
export const Config=z.object({enabled:z.boolean().default(true),maxReadCallsPerStep:z.number().step(1).min(1).max(64).default(8)}).i18n({zh:{enabled:'启用学习模式读取保护',maxReadCallsPerStep:'每步最多执行的文本读取次数'}});
export function apply(ctx,config={}){
 if(config.enabled===false)return;
 const limit=config.maxReadCallsPerStep??8,state=new WeakMap();
 ctx.tools.guard(exec=>{
  if(ctx.get?.('hiagentGlobal')?.handlesReads(exec.agent))return;
  if(exec.name!=='read')return;
  const agent=exec.agent;if(!agent)return;
  let current=state.get(agent);if(!current){current={seq:0,reads:0};state.set(agent,current);}
  const session=agent.session;
  for(let seq=current.seq;seq<session.seq;seq++)if(session.eventAt(seq)?.type==='step/start')current.reads=0;
  current.seq=session.seq;
  if(current.reads>=limit)return `Kasumi learning: this step already admitted ${limit} text-read calls. Continue the remaining relevant reads in a later step with offset/limit. Load only the current role's skill and required references; do not bulk-read the plugin docs. Use read_image for images.`;
  current.reads++;
 });
}
