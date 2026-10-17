import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {startProfile,devComposition,root} from '../scripts/runtime.mjs';
test('native PowerShell pipeline applies output budget, retains exit status and provides a readable spill',async()=>{
  const area=await mkdtemp(resolve(tmpdir(),'hiagent-native-'));
  const {ctx}=await startProfile('hiagent-dev',[...devComposition(),{id:'spill-local',config:{root:resolve(area,'spill'),cleanupPeriodDays:7}}]);
  try {
    const handle=await ctx.agents.create({sessionId:`native-budget-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async c=>{await ctx.agentPresets.mount(c,'hiagent-balanced-optimized')}});
    const command=`1..700 | ForEach-Object { Write-Output ('build progress line ' + $_ + ' with details abcdefghijklmnop') }; Write-Output 'FAIL important assertion'; Write-Output 'Expected: 42'; Write-Output 'Received: 41'; Write-Output '    at source.js:27'; exit 7`;
    const result=await ctx.tools.execute({name:'pwsh',arguments:{command,description:'Check bounded test failure output'},callId:'native-budget',agent:handle.agent,signal:new AbortController().signal});
    const text=result.content.map(x=>x.text??'').join('');
    assert.equal(result.isError,false);assert.equal(result.value.exitCode,7);assert.ok(Buffer.byteLength(text)<=12288);
    assert.match(text,/\[exit code: 7\]/);assert.match(text,/FAIL important assertion/);assert.match(text,/reduced preview/);
    const path=text.match(/full formatted output: (.*?). Use read/)[1];
    const full=await readFile(path,'utf8');assert.ok(full.length>text.length);assert.match(full,/build progress line 1 /);assert.match(full,/source.js:27/);
    // The actual native read tool retrieves the path advertised to the model.
    const reread=await ctx.tools.execute({name:'read',arguments:{file_path:path,offset:1,limit:3},callId:'native-reread',agent:handle.agent,signal:new AbortController().signal});
    assert.equal(reread.isError,false,JSON.stringify(reread.content));assert.ok(reread.content.some(x=>x.text?.includes('build progress line')));
    await handle.dispose();
  }finally{await ctx.fiber.dispose();assert.equal(dirname(area),resolve(tmpdir()));assert.ok(basename(area).startsWith('hiagent-native-'));await rm(area,{recursive:true,force:true});}
});
