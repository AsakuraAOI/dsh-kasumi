# Kasumi 学习模式（0.6.0）

安装本 Bundle 和 `@yunmiao/studymate` 2.0.1 后，重启 DSH，在新会话中选择 **Kasumi 学习模式**，模型使用现有 Kasumi 通道。学习工作区和侧边栏阅读端沿用 StudyMate 已有设置。

保留 StudyMate 主教练 Persona、全部学习技能、原生学习工具、任务/实验工具，以及计划、目标、委派、网页和展示工具。原版学习模式和答疑模式继续由 StudyMate 管理。

新增显式 native 工具呈现、已验证的纯文本压缩和工具输出预算。文件读取和搜索使用 Kasumi 上限，StudyMate 原生结构化结果及技能正文保持完整。课程设计及角色调度流程不改写；学习模式仍允许原有 spawn 委派，保持 fork 禁用、maxDepth=2。

针对实际会话中一次批量读取 61 份文档的膨胀，新增学习专用的读取策略组件，通过官方 scoped `tools.guard` 每步最多放行 8 次 `read`。超出调用返回明确拒绝及按需、分批继续提示，下一步自动恢复额度；不静默裁剪结果、不放宽文件权限、不影响技能加载与其他预设。可在本预设该行配置 `enabled:false` 独立关闭，或调整 `maxReadCallsPerStep`（1–64）。图片继续由原生文件工具拒绝文本读取。

适配基线取自实际安装的 StudyMate 2.0.1，保存在 `baseline/studymate-learning-2.0.1.*.yml`。技能路径根据当前 Profile 中实际安装包解析，不硬编码本机路径。未安装 StudyMate 的 Profile 不注册此预设，其余 Kasumi 预设照常工作。可选 peer 版本范围见 package.json；第三方升级后应重新检查模板和工具契约再更新适配版。

Kasumi 轻量版与均衡版继续保留已有预设的内部标识，以兼容既有会话和默认选择。历史基础预设仅作为代码与测试基线保存。

禁用本 Bundle 会移除新增预设，StudyMate 原版学习/答疑模式和官方预设保留。
