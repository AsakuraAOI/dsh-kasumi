import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import yaml from 'js-yaml';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const output=resolve(root,'releases',`share-${manifest.version}-20261014`),bundle=resolve(output,'bundle');
await mkdir(bundle,{recursive:true});
const schema=yaml.JSON_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:value=>({__jsExpr:value}),predicate:value=>value&&typeof value.__jsExpr==='string',represent:value=>value.__jsExpr}));
const patch=yaml.load(await readFile(resolve(root,'cordis.patch.yml'),'utf8'),{schema});
// The local compiler-fingerprint experiment is not portable and is not part of
// the public runtime package. All global policies and four preset rows remain.
patch[0].insert=patch[0].insert.filter(row=>row.id!=='hiagent-query-budget');
const clean={...manifest,files:['src','locale','cordis.patch.yml','README.md','THIRD_PARTY_NOTICES.md','LICENSES']};
delete clean.devDependencies;delete clean.scripts;
clean.exports=Object.fromEntries(Object.entries(clean.exports).filter(([key])=>!key.startsWith('./query-budget')&&!key.startsWith('./dev-preset')));
await writeFile(resolve(bundle,'package.json'),JSON.stringify(clean,null,2)+'\n');
await writeFile(resolve(bundle,'cordis.patch.yml'),yaml.dump(patch,{schema,lineWidth:110,noRefs:true}));
const files=['budget.js','compaction.js','global.js','learning-policy.js','observability.js','output-budget.js','recovery.js','policy-core.js','execution-budget.js','pressure-policy.js','history-index.js','history-store.js','history.js','incremental.js'];
await mkdir(resolve(bundle,'src'),{recursive:true});
const hashes={};for(const file of files){const data=await readFile(resolve(root,'src',file));await writeFile(resolve(bundle,'src',file),data);hashes['src/'+file]=createHash('sha256').update(data).digest('hex');}
for(const part of ['', 'compaction','global','learning-policy','output-budget','recovery']){
 await mkdir(resolve(bundle,'locale',part),{recursive:true});
 for(const language of ['en','zh'])await copyFile(resolve(root,'locale',part,language+'.json'),resolve(bundle,'locale',part,language+'.json'));
}
await mkdir(resolve(bundle,'LICENSES'),{recursive:true});
await copyFile(resolve(root,'LICENSES/DeepSeek-MIT.txt'),resolve(bundle,'LICENSES/DeepSeek-MIT.txt'));
await copyFile(resolve(root,'baseline/studymate-LICENSE'),resolve(bundle,'LICENSES/StudyMate-MIT.txt'));
await writeFile(resolve(bundle,'THIRD_PARTY_NOTICES.md'),`# 第三方说明\n\n兼容创造预设衍生自 DeepSeek Harness 0.2.1-rc.1 的官方 Cordis 组合；学习预设衍生自 @yunmiao/studymate 2.0.1 的学习组合。\n\n- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness ，MIT，版权声明见 LICENSES/DeepSeek-MIT.txt。\n- StudyMate: https://github.com/Miaotofu01/Study-Mate ，MIT，版权声明见 LICENSES/StudyMate-MIT.txt。\n\n本包不分发 DSH 运行时或完整 StudyMate，需要使用接收者自己的安装。以上许可适用于对应第三方部分；本地适配代码的整体开源许可尚未指定，未将其统一改为 MIT。\n`);
const readme=(await readFile(resolve(root,'docs/share-template.md'),'utf8')).replaceAll('__VERSION__',manifest.version);
await writeFile(resolve(bundle,'README.md'),readme);
await writeFile(resolve(output,'安装说明.md'),readme);
await writeFile(resolve(output,'build-manifest.json'),JSON.stringify({name:clean.name,version:clean.version,sourceHashes:hashes,sourceModuleCount:files.length,excluded:['.private','reports','benchmarks','benchmark-runs','profiles','baseline backups','local scripts','node_modules','query-budget experimental channel']},null,2));
console.log(JSON.stringify({output,bundle,version:clean.version}));
