import test from 'node:test';
import assert from 'node:assert/strict';
import {bytes,category,preview} from '../src/budget.js';
import {apply} from '../src/output-budget.js';
test('classified budgets distinguish shell diagnostics and search/diff',()=>{
  assert.equal(category('pwsh',{command:'npm test'}),'test');
  assert.equal(category('pwsh',{command:'git diff -- src'}),'diff');
  assert.equal(category('pwsh',{command:'rg needle src'}),'search');
  assert.equal(category('str_replace_editor',{command:'str_replace'}),undefined);
});
test('UTF-8 cap and diagnostic preservation with unicode in large output',()=>{
  const text='数据 😀\n'.repeat(4000)+'\nFAIL assertion in middle\nExpected: 2\nReceived: 1\n    at src/a.js:12\n'+'progress\n'.repeat(4000)+'[exit code: 1]';
  const output=preview(text,8192,'[reduced; full formatted output: /safe/result.txt]');
  assert.ok(bytes(output)<=8192); assert.ok(!output.includes('\ufffd'));
  for(const marker of ['FAIL assertion','Expected: 2','at src/a.js:12','[exit code: 1]','reduced']) assert.ok(output.includes(marker),marker);
});
test('post-execute preserves structured value, block policies and additional context',async()=>{
  let handler,spilled;
  const ctx={systemPrompt:{variable:()=>{}},on:(_event,fn)=>{handler=fn;},spillStore:{saveText:async input=>{spilled=input;return {locator:'/tmp/full.txt',retrievalHint:'read this file'};}},logger:{warn:()=>{}}};
  apply(ctx,{budgets:{shell:1024}});
  const content=[{type:'text',text:'line\n'.repeat(1000)+'[exit code: 7]'}];
  const result={content,value:{exitCode:7,stdout:'original'},isError:false};
  const extra=[{role:'user',content:[]}];
  const decision=await handler({name:'pwsh',arguments:{command:'echo'},callId:'x',agent:{session:{id:'s'}}},result,async()=>({kind:'accept',additionalContexts:extra}));
  assert.equal(result.value.exitCode,7);assert.equal(result.content,content);assert.equal(decision.additionalContexts,extra);
  assert.ok(bytes(decision.content[0].text)<=1024);assert.equal(spilled.content,content[0].text);
  const block={kind:'block',feedback:[]};assert.equal(await handler({name:'pwsh'},result,async()=>block),block);
  const value={kind:'accept',value:{hello:true}};assert.equal(await handler({name:'pwsh'},result,async()=>value),value);
});
test('spill failures and nontext result blocks preserve original content',async()=>{
  let handler;
  apply({systemPrompt:{variable:()=>{}},on:(_e,fn)=>handler=fn,spillStore:{saveText:async()=>{throw Error('disk');}},logger:{warn:()=>{}}},{budgets:{shell:1024}});
  const exec={name:'pwsh',arguments:{},agent:{session:{id:'s'}}};
  const accepted={kind:'accept'};
  assert.equal(await handler(exec,{content:[{type:'text',text:'x'.repeat(4000)}]},async()=>accepted),accepted);
  assert.equal(await handler(exec,{content:[{type:'image',attachment:{}}]},async()=>accepted),accepted);
});
