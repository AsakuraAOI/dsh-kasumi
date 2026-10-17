# 精确 Query 预算通道

这是一个独立、可选的 DSH Bundle + pi-ai Provider 配置通道，未修改 Provider 或 DSH 核心，未替换 LLM Adapter。桌面原 Provider 通道不变。

## 怎样得到真实字节

DSH 的 JSON envelopeBytes 不等于 Provider Query。现有远端只在 usage.jsonl 中记录 queryBytes，没有客户端预检接口。本项目通过只读 SSH 核验服务器构建与公开配置，并使用其只读快照：42 个构建文件及依赖锁文件哈希逐一核对。预检调用现有 `decodeMessagesRequest` 与 `runInference`，在 Provider 本身的 context-budget 诊断扩展点结束，尚未创建上游会话，也没有任何网络 Client 调用。

编译器、提示词模板、工具协议解析器没有复制改写。工作中的 Provider 源码发生变化时，预检会因指纹不符拒绝启动；不要放宽校验，应刷新服务器快照。快照与 node_modules 安装位置分别在 `.private/provider-snapshot` 和现有同版本依赖中。若换机器，应恢复快照并按其锁文件安装依赖，然后重新核验远端。

这是**当前已核验版本的初次 Query**，不是永久保证远端不会升级。Provider 自己仍负责内部恢复请求的编译和 900000-byte 守卫；远端发布或配置变化后必须重新核验。当前保护通道仅支持文本 / Flash，图像和 MCP 使用原通道。

## 保护行为

- `/agent`：默认在 810000 字节预先拒绝，留出 90000 字节余量。响应明确说明这是本地预算拒绝，且尚未发送到远端。规范的 context-overflow 响应进入 DSH 原生 Compaction 恢复，不删历史，也不机械重复相同大请求。
- `/summary`：仅由正式 `summarizationProvider` 配置选择；不猜 Prompt 关键词。采用同一模型和无工具摘要，允许到 900000 字节，为压缩原历史保留空间。
- 恰好 900000 字节允许，900001 字节拒绝。超过硬预算而无法安全压缩的输入失败关闭，不伪造摘要、不偷删最新用户消息。
- Body、鉴权头和 SSE 内容直接转发；只记录字节、哈希、类型和真实 usage，不记录正文、API Key 或环境。

## 已安装的隔离 Profile

预算隔离开发 Profile 已通过正式 Profile 初始化和 Bundle 安装。它独立保存会话、spill 与观测数据；不要把 `@local/dsh-kasumi-budget-profile` 安装到 desktop。

隔离开发环境的启动参数见 `scripts/` 和 `profiles/` 中的代码配置；请使用当前机器的路径与模型凭据引用。

启动后绑定随机本地回环端口，pi-ai 的正式 baseURL 配置引用该服务 URL。API Key 仍通过 DSH 凭据服务取得。停用预算 Profile Bundle 或回到原开发或桌面 Profile 即可回退。

## 验证

1. 真实编译器 + 本地 HTTP 假后端验证 810000/810001、899999/900000/900001 的边界和未转发计数。该边界测试不是 900KB 上游模型性能测试。
2. 真实模型闭环：测试把提前阈值临时降到 60000，147688-byte 请求本地拦截；143038-byte 无工具摘要通过摘要通道；压缩后 13716-byte 普通请求成功，文件、验证命令和待办标记均正确保留。
3. 19 个代码文件的真实项目经过压缩继续开发，51 次工具执行、两阶段语义校验与独立进程边界断言通过。该项目没有合成历史填充。
4. 正式 CLI 返回 `BUDGET_PROFILE_OK`。SSE 查询串 `?beta=true` 已纳入传输回归测试。

客户端以前把失败请求的 pi-ai 零 usage 当作已上报用量的风险已修正：失败全零视为 unknown；真实用量仅从成功上报或唯一关联的服务器记录取得。
