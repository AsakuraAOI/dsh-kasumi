# 重试与续写

在「插件 → Kasumi 适配」的配置区找到「Kasumi 重试与续写」；也可点组件列表中的同名配置入口。页面由 Kasumi 自行注册，保存通过 DSH 配置编辑器应用；所有字段支持实时修改。无需本地插件设置或独立重试插件。

重试覆盖 `enabled` 与自动续写 `autoContinue` 分别默认关闭。组件始终可加载，关闭开关时沿用 Provider 原有策略。`providers` 默认只匹配 `hiagent`，空数组匹配全部 Provider。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| enabled | false | 覆盖 Provider 重试策略 |
| maxRetries | 2 | normal 模式的重试上限，0 禁止该策略重试 |
| initialDelayMs / maxDelayMs | 500 / 10000 | 原生指数退避的初始等待与上限 |
| jitterRatio | 0.1 | 退避抖动比例，0 到 1 |
| retryableCodes | INVALID_REQUEST、PI_AI_ERROR | 与 Provider 的错误码合并去重；允许自定义码 |
| overrides | [] | 按顺序首条 Provider/Model 通配匹配，支持 `*`；数字 -1 继承全局 |
| autoContinue | false | 输出上限截断后补发有限续写 |
| maxContinuations | 2 | 连续续写上限，0 禁止续写 |
| continuationPrompt | 空 | 自定义提示词，空白使用内置文案 |
| continueOnError | false | autoContinue 开启时，瞬时错误耗尽原生恢复后也允许续写 |
| diagnostics | true | 保留统计、最近 50 次决策和最多 256 KiB 诊断日志 |

重试由官方引擎执行，继续使用其持久日志、计数与可取消退避，以及 Retry-After 处理。本组件不添加第二套重试循环，也不改变 Provider 的 normal/always 模式。已取消或已经产生部分可见输出的请求不会重放。配置中的确定性错误码只表示用户明确允许重试；鉴权等根因仍需修复。

续写消息使用 `plugin:kasumi-retry` 来源，等待 Agent 空闲后重新核对开关、上限、会话状态和待处理消息。用户新发言、新回合、会话释放或插件卸载使过期续写失效。正常结束重置连续计数；只监听新事件，恢复旧历史不会自动续写。瞬时错误续写与原请求重试是不同操作；有工具副作用的任务应谨慎开启。

日志保存到 DSH 数据目录的 `logs/kasumi/retry.jsonl`，不记录提示词、回复或密钥。Host 服务 `kasumiRetry.snapshot()` 可读统计；桌面连接提供只读 `/api/plugins/kasumi/retry/stats` 与 `/api/plugins/kasumi/retry/log`。统计中的 retries 只计算原生恢复链实际返回 retry 的次数。

从独立重试设置插件迁移时，将其配置字段移入本组件，并保留原来的开关状态，再通过 Plugin Manager 移除旧包。不要同时开启两份重试策略覆盖。
