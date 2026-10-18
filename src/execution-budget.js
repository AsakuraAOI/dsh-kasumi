export function installExecutionBudget(ctx,policy){
 const state=new WeakMap();
 ctx.tools.guard(exec=>{
  if(exec.name!=='read'||!policy.handlesReads(exec.agent))return;
  const agent=exec.agent,session=agent.session;let cursor=state.get(agent);
  if(!cursor){cursor={seq:0,reads:0};state.set(agent,cursor);}
  for(let seq=cursor.seq;seq<session.seq;seq++)if(session.eventAt(seq)?.type==='step/start')cursor.reads=0;
  cursor.seq=session.seq;const limit=policy.current().maxReadCallsPerStep??8;
  if(cursor.reads>=limit)return `Kasumi: this step already admitted ${limit} text-read calls. Continue remaining relevant reads in a later step with offset/limit. Use kasumi_history_search for earlier evidence instead of re-reading everything.`;
  cursor.reads++;
 });
}
