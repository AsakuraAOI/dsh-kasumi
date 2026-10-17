import z from '@deepseek-ai/schemastery';
import { bytes, category, DEFAULT_BUDGETS, preview } from './budget.js';
export const name = 'hiagent-output-budget';
export const inject = ['tools', 'spillStore'];
export const Config = z.object({ enabled: z.boolean().default(true), budgets: z.object(Object.fromEntries(Object.entries(DEFAULT_BUDGETS).map(([key,value]) => [key,z.number().step(1).min(1024).default(value)]))) }).i18n({zh:{enabled:'启用即时输出预算',budgets:{$description:'按工具类别限制呈现文本的 UTF-8 字节数',$value:{search:'文件搜索预算',read:'文件读取预算（原生分页优先）',directory:'目录列表预算',shell:'终端输出预算',test:'测试与构建日志预算',diff:'Git Diff 预算'}}}});
export function apply(ctx, config = {}) {
  if (config.enabled === false) return;
  ctx.on('tools/post-execute', async (exec,result,next)=>{
    if(ctx.get?.('hiagentGlobal')?.handlesOutput(exec.agent))return next();
    return budgetResult(ctx,config,exec,result,next);
  },{prepend:true});
}
// Shared public-pipeline handler. Global mode can budget read and unfamiliar
// text tools as well; scoped presets retain their tested native pagination.
export async function budgetResult(ctx,config,exec,result,next){
  const budgets = { ...DEFAULT_BUDGETS, ...config.budgets };
    const decision = await next();
    if(exec.name==='skill')return decision;
    const kind = category(exec.name, exec.arguments)??(config.genericOutputs?'other':undefined);
    // read is already byte-bounded and paginated by its native plugin.
    if (!kind || (exec.name === 'read'&&!config.includeRead) || decision.kind !== 'accept' || Object.hasOwn(decision, 'value')) return decision;
    const content = decision.content ?? result.content;
    if (!content.every(block => block.type === 'text')) return decision;
    const text = content.map(block => block.text).join('\n');
    const cap = kind==='other'?(config.otherBytes??16384):budgets[kind];
    if (bytes(text) <= cap) return decision;
    const owner = exec.agent?.session.id;
    if (!owner) return decision;
    try {
      const ref = await ctx.spillStore.saveText({ owner: { sessionId: owner }, source: { kind: 'tool', toolName: exec.name, callId: exec.callId, label: 'hiagent-budget' }, suggestedName: `${exec.name}.txt`, content: text });
      const hasRead = ctx.tools?.schemas(exec.agent).some(tool => tool.name === 'read');
      const hint = hasRead ? ref.retrievalHint : config.includeRead?'Use the current preset\'s file-view or shell tool to read this file in bounded ranges; for PTC use its SDK.':'Use str_replace_editor view with view_range, or the shell with a bounded line range, to read this file.';
      const notice = `[hiagent-output-budget: reduced preview; original ${bytes(text)} UTF-8 bytes; full formatted output: ${ref.locator}. ${hint}]`;
      const retained = preview(text, cap, notice);
      return retained === undefined ? decision : { ...decision, content: [{ type: 'text', text: retained }] };
    } catch {
      // Never turn successful execution into failure or invent a recovery path.
      ctx.logger.warn('hiagent-output-budget: spill unavailable; preserving the accepted result');
      return decision;
    }
}
