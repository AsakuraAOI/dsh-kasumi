// Uses only the public CompactionEngine entry. Native durable transactions own
// source selection, tool pairs, checkpoints and cancellation.
export function installPressurePolicy(ctx,policy){
 ctx.on('agent/pre-step',async({agent,signal},next)=>{
  const before=agent.session.seq;
  if(policy.handles('pressureCompaction',agent)&&!signal.aborted){
   try{const result=await policy.engine.compactIfNeeded(agent,'pressure',signal);if(result!==null)policy.pressureOwners.add(agent);}
   catch(error){
    for(let seq=before;seq<agent.session.seq;seq++)if(agent.session.eventAt(seq)?.type==='compaction/start')policy.pressureOwners.add(agent);
    if(!signal.aborted)ctx.logger.warn(`Kasumi compaction: ${error.message}; preserving the turn`);
   }
  }
  try{return await next();}finally{policy.pressureOwners.delete(agent);}
 },{global:true,prepend:true});
}
