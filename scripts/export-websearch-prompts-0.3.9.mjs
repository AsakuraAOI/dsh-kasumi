import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {applyWebSearchTool,applyWebFetchTool,formatSearchOutput,formatFetchOutput,WEB_SEARCH_MAX_RESULTS,WEB_SEARCH_MAX_QUERIES,DEFAULT_FETCH_MAX_OUTPUT_CHARS,DEFAULT_WEB_TOOL_TIMEOUT_MS} from '@deepseek-ai/dsh-tool-web';
const root=path.resolve(import.meta.dirname,'..'),adapter=path.resolve(root,'../dsh-kasumi-websearch'),gateway='C:/Users/Hyper/Desktop/github/hiagent-coding-provider';
const read=file=>fs.readFileSync(file,'utf8');
const adapterSource=read(adapter+'/src/index.js');
const guidance=adapterSource.match(/\?'([^']+)':''/u)?.[1];assert.ok(guidance);
assert.doesNotMatch(guidance,/watched videos|accessed subtitles|retrieval details|disclaimers|Do not volunteer discussion/);
const researchSource=read(gateway+'/src/web-search/research.ts');
const researchTemplate=researchSource.match(/const plan = await call\(`([\s\S]*?)`\);/u)?.[1];assert.ok(researchTemplate);
const researchSystem=read(gateway+'/src/web-search/research-model.ts').match(/system:\["([^"]+)"\]/u)?.[1];assert.ok(researchSystem);
const sections=[],tools=[];
const ctx={systemPrompt:{section(def){sections.push({name:def.name,text:def.text({})});},getSectionOrder(){return 0;}},tools:{get(){return {};},register(def){tools.push({name:def.name,description:def.description,parameters:def.parameters,outputSchema:def.output.schema});}}};
applyWebSearchTool(ctx,WEB_SEARCH_MAX_RESULTS,WEB_SEARCH_MAX_QUERIES,DEFAULT_WEB_TOOL_TIMEOUT_MS,true);
applyWebFetchTool(ctx,DEFAULT_WEB_TOOL_TIMEOUT_MS,DEFAULT_FETCH_MAX_OUTPUT_CHARS);
const searchOnly=[];applyWebSearchTool({...ctx,systemPrompt:{...ctx.systemPrompt,section(def){searchOnly.push({name:def.name,text:def.text({})});}},tools:{...ctx.tools,register(){}}},WEB_SEARCH_MAX_RESULTS,WEB_SEARCH_MAX_QUERIES,DEFAULT_WEB_TOOL_TIMEOUT_MS,false);
const protocol=await import(pathToFileURL(gateway+'/dist/compiler/prompts/tool-protocol.js').href);
const {SENTINEL_INSTRUCTION}=await import(pathToFileURL(gateway+'/dist/providers/hiagent/sentinel.js').href);
const {getProtocol}=await import(pathToFileURL(gateway+'/dist/tool-protocol/protocols.js').href);
const sharedText=protocol.renderTextPrompt(SENTINEL_INSTRUCTION);
const snapshots=[
 ['adapter-index.js',adapter+'/src/index.js'],['adapter-provider.js',adapter+'/src/provider.js'],
 ...fs.readdirSync(gateway+'/src/web-search').filter(x=>x.endsWith('.ts')).map(x=>['gateway-'+x,gateway+'/src/web-search/'+x]),
 ['native-dsh-tool-web.js',new URL(import.meta.resolve('@deepseek-ai/dsh-tool-web'))],
 ['provider-tool-protocol.ts',gateway+'/src/compiler/prompts/tool-protocol.ts'],['provider-reply-protocols.ts',gateway+'/src/tool-protocol/protocols.ts'],['provider-sentinel.ts',gateway+'/src/providers/hiagent/sentinel.ts'],
 ['dsh-output-budget.js',root+'/src/output-budget.js']
];
const directory=root+'/reports/websearch-prompt-sources-0.3.9';fs.mkdirSync(directory,{recursive:true});
const files=snapshots.map(([name,file])=>{const bytes=fs.readFileSync(file);fs.writeFileSync(directory+'/'+name,bytes);return{name,source:String(file),sha256:createHash('sha256').update(bytes).digest('hex')};});
const result={scope:'Current Web Search project: custom adapter, research prompts, native web tools and shared provider transport; excludes unrelated agent presets and upstream application-private instructions',version:'0.3.9',exportedAt:new Date().toISOString(),guidance,researchSystem,researchTemplate,nativeSections:sections,nativeSearchOnlySection:searchOnly,nativeTools:tools,sharedTextPrompt:sharedText,files};
fs.writeFileSync(root+'/reports/websearch-prompts-0.3.9.json',JSON.stringify(result,null,2));
const lines=['# Web Search 当前提示词全文（0.3.9）','',
 '范围：本次 Web Search 项目的自定义适配说明、网关研究提示、DSH 原生网页工具说明、工具结果中的固定注入文案，以及调用 Kasumi 时共用的协议提示。以下均取自当前代码，不是概述或建议稿。旧安装包和历史报告不属于当前生效提示词。各 Agent 模式自身的完整系统提示不在本次 Web Search 改动范围；上游应用未在本地提供的内部提示无法从该项目导出。','',
 '0.3.9 已直接删除上一版两句额外约束。下面第 1 项就是修正后的完整自定义系统提示；未添加替代的禁止性话术。',''];
const block=(title,text,language='text')=>lines.push('## '+title,'','```'+language,text,'```','');
block('1. 自定义系统提示 hiagent:web-evidence',guidance);
lines.push('来源：`dsh-kasumi-websearch/src/index.js`。仅在当前作用域存在 web_search 或 web_fetch 时插入，主要模型会看到。','');
for(const section of sections)block('2. DSH 原生系统段 '+section.name,section.text);
for(const section of searchOnly)block('2. DSH 原生搜索段（没有 web_fetch 时的分支）',section.text);
for(const tool of tools){block('3. 原生工具 '+tool.name+'：描述',tool.description);block('3. 原生工具 '+tool.name+'：参数及参数说明',JSON.stringify(tool.parameters,null,2),'json');block('3. 原生工具 '+tool.name+'：输出 schema',JSON.stringify(tool.outputSchema,null,2),'json');}
lines.push('原生工具说明由 DSH 提供，本次未修改。这里使用原生默认值，查询上限为 '+WEB_SEARCH_MAX_QUERIES+'；具体来源条数等部署参数可由模式配置覆盖。','');
block('4. 网关研究模型的 system 提示',researchSystem);
block('5. 网关研究模型的 user 提示模板',researchTemplate,'javascript');
lines.push('来源：`src/web-search/research-model.ts` 与 `research.ts`。模板中的日期、query、候选 URL/title/snippet 在请求时填入；这里保留代码里的完整插值表达式。普通 /search 和 fast 不调用这套模型提示。deep 最多一次逻辑辅助模型调用，复用既有预算。','');
block('6. 工具结果：原生外部内容提醒、空结果、引用要求',formatSearchOutput({sources:[],truncated:false}));
block('6. 工具结果：原生搜索截断提示示例',formatSearchOutput({sources:[{url:'https://example.org/',title:'{title}',snippet:'{snippet}'}],truncated:true}));
block('6. 工具结果：原生 fetch 包装示例',formatFetchOutput({url:'https://example.org/',statusCode:200,body:{kind:'text',content:'{adapter body}'},truncated:true},10000));
lines.push('### 自定义适配器的固定标签与指令模板','', '下面是当前 provider.js 中构造的完整模板和错误字符串（相关源文件全文也附在快照目录中）。`${...}` 为运行时值；这些文字虽不是 system 消息，也会进入工具结果并影响模型。','');
const providerLines=read(adapter+'/src/provider.js').split(/\r?\n/u);
block('6. 自定义工具输出模板与故障提示',providerLines.map((line,index)=>({line,index})).filter(({line})=>/const provenance=|snippet:`\[来源|evidenceText=|const supplementalText=|const content=|const label=|const text=|throw this\.errorFactory\(/u.test(line)).map(({line,index})=>`// provider.js:${index+1}\n${line.trim()}`).join('\n\n'),'javascript');
block('7. 辅助模型还会经过的共用 Kasumi 无工具协议提示（完整渲染值）',sharedText);
block('7. 超时恢复时追加的共用提示',protocol.GENERATION_RECOVERY);
lines.push('研究请求 tools=[]，因此使用上面的无工具协议。主要 Agent 请求若携带工具，还会使用下面的通用工具协议；它们不是 Web Search 专用措辞，本次未修改。工具清单动态取自客户端；下例只放入 web_search/web_fetch 的实际定义，并将可变工具选择约束设为 auto。','');
for(const id of ['tagged','json','dsml']){
 const p=getProtocol(id),definitions=tools.map(t=>({name:t.name,description:t.description,inputSchema:t.parameters}));
 block('8. 共用 '+id+' 工具协议示例',protocol.renderToolProtocolPrompt({tools:definitions,toolChoice:{type:'auto'},outputRules:p.outputRules,sentinelInstruction:SENTINEL_INSTRUCTION}));
 block('8. 共用 '+id+' 临近消息提醒',protocol.renderToolChannelReminder({protocol:id,outputRules:p.outputRules,toolChoice:{type:'auto'},sentinelInstruction:SENTINEL_INSTRUCTION}));
}
lines.push('工具选择 none / any / 指定工具的分支、MCP 全角 DSML 分支的生成规则保留在下列源文件快照中。本清单未选择、更改任何生产协议。','',
 '## 9. 条件性长输出提示','', 'Kasumi 既有输出预算层在启用、输出超限且可以保存全文时，可能追加如下模板；结构化结果可能直接走原生呈现，不一定触发。','');
block('9. 预算层原始提示模板',read(root+'/src/output-budget.js').split(/\r?\n/u).filter(line=>/const hint =|const notice =/u.test(line)).map(x=>x.trim()).join('\n'),'javascript');
lines.push('## 10. 原始代码快照与校验','', '此目录附有全部 web-search 源文件、适配器源文件、原生网页工具和共用协议/预算提示源文件。可检查动态警告、失败分支和所有字符串，避免仅依赖本文抽取。标准搜索和 B 站 HTTP 客户端不单独调用 LLM，也没有另一套答案生成提示。','');
for(const file of files)lines.push(`- [${file.name}](websearch-prompt-sources-0.3.9/${file.name}) — SHA256 `+'`'+file.sha256+'`');
const output=root+'/reports/websearch-prompts-0.3.9.md';fs.writeFileSync(output,lines.join('\n'));
console.log(JSON.stringify({output,bytes:fs.statSync(output).size,sourceSnapshots:files.length,mainPromptCharacters:guidance.length}));
