import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
import {startProfile,creatorDevComposition,root} from '../scripts/runtime.mjs';

test('Kasumi Creator preserves official authoring scopes, skills and permission gates',()=>{
  const official=loadOverlayPatches('creator-reference',root+'/baseline/creator-0.2.1-rc.1.patch.yml')[0].insert[0].config;
  const current=loadOverlayPatches('creator-test',root+'/cordis.patch.yml')[0].insert.find(x=>x.config?.id==='hiagent-creator').config;
  const adapted=new Set(['tool-fs','tool-fs-search','compaction']);
  for(const plugin of official.plugins)if(!adapted.has(plugin.id))assert.deepEqual(current.plugins.find(x=>x.id===plugin.id),plugin,plugin.id);
  assert.equal(current.plugins.find(x=>x.id==='tool-presentation').config.mode,'native');
  const before=official.plugins.find(x=>x.id==='compaction'),after=current.plugins.find(x=>x.id==='compaction');
  assert.deepEqual(after.isolate,before.isolate);
  for(const child of before.config.filter(x=>x.id!=='compaction-basic'))assert.deepEqual(after.config.find(x=>x.id===child.id),child);
  assert.equal(after.config[0].config.plainText,true);
});

test('installed Creator loads full official skill, queries inspection and exposes authoring tools',async()=>{
  const {ctx}=await startProfile('hiagent-dev',creatorDevComposition());let handle;
  try{
    handle=await ctx.agents.create({sessionId:`creator-regression-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-creator');}});
    const agent=handle.agent,tools=ctx.tools.schemas(agent).map(x=>x.name);
    for(const tool of ['skill','present','plugin_manager','cordis_inspect_list','cordis_inspect_query','subagent','workflow','exit_plan_mode'])assert.ok(tools.includes(tool),tool);
    assert.ok(!tools.includes('run_code'));assert.ok(ctx.agentPresets.serviceFor(agent,'compaction'));
    const execute=(name,args)=>ctx.tools.execute({name,arguments:args,callId:`creator-${name}`,agent,signal:new AbortController().signal});
    const listing=await execute('cordis_inspect_list',{});assert.equal(listing.isError,false);assert.ok(listing.value.providers.some(x=>x.platform==='host'));
    const skill=await execute('skill',{name:'cordis-plugin-development'});assert.equal(skill.isError,false,JSON.stringify(skill.content));
    const text=skill.content.map(x=>x.text??'').join('\n');
    assert.match(text,/<skill_content/);assert.match(text,/Persistent Harness plugins/);assert.match(text,/<\/skill_content>/);assert.doesNotMatch(text,/hiagent-output-budget/);
    const file=root+'/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/SKILL.md';
    const original=(await readFile(file,'utf8')).split('---').slice(2).join('---').trim();assert.ok(text.includes(original));
  }finally{await handle?.dispose();await ctx.fiber.dispose();}
});
