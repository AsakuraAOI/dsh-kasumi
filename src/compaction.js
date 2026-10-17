import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import z from '@deepseek-ai/schemastery';
import { createHash } from 'node:crypto';

// summarize customizes the official summary hook; the public pressure entry
// coordinates our local/global owners. The base class owns pairing, durable
// replacements, cancellation, overflow recovery and checkpoints.
export default class KasumiCompaction extends BasicCompactionEngine {
  static Config = z.object({ ...BasicCompactionEngine.Config.dict,
    plainText: z.boolean().default(true),
    maxSummaryAttemptsPerSurface: z.number().step(1).min(1).default(2),
  }).i18n({zh:{plainText:'纯文本摘要：不携带工具定义',maxSummaryAttemptsPerSurface:'同一压缩前缀的最大失败摘要次数',thresholdRatio:'原生压缩阈值比例',headroomTokens:'压缩安全预留 tokens',retainRatio:'保留最近历史的比例',retainTokens:'保留最近历史的 tokens（与比例互斥）',maxTokens:'摘要输出上限',compactionRetries:'压缩后仍超阈值时的追加次数',maxOverflowRetries:'上下文超限后的压缩恢复上限',auto:'启用自动压缩'}});
  constructor(ctx, config = {}) {
    const { plainText = true, maxSummaryAttemptsPerSurface = 2, ...base } = config;
    super(ctx, base);
    this.plainText = plainText;
    this.maxSummaryAttempts = maxSummaryAttemptsPerSurface;
    this.failures = new WeakMap();
    this.policyContext = ctx;
  }
  // CompactionEngine's public pressure entry remains available to the preset,
  // but our scoped implementation yields to the global owner when enabled.
  // Manual compaction and provider-confirmed overflow still use the preset.
  async compactIfNeeded(agent,trigger,signal){
    const global=this.policyContext.get?.('hiagentGlobal');
    if(trigger==='pressure'&&this.config.auto!==false&&global?.handlesCompaction(agent))return null;
    return super.compactIfNeeded(agent,trigger,signal);
  }
  async summarize(input, agent, signal) {
    // Appending another tool result must not restart an expensive failure loop
    // against the same uncompressed prefix. A committed replacement changes it.
    const anchor = input.messages.find(message => message.role !== 'system')?.id ?? input.messages[0]?.id ?? null;
    const key = createHash('sha256').update(JSON.stringify([agent.session.surface.replaceGeneration, anchor])).digest('hex');
    const previous = this.failures.get(agent.session);
    if (previous?.key === key && previous.count >= this.maxSummaryAttempts) {
      throw new Error('hiagent-compaction: summary failure budget exhausted for this unchanged surface');
    }
    try {
      signal?.throwIfAborted();
      const summary = await super.summarize(this.plainText ? { ...input, tools: [] } : input, agent, signal);
      this.failures.delete(agent.session);
      return summary;
    } catch (error) {
      if (!signal?.aborted) this.failures.set(agent.session, { key, count: previous?.key === key ? previous.count + 1 : 1 });
      throw error;
    }
  }
  resetSummaryFailures(agent) { this.failures.delete(agent.session); }
}
