import z from '@deepseek-ai/schemastery';
import {assistantStreamHasVisibleContent} from '@deepseek-ai/dsh-llm';
export const name='hiagent-recovery';
export const Config=z.object({enabled:z.boolean().default(true),provider:z.string().default('hiagent')}).i18n({zh:{enabled:'启用有限恢复守卫',provider:'受保护的 Provider ID'}});
// The native retry plugin executes the configured provider policy. This guard
// only refuses replay after visible partial output and on user cancellation.
export function apply(ctx,config={}) {
 if(config.enabled===false)return;
 return installRecoveryGuard(ctx,provider=>provider===(config.provider??'hiagent'));
}
export function installRecoveryGuard(ctx,enabledFor){
 ctx.on('agent/request-error',async({agent,provider,turn,step,signal},next)=>{
  if(!enabledFor(provider,agent))return next();
  if(signal.aborted)return undefined;
  for(let i=agent.session.seq-1;i>=0;i--) {
   const event=agent.session.eventAt(i);
   if(event.type==='assistant/attempt'&&event.data.turn===turn&&event.data.step===step) {
    if(assistantStreamHasVisibleContent(event.data.stream))return undefined;
    break;
   }
   if(event.type==='step/start')break;
  }
  return next();
 },{prepend:true,global:true});
}
