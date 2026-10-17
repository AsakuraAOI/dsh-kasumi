# M0 环境与接口证据

调查日期：2026-10-10，Asia/Shanghai。安装版本：DSH Desktop / Harness 0.2.1-rc.1（2026-10-17 复核；0.2.0-rc.2 为初次调查版本）。原生包来自本机安装 `resources/app.asar`；只读提取到工作区用于调查和测试，没有修改安装归档。官方源码 checkout：deepseek-ai/deepseek-harness，HEAD `d743267388641bc76f17c45ce8b4c231aed1d32c`。以已安装 lib 行为为准，源码用于交叉核对。

## 实际 Profile

`~/.dsh/profiles/desktop`：base、web-app、experimental-agent-team-profile、experimental-auto-review、experimental-schedule-bundle、experimental-voice-input-bundle、`@local/dsh-kasumi-presets`。默认模型为 deepseek-v4.1-flash；pi-ai 使用 anthropic-messages，baseURL `https://api.asakuraaoi.cn/anthropic`，apiKeyEnv 仅引用 当前模型通道的凭据引用。四个模型的 contextWindow 均为 224000，但并无证据支持把它当成所有模型的安全窗口。

基准没有载入实验性 Bundle，没有删除或禁用桌面那些 Bundle。保留旧基础预设目录与新的 `baseline` 备份。开发 Profile 用官方 initializeProfileFromDefault 创建，安装用正式 pluginManager.installBundle；状态 restart-required 后重新启动进程再核对工具表。

## 扩展 API

- Bundle：package.json 的 `dsh.bundle.patch` 加 YAML patch。Preset：`@deepseek-ai/dsh-agent-preset` 注册声明，revision 由 Registry 持有，现有会话保留旧 revision。普通 Cordis 插件使用 apply/inject/Config 或默认 Service 类。
- `llm/stream(options,next)` 只提供 continuation，不允许替换 next 的请求参数；循环的请求由 durable header/surface 派生并冻结。适合观测/包装 stream，不适合普通请求裁剪。`agent/request` 返回请求配置，并不能修改 messages。
- Compaction Basic 明确规定 summarize 是唯一子类自定义钩子；输入含 system、历史 message 与 header 的 tools，基础实现加 `purpose:'compaction'`。本插件在此正式阶段控制工具定义，没有猜 Prompt 关键词。
- `tools/post-execute(exec,result,next)` 返回 accept/content 或 block/feedback，不能同时替换 content 和 value。Tools 最终验证及提交此结果，然后发 tools/result。result.value 不变；日志重建使用已提交的 content。
- 原生 readMaxBytes、搜索项数/行宽/Meta cap、spillStore 以及 shell 输出保留已有正式能力。原生 spill-policy 是统一 token cap，read 特例跳过；本插件补充按工具分类字节 cap 和诊断邻域。
- Basic Compaction 在 agent/pre-step 对已持久化内容检测 token 压力，先让历史 pruner 尝试减少内容，再摘要；确认 CONTEXT_WINDOW_EXCEEDED 后最多按配置做一次压缩后恢复。不会拆开调用与结果配对。
- tool-result-pruner 处理历史大结果，thresholdChars=8192、headChars=4096、tailChars=1024；原 Balanced 已配置。它不是即时输出上限。
- pi-ai 注册 LlmAdapter、解析 Provider 配置和精确模型容量；默认输出 cap 是 32768。原生 dsh-llm-retry 依据 Provider 注册时的 retryPolicy，默认 normal 最多五次，codes 含 EMPTY_RESPONSE、RATE_LIMIT、SERVER、TIMEOUT、TRANSPORT。本项目候选隔离配置只允许 RATE_LIMIT 一次。
- pi-ai 会把部分错误文本规范化为 failure code，也会依据 usage/contextWindow 判断溢出。没有完整暴露 Provider 的结构化内部恢复原因或真实 queryBytes，不尝试猜测这些值。

## 源码定位

官方仓库 [链接](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c)。重点路径：

- packages/compaction/compaction-basic/src/index.ts、summarizer.ts、region.ts
- packages/llm/llm/src/index.ts、types.ts、retry-policy.ts
- packages/llm/llm-pi-ai/src/；packages/llm/llm-retry/src/
- packages/core/tools/src/index.ts
- packages/spill/spill-policy/src/；packages/spill/spill-local/src/
- packages/fs/tool-fs/src/；packages/fs/tool-fs-search/src/
- packages/preset/agent-preset/ 与 agent-preset-registry/
- packages/bundle/base/cordis.patch.yml；packages/bundle/web-app/cordis.patch.yml

Provider 只读调查确认 Query 是平台的单文本请求，工具协议与有限恢复已有实现，runtime metrics 含 queryBytes。没有修改 Provider；该 metric 未由当前 DSH pi-ai stream 暴露，所以报告不把旧 Provider 记忆或离线编译估算当成当前测量。

## 工具组合结论

实际完整 Schema 已保存到 reports/tool-inventory.json。Windows Lite：pwsh、str_replace_editor。初始优化 Lite 增加 glob/grep、项目指令与原生轻量压缩；最终默认关闭新增搜索，只保留两项原工具、指令加载、即时预算和轻量压缩。Balanced 两版保持 read/read_image/write/edit、glob/grep、pwsh、job_list/job_output/job_kill、todo_write、ask_user_question、web_search/web_fetch 共 14 个工具。原 Persona 保留，短 Persona 候选默认关闭。

原生 Shell 一次可批量只读检查、构建与相关验证，grep 支持行号和范围；这些能力已覆盖 inspect_project/search_context/verify_changes 的主要收益。因此未另写复合工具，更没有合并高风险写操作。实测普通任务若无稳定收益，候选保留可选，不升级桌面默认。
