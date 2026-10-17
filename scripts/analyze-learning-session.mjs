import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {root} from './runtime.mjs';
const file=root+'/.private/learning-session-f120e501.v4.jsonl';
const events=(await readFile(file,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
const calls=events.filter(x=>x.type==='tool/call'),results=events.filter(x=>x.type==='tool/result');
const text=m=>m?.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n')??'';
const bytes=m=>Buffer.byteLength(text(m));
const header=events.find(x=>x.type==='request/header').data.header;
const result={sessionId:events[0].id,initialPreset:events[0].agentPreset,selectedPreset:events.find(x=>x.type==='agent-preset/selected').data.agentPreset,route:header.config,toolCount:header.tools.length,schemaBytes:Buffer.byteLength(JSON.stringify(header.tools)),toolCalls:calls.length,toolResultTextBytes:results.reduce((s,x)=>s+bytes(x.data.message),0),compactionEvents:events.filter(x=>x.type.startsWith('compaction/')).length,steps:[]};
for(const step of events.filter(x=>x.type==='step/start')){
 const n=step.data.step,assistant=events.find(x=>x.type==='assistant/message'&&x.data.step===n);
 const stepCalls=calls.filter(x=>x.data.step===n),stepResults=results.filter(x=>x.data.step===n);
 result.steps.push({step:n,startTime:new Date(step.time).toISOString(),endTime:new Date(events.find(x=>x.type==='step/end'&&x.data.step===n)?.time??step.time).toISOString(),usage:assistant?.data.usage??null,calls:stepCalls.length,counts:Object.fromEntries([...new Set(stepCalls.map(x=>x.data.name))].map(name=>[name,stepCalls.filter(x=>x.data.name===name).length])),toolResultTextBytes:stepResults.reduce((s,x)=>s+bytes(x.data.message),0)});
}
result.largestResults=results.map(x=>{const call=calls.find(c=>c.data.callId===x.data.message.toolCallId);return {seq:x.seq,step:x.data.step,textBytes:bytes(x.data.message),isError:x.data.message.isError,tool:call?.data.name,arguments:call?.data.arguments};}).sort((a,b)=>b.textBytes-a.textBytes).slice(0,10);
result.binaryTextReads=calls.filter(x=>x.data.name==='read'&&/\.(?:png|jpe?g|webp|gif)"/.test(x.data.arguments)).map(x=>({seq:x.seq,step:x.data.step,file:JSON.parse(x.data.arguments).file_path}));
result.error=events.at(-1).data.reason;
if(process.argv.includes('--provider')){
 const lo=(events[0].createdAt-5000)/1000,hi=(events.at(-1).time+5000)/1000;
 const python=`import glob,gzip,json,datetime
for p in glob.glob('/var/log/hiagent-coding-provider/usage.jsonl*'):
 try:
  with (gzip.open(p,'rt') if p.endswith('.gz') else open(p)) as f:
   for l in f:
    try:
     r=json.loads(l);t=datetime.datetime.strptime(r['timestamp'][:19],'%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc).timestamp()
     if ${lo}<=t<=${hi}: print(json.dumps(r,ensure_ascii=False))
    except (ValueError,KeyError): pass
 except OSError: pass
`;
 const command=`python3 -c 'import base64;exec(base64.b64decode("${Buffer.from(python).toString('base64')}"))'`;
 const out=execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','root@47.102.135.53',command],{encoding:'utf8',timeout:20000});
 await writeFile(root+'/.private/learning-provider-attempts.jsonl',out);
}
try{
 const provider=(await readFile(root+'/.private/learning-provider-attempts.jsonl','utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 result.provider=provider.map(r=>({requestId:r.requestId,timestamp:r.timestamp,model:r.model,queryBytes:r.queryBytes,toolCount:r.toolCount,inputTokens:r.inputTokens,outputTokens:r.outputTokens,outcome:r.outcome,errorKind:r.errorKind,totalMs:r.totalMs,context:r.context,termination:r.termination,attempt:r.attempt}));
}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(root+'/reports/learning-session-analysis-05.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({selectedPreset:result.selectedPreset,toolCount:result.toolCount,steps:result.steps,binaryTextReads:result.binaryTextReads.length,provider:result.provider,error:result.error},null,2));
