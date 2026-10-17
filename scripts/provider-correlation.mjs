import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from './runtime.mjs';
const provider=(await readFile(root+'/.private/provider-attempts-2026-10-10.jsonl','utf8')).trim().split('\n').map(JSON.parse);
async function find(dir){const found=[];for(const file of await readdir(dir,{withFileTypes:true})){if(file.isDirectory())found.push(...await find(resolve(dir,file.name)));else if(file.name==='metrics.jsonl')found.push(resolve(dir,file.name));}return found;}
const joined=[],unmatched=[];
for(const path of await find(root+'/benchmark-runs')){
 const events=(await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse),starts=new Map(events.filter(x=>x.type==='request/start').map(x=>[x.id,x]));
 for(const end of events.filter(x=>x.type==='request/end')){const start=starts.get(end.id);if(!start)continue;const inTime=x=>x.model===start.model&&Date.parse(x.timestamp)>=Date.parse(start.at)-3000&&Date.parse(x.timestamp)<=Date.parse(end.at)+3000;const knownUsage=end.usage&&!(end.finish==='error'&&end.usage.inputTokens===0&&end.usage.outputTokens===0);const candidates=knownUsage?provider.filter(x=>inTime(x)&&x.inputTokens===end.usage.inputTokens&&x.outputTokens===end.usage.outputTokens):provider.filter(x=>inTime(x)&&x.outcome==='error'&&x.toolCount===start.toolCount);
  if(candidates.length!==1){unmatched.push({path:path.replace(root+'/',''),requestId:end.id,candidates:candidates.length});continue;}
  const actual=candidates[0];const attempts=provider.filter(x=>x.turn===actual.turn&&Date.parse(x.timestamp)>=Date.parse(start.at)-3000&&Date.parse(x.timestamp)<=Date.parse(end.at)+3000);
  joined.push({path:path.replace(root+'/',''),requestId:end.id,sessionId:start.sessionId,purpose:start.purpose,providerRequestId:actual.requestId,matchedBy:knownUsage?'unique model + exact input/output usage + bounded time interval':'unique model + error outcome + tool count + bounded time interval; usage unknown',envelopeBytes:start.envelopeBytes,compiledQueryBytes:actual.queryBytes,context:actual.context,attempts:attempts.map(x=>({requestId:x.requestId,attempt:x.attempt,outcome:x.outcome,errorKind:x.errorKind,queryBytes:x.queryBytes,termination:x.termination,createMs:x.createMs,ttftMs:x.ttftMs,decodeMs:x.decodeMs,totalMs:x.totalMs})),usage:knownUsage?end.usage:null});
 }}
await writeFile(root+'/reports/provider-correlation.json',JSON.stringify({joined:joined.length,unmatched:unmatched.length,matches:joined,unmatchedRequests:unmatched},null,2));console.log(JSON.stringify({joined:joined.length,unmatched:unmatched.length}));
