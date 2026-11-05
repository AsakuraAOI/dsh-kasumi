# Kasumi

为 DeepSeek Harness 的长任务增加纯文本压缩、工具输出预算和恢复保护。启用后，现有模式也能使用这些能力，无需重新组织角色、技能和工具。

适配 DSH **0.2.1-rc.1 / rc.2 / rc.3 / rc.4 / rc.5 及 0.2.2-rc.1**。当前版本 **0.8.5**。

## 安装后怎么用

```sh
dsh plugin --profile desktop add 'github:AsakuraAOI/dsh-kasumi'
```

按插件管理器提示重启，在 **插件 → Kasumi 适配 → 组件** 中开启「Kasumi 全局适配」。在组件配置的 `providers` 中核对需要适配的模型通道；该列表按实际 Provider ID 精确匹配。

继续使用原来的学习、创造或其他模式即可。插件也保留五个专用入口：

| 模式 | 适合的工作 |
|---|---|
| Kasumi 轻量版 | 终端与精确编辑，保持较少的工具 |
| Kasumi 均衡版 | 文件、搜索、终端、后台任务和网页工作 |
| Kasumi 创造模式 | 开发插件、编辑组合、检查运行时和展示内容 |
| Kasumi 学习模式 | 配合 StudyMate 使用其教学、课程和任务工具 |
| Kasumi 文学模式 | 小说、散文、诗歌与剧本的构思、起草和修订 |

学习入口需要另行安装 `@yunmiao/studymate`。文学模式不提供命令执行与代码工具，只保留文件读写、检索、待办、提问和网页工具，适合纯粹的创作与改稿。现有会话保留创建时的预设版本，更新预设后请创建新会话。

## 长任务里的变化

- **压缩历史**：以无工具的纯文本摘要降低上下文压力，继续使用 DSH 的日志、检查点和调用配对机制。
- **控制工具输出**：较大的文本结果提供缩减预览和完整格式化输出的回读路径，保留结构化值、图片、执行状态与技能正文。
- **分批读取**：默认每步最多 8 次文本读取，超出后明确提示下一步继续。
- **保护恢复边界**：取消或已经产生部分可见输出时阻止重复执行。

这些能力不会替换当前模式的 Persona、技能、工具权限或默认模型。原生工具已经省略的内容无法由本插件恢复。

## 调整与关闭

| 选项 | 用途 |
|---|---|
| `enabled` | 全局适配总开关 |
| `providers` | 需要适配的模型通道列表 |
| `outputBudget` / `genericOutputs` | 工具文本输出预算 |
| `readBatchGuard` / `maxReadCallsPerStep` | 每步读取次数 |
| `pressureCompaction` | 自动压力压缩 |
| `recoveryGuard` | 取消及部分输出后的恢复保护 |

组件配置支持实时调整。关闭全局层后，所选模式继续使用自身已有的设置。可选的精确请求预算通道需要单独准备和安装，不随总开关启用。

在 Kasumi 插件详情页的配置区，找到「Kasumi 重试与续写」即可调整重试次数、退避、额外错误码、Provider/Model 覆盖规则和有限自动续写。配置页由 Kasumi 自行注册，保存通过 DSH 配置编辑器应用，无需独立设置插件。重试覆盖和自动续写分别默认关闭，详情见 [重试与续写](docs/retry.md)。

[全局适配](docs/global.md) · [详细配置](docs/configuration.md) · [创造模式](docs/creator.md) · [学习模式](docs/learning.md) · [文学模式](docs/literary.md) · [请求预算通道](docs/query-budget.md)

## 开发

```sh
npm install
npm run build
npm test
```

预设由 `baseline/` 和 `config/shared.mjs` 生成；运行时代码在 `src/`。完整集成测试需要同版本 DSH 和隔离开发 Profile，初始化脚本见 `scripts/`。普通安装使用仓库中已经生成的 YAML 与 JavaScript。

凭据由 DSH 管理，不随插件分发。观测功能默认关闭，完整工具输出应保存在当前用户的私有目录。

第三方来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 独立视觉与业务工具上下文

工具生成或读取的图片默认通过独立视觉请求识别，每次最多 4 张，主会话只接收文字证据；可沿用会话模型或单独指定视觉模型。用户直接上传图片保持原处理方式。WebSearch 与侧边浏览器常驻；Bilibili、SeeIt、Todo、KasumiFlow 和 Practice 的工具按明确相关需求进入当前会话，后台服务及插件页照常工作。详见 [配置与使用](docs/vision-and-tools.md)。
