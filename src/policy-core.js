// Shared Provider selection and feature ownership. Modules never infer targets
// from model names or edit a request envelope.
export function createPolicy(ctx,config){
 const current=()=>typeof config.get==='function'?config.get():config;
 const targets=()=>current().providers??['hiagent'];
 const matches=agent=>!!agent?.session&&targets().includes(agent.session.requestHeader()?.config.provider??agent.options?.provider);
 const enabled=()=>current().enabled!==false;
 const handles=(feature,agent)=>enabled()&&current()[feature]!==false&&matches(agent);
 const pressureOwners=new WeakSet();
 return {current,targets,matches,enabled,handles,pressureOwners,engine:ctx.compaction,
  handlesOutput:agent=>handles('outputBudget',agent),handlesReads:agent=>handles('readBatchGuard',agent),
  handlesHistory:agent=>handles('historyRecall',agent),
  handlesCompaction:agent=>handles('pressureCompaction',agent)&&pressureOwners.has(agent)};
}
