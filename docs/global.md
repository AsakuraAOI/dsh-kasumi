# Kasumi 全局适配（0.6.0）

在侧边栏 **插件（Plugins）→ Kasumi 适配 → 组件** 中找到 **Kasumi 全局适配**，启用或禁用即可控制全局层。这里是可管理的 Plugins 页面，设置页的“插件列表”仅供查看。默认启用，适配范围由 `providers` 中的实际模型通道 ID 决定；原版学习、官方创造、Standard、Minimal、PTC 和后续第三方预设都可以使用同一套全局策略，无需复制新模式或追加插件行。

全局组件的 Config 有中文说明，`enabled` 是总开关。整个配置通过官方 `.volatile()` / Settings API 暴露为实时设置，修改后对已有会话后续调用生效并持久化。若直接禁用插件行，DSH 插件管理器会说明该次是否需要重启。第一次安装后按其结果重启 DSH。

## 设置

- `providers`：精确匹配实际已提交请求的 Provider ID，默认值见组合配置。其他通道可显式加入；不会根据模型名称猜测，也不改选中的 Provider。
- `outputBudget`：限制工具最终纯文本呈现并保留完整格式化输出的真实落盘路径。默认读取 12 KiB、搜索/目录 6 KiB、终端 8 KiB、测试 12 KiB、Diff 16 KiB。`genericOutputs` 默认开启，其他工具纯文本默认 16 KiB。技能正文、图片和结构化 value 保持不变；只改变模型所见的文本呈现。
- `readBatchGuard` / `maxReadCallsPerStep`：默认每步最多放行 8 次 `read`，超出明确拒绝并提示下一步按需分批读取；新步重置。通过 PTC SDK 发起的原生 read 也走同一工具管线。
- `pressureCompaction`：通过独立隔离的 Kasumi 压缩服务在步间进行自动纯文本摘要，继续使用官方配对、Checkpoint、Session 和 Replay。独立全局压缩后端的参数可在配置编辑器调整，默认输出 8192 tokens、headroom 65536、thresholdRatio 0.75。
- `recoveryGuard`：取消或出现部分可见输出后禁止重放，不增加机械重试，也不改变 Provider 原有 retryPolicy。

关闭全局层会恢复所选模式**自身已有的设置**。现有 Kasumi 专用预设本身的原生读取参数、压缩和其他局部功能仍保留；全局开启且命中 Provider 时，局部输出预算/学习读取保护让出处理，防止重复预算与重复落盘。专用预设现在属于兼容入口，全局适配不依赖它们。

## 保留的边界

不更改 Persona、工具列表、技能、工作区、课程数据、权限或用户默认模型。其他 Provider 不受全局策略影响；Provider 切换后以框架记录的实际路由判断。不会从普通 `llm/stream` Hook 改写冻结请求，不修改 Provider。

自动压缩使用全局后端，`/compact` 仍调用所选模式自身的后端；自定义模式若有更早的压缩策略，仍保留它的行为。原版 PTC 的运行时和 SDK 保留。预算保存的是原生工具已经格式化的文本，不能恢复原生执行器已省略的字节；模型可根据路径与原工具分页规则继续读取。

精确 900 KB Query 预检仍是另一个显式安装的可选通道，需要已核验 Provider 指纹；全局开关不自动启用它，也不把 envelope bytes 当 Query bytes。

## 验证

测试覆盖无任何 Kasumi 组件的第三方模式、非 Kasumi Provider、Provider 切换、全局关闭、同一 Agent 的实时开关、局部/全局去重、结构化值和完整落盘文本、无局部后端的纯文本压缩与 Replay。原版 StudyMate `learning` 的真实工具批次回放及真实 Kasumi 开场验收见 `reports/global-learning-*-06.json`。
