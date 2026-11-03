import { registerPluginSettings } from "../plugin-settings.js";
import z from '@deepseek-ai/schemastery';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bytes } from './budget.js';
export const name = 'hiagent-observability';
export const inject = ['llm', 'tools'];
export const Config = z.object({ enabled: z.boolean().default(true), path: z.string().default('hiagent-metrics.jsonl'), provider: z.string().default('hiagent'), providers:z.array(z.string()), queryBudgetBytes: z.number().default(900000), safetyRatio: z.number().min(0.1).max(1).default(0.75) }).i18n({zh:{enabled:'启用性能观测',path:'统计文件路径（不保存原始消息）',provider:'要观测的 Provider ID',providers:'可选：同时观测多个通道 ID',queryBudgetBytes:'Provider Query 字节预算',safetyRatio:'字节压力观测比例（仅代理值）'}});
export function measure(options) {
  const schemaBytes = bytes(JSON.stringify(options.tools ?? []));
  const totals = { systemBytes: 0, historyBytes: 0, toolResultBytes: 0, schemaBytes, toolCount: options.tools?.length ?? 0, imageBlocks: 0 };
  for (const message of options.messages) {
    const size = bytes(JSON.stringify(message));
    if (message.role === 'system' || message.role === 'developer') totals.systemBytes += size;
    else if (message.role === 'tool') totals.toolResultBytes += size;
    else totals.historyBytes += size;
    totals.imageBlocks += message.content.filter(x => x.type === 'image').length;
  }
  return { ...totals, envelopeBytes: totals.systemBytes + totals.historyBytes + totals.toolResultBytes + schemaBytes, compiledQueryBytes: null };
}
export function apply(ctx, config = {}) {
  registerPluginSettings(ctx);
  if (config.enabled === false) return;
  const file = resolve(config.path ?? 'hiagent-metrics.jsonl');
  let writes = mkdir(dirname(file), { recursive: true });
  const emit = data => { writes = writes.then(() => appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...data })+'\n', { mode: 0o600 })).catch(() => { ctx.logger.warn('hiagent-observability: metrics write failed'); }); };
  const targets=config.providers??[config.provider??'hiagent'];
  const isHiagent = agent => targets.includes(agent?.session.requestHeader()?.config.provider ?? agent?.options.provider);
  ctx.on('llm/stream', (options, next) => {
    if (!targets.includes(options.provider)) return next();
    const id = randomUUID(), start = performance.now(), sizes = measure(options);
    emit({ type: 'request/start', id, sessionId: options.sessionId, purpose: options.purpose ?? 'agent', provider: options.provider, model: options.model, ...sizes, pressureEstimate: sizes.envelopeBytes > (config.queryBudgetBytes ?? 900000)*(config.safetyRatio ?? 0.75) });
    return (async function* () {
      let usage = null, finish = 'consumer-stopped', code = null, visible = false;
      try {
        for await (const chunk of next()) {
          if (chunk.type === 'usage') usage = chunk.usage;
          if (['text-delta','tool-call-delta'].includes(chunk.type)) visible = true;
          if (chunk.type === 'finish') { finish = chunk.reason.kind; code = chunk.reason.failure?.code ?? null; }
          yield chunk;
        }
      } catch (error) { finish = options.signal?.aborted ? 'aborted' : 'thrown'; code = typeof error.code === 'string' ? error.code : null; throw error; }
      finally { const zeroFailure=['error','aborted','thrown'].includes(finish)&&usage?.inputTokens===0&&usage?.outputTokens===0;emit({ type: 'request/end', id, sessionId: options.sessionId, purpose: options.purpose ?? 'agent', durationMs: performance.now()-start, usage:zeroFailure?null:usage, usageSource:zeroFailure?'failed adapter zero placeholder; upstream usage unknown':'adapter-mapped provider usage', finish, code, partialOutput: visible }); }
    })();
  }, { global: true });
  ctx.on('tools/execute', async (exec, next) => {
    if (!isHiagent(exec.agent)) return next();
    const start = performance.now();
    try { return await next(); }
    finally { emit({ type: 'tool/timing', sessionId: exec.agent.session.id, callId: exec.callId, tool: exec.name, durationMs: performance.now()-start }); }
  }, { global: true });
  ctx.on('tools/result', (exec, result) => {
    if (!isHiagent(exec.agent)) return;
    emit({ type: 'tool/result', sessionId: exec.agent.session.id, callId: exec.callId, tool: exec.name, success: !result.isError, resultBytes: bytes(JSON.stringify(result.content)), metaBytes: result.meta === undefined ? 0 : bytes(JSON.stringify(result.meta)) });
  }, { global: true });
  ctx.on('session/event', (session, event) => {
    if (['compaction/start','compaction/end','llm/retry','turn/end','step/end'].includes(event.type)) emit({ type: event.type, sessionId: session.id, seq: event.seq, reason: event.data.reason?.kind ?? null, compactionId: event.data.compactionId, success: event.type === 'compaction/end' ? !event.data.error : undefined, retry: event.data.retry, code: event.data.failure?.code });
  });
  ctx.effect(() => async () => { await writes; });
}
