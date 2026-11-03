import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOverlayPatches} from '@deepseek-ai/dsh-app-boot';
import {renderPrompt} from '@deepseek-ai/dsh-system-prompt';
import {root} from '../scripts/runtime.mjs';
import {apply} from '../src/output-budget.js';
test('generated personas interpolate current Harness variables without changing the frozen baseline',()=>{
  const rows=loadOverlayPatches('persona-contract',root+'/cordis.patch.yml')[0].insert;
  for(const id of ['hiagent-lite-optimized','hiagent-balanced-optimized','hiagent-literary']){
    const persona=rows.find(row=>row.config?.id===id).config.plugins.find(row=>row.id==='persona').config;
    const rendered=renderPrompt({sections:[{name:'persona',text:persona.prefix},{name:'cwd',text:persona.suffix}],variables:{model:'example-model',cwd:'C:/example workspace'}});
    assert.match(rendered,/example-model/);assert.match(rendered,/C:\/example workspace/);
    assert.doesNotMatch(rendered,/\{(?:model|cwd)\}/);
  }
  const baseline=loadOverlayPatches('baseline-contract',root+'/baseline/cordis.patch.yml')[0].insert[0].config.plugins.find(row=>row.id==='persona').config;
  assert.match(baseline.prefix,/\{model\}/);
});
test('cwd interpolation follows the native session working directory even with budgeting disabled',()=>{
  let variable;
  apply({systemPrompt:{variable:(name,provider)=>{assert.equal(name,'cwd');variable=provider;}},get:()=>({get:()=> 'C:/active-directory'})},{enabled:false});
  assert.equal(variable({agent:{session:{header:{cwd:'C:/old-directory'}}}}),'C:/active-directory');
});
