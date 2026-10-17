import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';
import { persona, compaction, search, features } from '../config/shared.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const schema = yaml.JSON_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => ({ __jsExpr: value }), predicate: value => value && typeof value.__jsExpr === 'string', represent: value => value.__jsExpr }));
const baseline = yaml.load(fs.readFileSync(resolve(root,'baseline/cordis.patch.yml'),'utf8'),{ schema });
const definitions = baseline[0].insert.map(row => {
  const next = structuredClone(row), lite = row.config.id.endsWith('lite');
  next.id += '-optimized'; next.config.id += '-optimized';
  next.config.name = lite ? 'Kasumi 轻量版' : 'Kasumi 均衡版';
  next.config.description = lite ? '持久化终端与精确编辑，增加项目指令、轻量压缩和输出预算；额外搜索默认关闭。' : '文件检索与编辑、终端、后台任务和网页工具，增加纯文本压缩及即时输出预算。';
  next.config.order += 10;
  const plugins = next.config.plugins;
  if(features.rewritePersona)plugins.find(x=>x.id==='persona').config.prefix = persona;
  if (lite) {
    if(features.projectInstructions) plugins.splice(1,0,{ id:'agent-instructions', name:'@deepseek-ai/dsh-agent-instructions', config:{ maxBytes:32768 } });
    if(features.liteSearch) plugins.push({ id:'tool-fs-search', name:'@deepseek-ai/dsh-tool-fs-search', config:features.nativeOutputCaps?search:{sampleOverCapGlobResults:false} });
    // The ordinary editor's view is the Lite file pagination path.
    plugins.push({ id:'compaction', name:'cordis:group', group:true, isolate:{compaction:true,toolResultPruner:true}, config:[{ id:'compaction-basic', name:'@local/dsh-kasumi/compaction', config:compaction }, { id:'command-compact', name:'@deepseek-ai/dsh-command-compact' }] });
  } else {
    if(features.nativeOutputCaps) { plugins.find(x=>x.id==='tool-fs').config = { readMaxBytes:12288, readLimit:200 }; plugins.find(x=>x.id==='tool-fs-search').config = search; }
    if(!features.projectInstructions)plugins.find(x=>x.id==='agent-instructions').disabled=true;
    const engine = plugins.find(x=>x.id==='compaction').config.find(x=>x.id==='compaction-basic');
    engine.name='@local/dsh-kasumi/compaction'; engine.config=compaction;
  }
  const compactGroup=plugins.find(x=>x.id==='compaction');
  compactGroup.disabled=!features.compaction;
  compactGroup.config.find(x=>x.id==='compaction-basic').config={...compaction,plainText:features.plainTextCompaction};
  plugins.push({ id:'hiagent-output-budget', name:'@local/dsh-kasumi/output-budget', config:{enabled:features.outputBudget} });
  return next;
});
// Preserve the versioned official Creator's authoring tools, skills, planning
// rules and delegation scopes, adding only native presentation and our budgets.
const creator = yaml.load(fs.readFileSync(resolve(root,'baseline/creator-0.2.1-rc.1.patch.yml'),'utf8'),{schema})[0].insert[0];
creator.id='preset-hiagent-creator';
Object.assign(creator.config,{id:'hiagent-creator',name:'Kasumi 创造模式',description:'基于官方创造模式：开发插件、编辑预设与组合、加载技能、展示内容和管理 Bundle；适配 Kasumi 原生工具呈现、纯文本压缩及输出预算。',order:32});
const creatorPlugins=creator.config.plugins;
creatorPlugins.splice(1,0,{id:'tool-presentation',name:'@deepseek-ai/dsh-agent-tool-presentation',config:{mode:'native'}});
if(features.nativeOutputCaps) {
  creatorPlugins.find(x=>x.id==='tool-fs').config={readMaxBytes:12288,readLimit:200};
  creatorPlugins.find(x=>x.id==='tool-fs-search').config=search;
}
if(!features.projectInstructions)creatorPlugins.find(x=>x.id==='agent-instructions').disabled=true;
const creatorCompaction=creatorPlugins.find(x=>x.id==='compaction');
creatorCompaction.disabled=!features.compaction;
Object.assign(creatorCompaction.config.find(x=>x.id==='compaction-basic'),{name:'@local/dsh-kasumi/compaction',config:{...compaction,plainText:features.plainTextCompaction}});
creatorPlugins.push({id:'hiagent-output-budget',name:'@local/dsh-kasumi/output-budget',config:{enabled:features.outputBudget}});
definitions.push(creator);
// StudyMate's installed 2.0.1 native registration uses the template plus its
// learning-preset tools row. Resolve skills from the installed package for each
// profile, retaining the teaching persona and the entire learning tool scope.
const studyPlugins=yaml.load(fs.readFileSync(resolve(root,'baseline/studymate-learning-2.0.1.cordis.yml'),'utf8'),{schema});
const studySkillsExpr="process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@yunmiao/studymate/package.json')), 'preset', 'skills').replaceAll('\\\\','/')";
const studyPersona=studyPlugins.find(x=>x.id==='persona');
studyPersona.config.prefix={__jsExpr:`${JSON.stringify(studyPersona.config.prefix)}.replaceAll('__STUDYMATE_SKILLS__', ${studySkillsExpr})`};
studyPlugins.find(x=>x.id==='skill-filesystem').config.customSkillDirs=[{__jsExpr:studySkillsExpr}];
studyPlugins.push({id:'studymate-tools',name:'@yunmiao/studymate/learning-preset'});
studyPlugins.splice(1,0,{id:'tool-presentation',name:'@deepseek-ai/dsh-agent-tool-presentation',config:{mode:'native'}});
if(features.nativeOutputCaps){studyPlugins.find(x=>x.id==='tool-fs').config={readMaxBytes:12288,readLimit:200};studyPlugins.find(x=>x.id==='tool-fs-search').config=search;}
if(!features.projectInstructions)studyPlugins.find(x=>x.id==='agent-instructions').disabled=true;
const studyCompaction=studyPlugins.find(x=>x.id==='compaction');studyCompaction.disabled=!features.compaction;
Object.assign(studyCompaction.config.find(x=>x.id==='compaction-basic'),{name:'@local/dsh-kasumi/compaction',config:{...compaction,plainText:features.plainTextCompaction}});
studyPlugins.push({id:'hiagent-output-budget',name:'@local/dsh-kasumi/output-budget',config:{enabled:features.outputBudget}});
studyPlugins.push({id:'hiagent-learning-policy',name:'@local/dsh-kasumi/learning-policy',config:{enabled:true,maxReadCallsPerStep:8}});
definitions.push({id:'preset-hiagent-learning',name:'@deepseek-ai/dsh-agent-preset',disabled:{__jsExpr:"(() => { try { return !ctx.get('pluginPackages')?.packageOf('@yunmiao/studymate', ctx.baseUrl); } catch { return true; } })()"},config:{id:'hiagent-learning',name:'Kasumi 学习模式',description:'StudyMate 学习总控、课程校验、任务与实验工具，使用 Kasumi 原生工具呈现、纯文本压缩和输出预算。',order:33,plugins:studyPlugins}});
const globalGroup={id:'hiagent-global-group',name:'cordis:group',group:true,isolate:{compaction:true,toolResultPruner:true},config:[
 {id:'hiagent-global-compaction',name:'@local/dsh-kasumi/compaction',config:{...compaction,auto:false}},
 {id:'hiagent-global',name:'@local/dsh-kasumi/global',config:{enabled:true,providers:['hiagent'],outputBudget:true,genericOutputs:true,readBatchGuard:true,maxReadCallsPerStep:8,pressureCompaction:true,recoveryGuard:true,readBytes:12288,searchBytes:6144,shellBytes:8192,otherBytes:16384}},
]};
const patch = [{ insert:[{ id:'hiagent-observability',name:'@local/dsh-kasumi',config:{enabled:false}}, {id:'hiagent-recovery',name:'@local/dsh-kasumi/recovery',disabled:true}, {id:'hiagent-query-budget',name:'@local/dsh-kasumi/query-budget',disabled:true},globalGroup,...definitions] }];
fs.writeFileSync(resolve(root,'cordis.patch.yml'),'# Generated by npm run build from immutable baseline and config/shared.mjs.\n'+yaml.dump(patch,{schema,lineWidth:110,noRefs:true}));
console.log('Built Kasumi Lite, Balanced, Creator and StudyMate Learning; stable IDs retained.');
