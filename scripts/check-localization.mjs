import {startProfile,root} from './runtime.mjs';
import {readPluginMeta} from '@deepseek-ai/dsh-app-boot';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {ctx,profile}=await startProfile();
try{const presets=(await ctx.agentPresets.remoteExportList()).presets;for(const row of presets)assert.match(row.name,/[\u4e00-\u9fff]/);const names=['@local/dsh-kasumi','@local/dsh-kasumi/compaction','@local/dsh-kasumi/output-budget','@local/dsh-kasumi/recovery','@local/dsh-kasumi/query-budget','@local/dsh-kasumi/learning-policy','@local/dsh-kasumi-presets'];const metadata=names.map(name=>({name,meta:readPluginMeta(name,pathToFileURL(profile.dir+'/').href)}));for(const row of metadata){assert.ok(!row.meta.error,JSON.stringify(row));assert.match(row.meta.title.zh,/[\u4e00-\u9fff]/);}const result={success:true,presets,metadata};await writeFile(root+'/reports/localization.json',JSON.stringify(result,null,2));console.log(JSON.stringify({success:true,presets:presets.map(x=>x.name),components:metadata.length}));}finally{await ctx.fiber.dispose();}
