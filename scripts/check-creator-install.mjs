import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import {prepareProfile} from '@deepseek-ai/dsh/profile-boot';
import {composeEntries,readProfilePatches} from '@deepseek-ai/dsh-app-boot';
import {root,runtimeAnchor} from './runtime.mjs';
import {schema} from './build-presets.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const patch=await readFile(root+'/cordis.patch.yml','utf8');
const previous=execFileSync('tar',['-xOf',root+'/releases/local-dsh-kasumi-0.3.1.tgz','package/cordis.patch.yml'],{encoding:'utf8'});
const now=yaml.load(patch,{schema})[0].insert,old=yaml.load(previous,{schema})[0].insert;
for(const row of old){const current=structuredClone(now.find(x=>x.id===row.id));if(row.config?.id?.endsWith('-optimized'))current.config.name=row.config.name;assert.deepEqual(current,row,row.id);}
const result={success:true,unchangedPreviousRows:old.map(x=>x.id),profiles:[]};
const version=JSON.parse(await readFile(root+'/package.json','utf8')).version;
for(const name of ['hiagent-dev','desktop']){
 const profile=prepareProfile(name),require=createRequire(join(profile.dir,'package.json'));
 const installed=dirname(require.resolve('@local/dsh-kasumi/package.json'));
 const manifest=JSON.parse(await readFile(join(installed,'package.json'),'utf8'));assert.equal(manifest.version,version);
 const files=['cordis.patch.yml','src/compaction.js','src/output-budget.js','src/learning-policy.js','src/global.js','scripts/build-presets.mjs','scripts/runtime.mjs','scripts/check-creator.mjs','scripts/check-creator-install.mjs','scripts/check-learning.mjs','scripts/check-global-learning.mjs','docs/creator.md','docs/learning.md','docs/global.md'];
 const hashes={};for(const file of files){const a=await readFile(join(root,file)),b=await readFile(join(installed,file));assert.deepEqual(b,a,`${name}: ${file}`);hashes[file]=hash(b);}
 const layers=composeEntries(readProfilePatches('creator-installed-check',{name,dir:profile.dir,home:join(profile.dir,'../..'),patchPath:profile.patchPath,installAnchor:runtimeAnchor,cwd:root,startedBundles:profile.layers.map(x=>x.packageName),overlays:[]},profile));
 const presets=layers.filter(row=>row.name==='@deepseek-ai/dsh-agent-preset'&&row.disabled!==true).map(row=>({id:row.config.id,name:row.config.name}));assert.ok(presets.some(x=>x.id==='hiagent-creator'));assert.ok(presets.some(x=>x.id==='hiagent-learning'));
 assert.equal(presets.find(x=>x.id==='hiagent-lite-optimized').name,'Kasumi 轻量版');assert.equal(presets.find(x=>x.id==='hiagent-balanced-optimized').name,'Kasumi 均衡版');
 if(name==='desktop'){assert.ok(presets.some(x=>x.id==='cordis'));assert.ok(!presets.some(x=>['hiagent-lite','hiagent-balanced'].includes(x.id)));require.resolve('@yunmiao/studymate/package.json');}
 result.profiles.push({name,installed,version:manifest.version,presets,hashes});
}
const official=await readFile(root+'/node_modules/@deepseek-ai/dsh-web-app/presets/cordis.patch.yml');
assert.deepEqual(official,await readFile(root+'/baseline/creator-0.2.1-rc.1.patch.yml'));result.officialCreatorUnchanged=true;
await writeFile(root+`/reports/install-modes-${version.startsWith('0.6.')?'06':'05'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({success:true,previousPresetDefinitionsPreserved:true,profiles:result.profiles.map(x=>({name:x.name,version:x.version,presets:x.presets.map(y=>y.id)}))}));
