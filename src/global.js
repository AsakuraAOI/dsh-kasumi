import z from '@deepseek-ai/schemastery';
import {budgetResult} from './output-budget.js';
import {createPolicy} from './policy-core.js';
import {installExecutionBudget} from './execution-budget.js';
import {installPressurePolicy} from './pressure-policy.js';
import {installRecoveryGuard} from './recovery.js';
import {installHistory} from './history.js';
export const name='hiagent-global';
export const inject=['tools','spillStore','compaction','systemPrompt'];
export const Config=z.object({
 enabled:z.boolean().default(true),providers:z.array(z.string()).default(['hiagent']),
 outputBudget:z.boolean().default(true),genericOutputs:z.boolean().default(true),
 readBatchGuard:z.boolean().default(true),maxReadCallsPerStep:z.number().step(1).min(1).max(64).default(8),
 pressureCompaction:z.boolean().default(true),recoveryGuard:z.boolean().default(true),
 readBytes:z.number().step(1).min(1024).default(12288),searchBytes:z.number().step(1).min(1024).default(6144),shellBytes:z.number().step(1).min(1024).default(8192),otherBytes:z.number().step(1).min(1024).default(16384),
 historyRecall:z.boolean().default(true),archiveToolOutput:z.boolean().default(true),historyCallsPerStep:z.number().step(1).min(1).max(20).default(6),
 historyArtifactMaxBytes:z.number().step(1).min(16384).max(8388608).default(2097152),historyArchiveQuotaBytes:z.number().step(1).min(2097152).default(67108864),
 incrementalCompression:z.boolean().default(true),minIncrementTokens:z.number().step(1).min(1024).default(8192),taskStateGuidance:z.boolean().default(true),
}).i18n({zh:{enabled:'全局适配总开关',providers:'匹配的 Provider ID（精确匹配）',outputBudget:'工具输出预算',genericOutputs:'同时限制其他工具的纯文本呈现（技能除外）',readBatchGuard:'每步读取批次保护',maxReadCallsPerStep:'每步最多放行的文本读取调用',pressureCompaction:'自动纯文本压缩',recoveryGuard:'取消/部分输出后禁止重放',readBytes:'文件读取呈现预算（UTF-8 字节）',searchBytes:'搜索呈现预算（字节）',shellBytes:'终端呈现预算（字节）',otherBytes:'其他工具纯文本预算（字节）',historyRecall:'历史检索与分页回读',archiveToolOutput:'持久保存大段工具文本',historyCallsPerStep:'每步历史工具调用上限',historyArtifactMaxBytes:'单份原文归档上限（字节）',historyArchiveQuotaBytes:'每会话原文归档配额（字节）',incrementalCompression:'优先压缩新积累的完整区间',minIncrementTokens:'增量压缩最小估算 tokens',taskStateGuidance:'摘要保留当前任务状态与精确事实'}}).volatile();
export function apply(ctx,config={}){
 const policy=createPolicy(ctx,config);ctx.provide('hiagentGlobal',policy);
 installHistory(ctx,policy);
 ctx.on('tools/post-execute',(exec,result,next)=>{const cfg=policy.current();return policy.handlesOutput(exec.agent)?budgetResult(ctx,{includeRead:true,genericOutputs:cfg.genericOutputs!==false,otherBytes:cfg.otherBytes??16384,budgets:{read:cfg.readBytes??12288,search:cfg.searchBytes??6144,directory:cfg.searchBytes??6144,shell:cfg.shellBytes??8192}},exec,result,next):next();},{global:true,prepend:true});
 installExecutionBudget(ctx,policy);installPressurePolicy(ctx,policy);
 installRecoveryGuard(ctx,provider=>policy.enabled()&&policy.current().recoveryGuard!==false&&policy.targets().includes(provider));
}
