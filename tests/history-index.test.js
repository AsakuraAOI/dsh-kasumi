import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {HistoryIndex,historyRef,parseHistoryRef} from '../src/history-index.js';
import {HistoryStore} from '../src/history-store.js';
import {selectIncrement} from '../src/incremental.js';
const session=(id,events)=>({id,get seq(){return events.length;},eventAt:i=>events[i]});
test('committed summary lineage survives re-index and excludes failed transactions and privileged context',()=>{
 const events=[],s=session('owner',events),add=(type,data,surfaceOp)=>{const seq=events.length;events.push({seq,type,data,surfaceOp});return seq;};
 add('system/message',{message:{role:'system',content:[{type:'text',text:'PRIVILEGED_NEVER_RETURN'}]}});
 add('user/message',{role:'user',id:'user1',source:{kind:'user'},content:[{type:'text',text:'Exact path src/alpha.js and budget 37.5'}]});
 add('compaction/summary',{compactionId:'c1',shadowedSeqs:[1],summary:[{type:'text',text:'First checkpoint'}]});
 add('user/message',{role:'user',source:{kind:'compact-checkpoint'},content:[{type:'text',text:'First checkpoint'}]},{op:'replace'});add('compaction/end',{compactionId:'c1'});
 add('compaction/summary',{compactionId:'c2',shadowedSeqs:[3],summary:[{type:'text',text:'Second checkpoint'}]});
 add('user/message',{role:'user',source:{kind:'compact-checkpoint'},content:[{type:'text',text:'Second checkpoint'}]},{op:'replace'});add('compaction/end',{compactionId:'c2'});
 add('compaction/summary',{compactionId:'bad',shadowedSeqs:[1],summary:[{type:'text',text:'Bad summary'}]});add('compaction/end',{compactionId:'bad',error:'cancelled'});
 for(const index of [new HistoryIndex(),new HistoryIndex()]){
  assert.equal(index.search(s,'37.5').results[0].ref,historyRef(s,'e',1));assert.equal(index.search(s,'PRIVILEGED').results.length,0);
  const block=index.block(s,5);assert.equal(block.tier,2);assert.deepEqual(block.parents,[historyRef(s,'b',2)]);assert.deepEqual(index.block(s,2).sources,[historyRef(s,'e',1)]);assert.equal(index.block(s,8),undefined);
 }
 assert.throws(()=>parseHistoryRef(session('someone-else',[]),historyRef(s,'e',1)),/another session/);
 const aborted=new AbortController();aborted.abort();assert.throws(()=>new HistoryIndex().search(s,'37.5',{signal:aborted.signal}));
});
test('durable archives deduplicate, reject ref collisions, enforce quotas and remain readable across process state reconstruction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'kasumi-history-')),s=session('owner',[]);
 try{
  const store=new HistoryStore(root),text='A preserved detail: 37.5\n'+'value '.repeat(3000);
  const a=await store.save(s,{callId:'call-a',tool:'report',text,maxBytes:50000,quotaBytes:50000});assert.ok(a);
  const b=await store.save(s,{callId:'call-b',tool:'report',text,maxBytes:50000,quotaBytes:50000});assert.ok(b);assert.equal((await readdir(join(store.directory(s),'blobs'))).length,1);
  assert.equal(await store.save(s,{callId:'call-a',tool:'report',text:'different'}),undefined);
  const restored=new HistoryStore(root);assert.equal((await restored.read(s,a)).text,text);
  assert.equal(await store.save(s,{callId:'big',tool:'report',text:'x'.repeat(50001),maxBytes:50000}),undefined);
  await assert.rejects(restored.read(session('other',[]),a),/another session/);
  const blob=join(store.directory(s),'blobs',(await readdir(join(store.directory(s),'blobs')))[0]);await writeFile(blob,'tampered');await assert.rejects(restored.read(s,a),/integrity/);
 }finally{assert.equal(dirname(root),resolve(tmpdir()));await rm(root,{recursive:true,force:true});}
});
test('incremental selection keeps checkpoint and newest user intent, requires worthwhile growth, and respects tail reservation',()=>{
 const events=[{type:'user/message',data:{source:{kind:'compact-checkpoint'}}},{type:'user/message',data:{role:'user',source:{kind:'user'}}},{type:'assistant/message',data:{message:{role:'assistant'}}},{type:'tool/result',data:{message:{role:'tool'}}},{type:'assistant/message',data:{message:{role:'assistant'}}}];
 const s=session('owner',events),m={totalTokens:40000,nodes:[{seq:0,tokens:4000},{seq:1,tokens:1000},{seq:2,tokens:20000},{seq:3,tokens:5000},{seq:4,tokens:1000}]};
 assert.deepEqual(selectIncrement(s,m,{retainTokens:1000,minTokens:8000,summaryReserve:4000,thresholdTokens:30000}),{start:2,end:3,tokens:25000});
 assert.equal(selectIncrement(s,m,{retainTokens:30000,minTokens:8000,summaryReserve:4000,thresholdTokens:30000}),null);
 assert.equal(selectIncrement(s,m,{retainTokens:1000,minTokens:30000,summaryReserve:4000,thresholdTokens:30000}),null);
});
