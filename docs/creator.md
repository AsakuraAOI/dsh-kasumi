# Kasumi 创造模式

安装 0.6.0 后，重启 DeepSeek Harness，在新会话中选择 **Kasumi 创造模式**，模型选择现有 Kasumi 通道。现有会话继续使用创建时的预设版本。

可开发并安装 DSH Cordis Bundle、编辑预设/组合、配置 MCP、创建展示内容。提供官方 `cordis_inspect_list` / `cordis_inspect_query`、`skill`、`present`、Plugin Manager，以及文件、搜索、终端、后台任务、目标、计划和委派工具。官方技能按原路径加载，包含插件开发、组合编辑和组合参考。

基于随安装版 0.2.1-rc.1 发布的官方创造组合，原始快照保存在 `baseline/creator-0.2.1-rc.1.patch.yml`。0.2.1-rc.1 的官方组合新增 `time-context`、`tool-schedule` 与 `tool-plugin-market`，并移除了旧版的 `tool-subagent-codex`、`tool-subagent-claude-code` 与 `tool-ralph`；适配层原样保留这些行，只追加 native 呈现与 Kasumi 预算，不重写权限、Persona 与计划审批规则。新增显式 native 呈现，避免继承 PTC 展示；使用已验证的 Kasumi 纯文本摘要和即时输出预算。技能、检查和安装工具结果不会被通用文件/终端预算截断。

压缩、输出预算、读取/搜索上限、项目指令沿用 `config/shared.mjs` 的开关。官方工具结果历史裁剪参数保持原样。Provider 和上游参数不变；此模式工具更多，不承诺比轻量版更快。需要最少工具时仍选轻量版。

可选 Query 预算 Profile 的生成脚本也包含此模式，并将摘要路由到独立摘要通道。该通道仍需按 `query-budget.md` 独立安装；普通桌面安装不会自动开启它。

禁用或移除 `@local/dsh-kasumi` 后，本模式从新会话列表移除，官方创造模式和原 Kasumi 基础预设保留。Creator 专用测试和验证结果见 `reports/creator-04.json`。
