import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from './runtime.mjs';
const manifest=JSON.parse(await readFile(root+'/package.json','utf8'));
const entries={compaction:['纯文本会话压缩','使用原生 Checkpoint 与 Replay，无工具摘要，限制重复失败。'],'output-budget':['工具即时输出预算','按工具类别保留诊断信息，完整呈现文本可落盘回读。'],recovery:['有限恢复守卫','协调原生重试，防止取消或部分输出后的机械重放。'],'query-budget':['Query 字节预算预检','复用已核验的 Provider 编译代码，在远端生成前拦截超预算请求。'],'dev-preset':['开发预设驱动','在隔离命令行 Profile 中挂载所选预设。']};
for(const [part,[title,description]] of Object.entries(entries)){const dir=resolve(root,'locale',part);await mkdir(dir,{recursive:true});for(const lang of ['en','zh'])await writeFile(resolve(dir,lang+'.json'),JSON.stringify({meta:{title,description}},null,2));manifest.exports[`./${part}/locale/*.json`]=`./locale/${part}/*.json`;manifest.exports[`./${part}/package.json`]='./package.json';}
await writeFile(root+'/package.json',JSON.stringify(manifest,null,2)+'\n');
const dev=JSON.parse(await readFile(root+'/profiles/dev/package.json','utf8'));dev.version=manifest.version;dev.description='Kasumi 隔离开发 Profile：原生工具、会话与输出存储独立，默认采用基础均衡版。';dev.exports['./locale/*.json']='./locale/*.json';await writeFile(root+'/profiles/dev/package.json',JSON.stringify(dev,null,2)+'\n');
await mkdir(root+'/profiles/dev/locale',{recursive:true});for(const lang of ['en','zh'])await writeFile(root+`/profiles/dev/locale/${lang}.json`,JSON.stringify({meta:{title:'Kasumi 隔离开发环境',description:dev.description}},null,2));
console.log('生成主插件及所有子组件的中文显示元数据；内部 ID 不变。');
