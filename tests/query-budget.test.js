import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {access,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startBudgetGateway} from '../src/query-budget.js';
import {root} from '../scripts/runtime.mjs';
test('verified Provider compiler admission: exact 900KB boundary, early guard, summary lane and no forwarding after rejection',async(t)=>{
 const verificationPath=root+'/reports/provider-verification.json';
 try{await access(verificationPath);}catch(error){if(error.code!=='ENOENT')throw error;t.skip('Requires separately verified Provider fingerprint in reports/provider-verification.json');return;}
 let forwarded=0;const backend=createServer((req,res)=>{forwarded++;req.resume();res.writeHead(200,{'content-type':'text/event-stream'});res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');});backend.listen(0,'127.0.0.1');await once(backend,'listening');
 const area=await mkdtemp(join(tmpdir(),'hiagent-query-'));
 const gate=await startBudgetGateway({verificationPath,upstream:`http://127.0.0.1:${backend.address().port}/anthropic`,admissionBytes:810000,path:join(area,'metrics.jsonl'),port:0});
 try {
  const body={model:'deepseek-v4.1-flash',max_tokens:1,stream:true,messages:[{role:'user',content:''}]};
  const base=(await gate.probe.measure(body)).compiledQueryBytes;
  for(const [target,lane,expected] of [[810000,'agent',200],[810001,'agent',400],[899999,'summary',200],[900000,'summary',200],[900001,'summary',400]]){
   body.messages[0].content='x'.repeat(target-base);
   assert.equal((await gate.probe.measure(body)).compiledQueryBytes,target);
   const before=forwarded;const response=await fetch(gate.url+`/${lane}/v1/messages?beta=true`,{method:'POST',headers:{'content-type':'application/json','x-api-key':'test-only'},body:JSON.stringify(body)});assert.equal(response.status,expected);await response.text();assert.equal(forwarded-before,expected===200?1:0);
  }
 }finally{await gate.close();await new Promise(done=>backend.close(done));const lines=(await readFile(join(area,'metrics.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(lines.filter(x=>x.type==='query/preflight').length,5);await rm(area,{recursive:true,force:true});}
});
