import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
import {root} from '../scripts/runtime.mjs';
test('StudyMate adaptation preserves teaching composition, fork gate, depth, tool scope and permissions',()=>{
 const original=loadOverlayPatches('studymate-reference',root+'/baseline/studymate-learning-2.0.1.cordis.yml');
 const row=loadOverlayPatches('learning-test',root+'/cordis.patch.yml')[0].insert.find(x=>x.config?.id==='hiagent-learning');
 const current=row.config.plugins,adapted=new Set(['persona','skill-filesystem','tool-fs','tool-fs-search','compaction']);
 for(const plugin of original)if(!adapted.has(plugin.id))assert.deepEqual(current.find(x=>x.id===plugin.id),plugin,plugin.id);
 assert.equal(current.find(x=>x.id==='tool-presentation').config.mode,'native');
 assert.equal(current.find(x=>x.id==='studymate-tools').name,'@yunmiao/studymate/learning-preset');
 const compaction=current.find(x=>x.id==='compaction');assert.deepEqual(compaction.isolate,original.find(x=>x.id==='compaction').isolate);assert.equal(compaction.config[0].config.plainText,true);
 for(const child of original.find(x=>x.id==='compaction').config.slice(1))assert.deepEqual(compaction.config.find(x=>x.id===child.id),child);
 assert.equal(current.find(x=>x.id==='skill-filesystem').config.includeDefaultRoots,false);
 assert.equal(current.find(x=>x.id==='hiagent-learning-policy').config.maxReadCallsPerStep,8);
 assert.match(row.disabled.__jsExpr,/packageOf/);
});
