import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import yaml from 'js-yaml';
import {root,devComposition} from './runtime.mjs';
import {schema} from './build-presets.mjs';
import {providerConfig} from '../config/provider.mjs';
const target=resolve(root,'profiles/dev');await mkdir(target,{recursive:true});
const version=JSON.parse(await readFile(root+'/package.json','utf8')).version;
await writeFile(resolve(target,'package.json'),JSON.stringify({name:'@local/dsh-kasumi-dev-profile',version,private:true,type:'module',description:'Kasumi 隔离开发环境：会话和输出独立保存，默认使用基础均衡版。',exports:{'.':'./index.js','./package.json':'./package.json','./locale/*.json':'./locale/*.json'},dsh:{bundle:{patch:'./cordis.patch.yml'}}},null,2));
await writeFile(resolve(target,'index.js'),await readFile(resolve(root,'src/dev-preset.js'),'utf8'));
const rows=devComposition();
rows.find(x=>x.insert).insert[0].config.default={__jsExpr:"process.env.DSH_HIAGENT_PRESET || 'hiagent-balanced'"};
rows.push({id:'llm-pi-ai',config:providerConfig(160000,true)},{id:'agent-default-model',config:{provider:'hiagent',model:'deepseek-v4.1-flash'}},{id:'session-title-llm',disabled:true},{id:'hiagent-recovery',disabled:false},
 {id:'session-persistence-jsonl',config:{root:{__jsExpr:"ctx.profileContext.dir + '/sessions'"}}},
 {id:'spill-local',config:{root:{__jsExpr:"ctx.profileContext.dir + '/spill'"},cleanupPeriodDays:7}},
 {insert:[{id:'hiagent-dev-preset-mount',name:'@local/dsh-kasumi-dev-profile'}]});
await writeFile(resolve(target,'cordis.patch.yml'),'# Isolated headless developer composition; never install into desktop.\n'+yaml.dump(rows,{schema,lineWidth:110,noRefs:true}));
console.log('Built a CLI-runnable developer profile bundle (160K candidate, original Balanced default).');
