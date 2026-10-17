export const name='hiagent-dev-preset-mount';
export const inject=['agentPresets'];
export function apply(ctx) {
 ctx.on('agent/created',async({agent})=>{
  if(ctx.agentPresets.composedPreset(agent.ctx)!==undefined)return;
  await ctx.agentPresets.mount(agent.ctx,ctx.agentPresets.defaultId);
 },{global:true});
}
