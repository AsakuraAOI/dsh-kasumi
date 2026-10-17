import {startProfile,root} from './runtime.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
let current,result={};
try {
 current=(await startProfile()).ctx;
 result.disable=await current.pluginManager.setBundleEnabled('@local/dsh-kasumi',false);
 await current.fiber.dispose();current=undefined;
 current=(await startProfile()).ctx;
 const roster=await current.agentPresets.remoteExportList();
 result.disabledRoster=roster.presets.map(x=>x.id);
 assert.ok(result.disabledRoster.includes('hiagent-lite'));assert.ok(result.disabledRoster.includes('hiagent-balanced'));
 assert.ok(!result.disabledRoster.includes('hiagent-lite-optimized'));
 assert.ok(!result.disabledRoster.includes('hiagent-creator'));
 const handle=await current.agents.create({sessionId:`rollback-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await current.agentPresets.mount(c,'hiagent-lite')}});
 result.baselineTools=current.tools.schemas(handle.agent).map(x=>x.name).sort();assert.deepEqual(result.baselineTools,['pwsh','str_replace_editor']);await handle.dispose();
}finally {
 if(!current)current=(await startProfile()).ctx;
 result.enable=await current.pluginManager.setBundleEnabled('@local/dsh-kasumi',true);
 await current.fiber.dispose();
}
const {ctx}=await startProfile();
try{result.restoredRoster=(await ctx.agentPresets.remoteExportList()).presets.map(x=>x.id);assert.ok(result.restoredRoster.includes('hiagent-lite-optimized'));assert.ok(result.restoredRoster.includes('hiagent-creator'));result.success=true;await writeFile(root+'/reports/rollback.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{await ctx.fiber.dispose();}
