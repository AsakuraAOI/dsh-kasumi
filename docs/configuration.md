# 配置、关闭与恢复

0.6.0 起优先使用 **Kasumi 全局适配**（全局适配组件）总开关，默认适配范围以代码配置中的模型通道列表为准。它的 `.volatile()` 原生配置支持实时调整；可在插件列表禁用整个全局组件。`outputBudget`、`readBatchGuard`、`pressureCompaction`、`recoveryGuard` 可分别关闭。全局开启时，已有 Kasumi 局部输出/读取保护和自动压力压缩让出处理；关闭后恢复所选模式自身配置。详见 `global.md`。

本 Bundle 提供四种 Kasumi Preset（学习模式需 StudyMate 2.0.1）。宿主观测默认关闭，宿主恢复守卫默认 disabled，不为其他 Preset 增加行为。基础 Provider 原样连接 Anthropic Messages；不要求额外 Adapter。

## 独立开关

1. `config/shared.mjs` 的 `features` 配置控制生成的 Preset：plainTextCompaction、outputBudget、nativeOutputCaps、liteSearch、rewritePersona、projectInstructions、compaction。修改后 build 并正式重新安装。liteSearch 和 rewritePersona 实测整体收益不足，最终默认 false；其余仅在选中优化 Preset 时启用。
2. Compaction 类 `plainText:false` 直接回退到基类摘要输入，恢复原 tools 列表。完全关闭 Compaction 会关闭其 group 和 `/compact`；不会给取消的请求增加重试。
3. 输出插件 `config.enabled:false` 关闭即时预算。关闭 nativeOutputCaps 同时恢复原 fs/search 配置。官方/StudyMate 原始 Preset 保留；旧 Kasumi 基础预设已从桌面卸载，源码备份可重新安装恢复。
4. 性能观测组件位于宿主层，可在 Profile 配置编辑器开启。参数 `enabled`、`path`、`provider`、`queryBudgetBytes`、`safetyRatio`。path 应使用用户私有目录。
5. 恢复守卫组件位于宿主层。用正式配置编辑器设 `disabled:false`；`enabled:false` 可停用。请同时配置原生 模型通道的 `retryPolicy` 配置：normal / maxRetries=1 / retryableCodes=[RATE_LIMIT]。单独开启守卫不会修改任何 Provider 的 retryPolicy。

DSH Patch 覆盖整份 `config`，嵌套 Preset 也一样。不要只写一个子字段就覆盖完整的 Preset 声明；修改共享源码重新生成，或在正式配置编辑器编辑该行。

学习模式的读取策略组件 使用 scoped `tools.guard` 限制每步的文本读取调用（默认 8 次，`maxReadCallsPerStep` 可调 1–64），`enabled:false` 独立关闭。超出调用明确拒绝并提示下一步分批继续；不裁剪已有历史、不影响技能和其他模式。详见 `learning.md`。

## 即时预算

`budgets` 对象按 UTF-8 字节配置 search/read/directory/shell/test/diff，最低 1024。判断来自工具名和 Shell 命令类型，只用于输出类别，不用它判断 Compaction。

如果下游策略 block 或替换了结构化 value，预算监听器原样转交。只处理已知工具的纯文本呈现，未识别工具或非文本内容原样保留。退出码和 stderr 原生渲染标记、错误/断言/堆栈邻域优先保留；诊断太多时依然明确通知缩减并提供完整回读。

`read` 原生 byte cap 负责分页。搜索的 globMaxResults=80、grepMaxMatches=80、grepMaxLineBytes=512、searchMetaMaxBytes=8192 避免 Meta 成为未受限的重复内容。超过匹配条数时沿用原生完整搜索结果文件与缩小查询指导。

## Compaction 与失败预算

采用原生 `thresholdRatio`、`headroomTokens`、`retainRatio`/`retainTokens`、`maxTokens`、`modelPolicies` 与 `maxOverflowRetries`。没有偷偷删除用户历史，没有在 `agent/request` 或 `llm/stream` 重写冻结的请求。

失败预算以替换 generation 与被压缩前缀的首个消息 ID 为键，缓存只存哈希/计数。追加工具结果不会重新启动对同一失败前缀的昂贵生成。成功压缩会清除预算；会话释放也会释放缓存。临时失败没有额外即时 retry；最多下一次原生压缩再试一次。取消不消耗失败预算。

管理员确认已修复根因后，可以通过已挂载 Compaction 服务的 `resetSummaryFailures(agent)` 明确清除预算；这不是模型工具，也不自动调用。新会话，或重启 DSH 后恢复会话，会重建临时缓存。现有 Agent 保留旧 Preset revision，单纯重装 Bundle 不保证清除旧实例缓存。Session 日志仍是历史内容和成功替换的唯一事实来源。

## Context Window 候选

原生阈值：`floor(min(contextWindow * thresholdRatio, contextWindow - reservedOutput - headroomTokens))`。保留尾部按 `(contextWindow - reservedOutput) * retainRatio`。128K、96K 或 160K 都是候选管理配置，不能当成所有 Kasumi 后端的已验证容量。

初始 A/B 对普通请求统一保留 8192 输出预算，用 16384 headroom 和 0.75 比例计算候选。最终配置恢复基准的 65536 headroom，不同时缩小容量与安全预留：96K 阈值 22272；128K 阈值 54272；160K 阈值 86272。桌面原 Profile 的 224000 容量及默认 32768 输出预留给出 125696 阈值。字节压力观测阈值默认是 900000 * 0.75，但这是 DSH envelope 的代理告警，不能证明 Provider Query 未超限，也不会静默裁剪。

128K 长历史失败的具体原因是 pi-ai 把约 132K 输入的摘要成功响应映射为 CONTEXT_WINDOW_EXCEEDED。应提前使用原生压缩，或选已验证的更宽容量；不能把这个错误误判为网络 timeout 或重新解析文本工具协议。
