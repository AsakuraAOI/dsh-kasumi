import {startProfile,root} from './runtime.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const dir=root+'/benchmark-runs/matched-balanced-03/single-bug-hiagent-balanced-optimized-2';
const result=JSON.parse(await readFile(dir+'/result.json','utf8'));
const {ctx}=await startProfile('hiagent-dev',[{id:'session-persistence-jsonl',config:{root:dir+'/sessions'}}]);
try{const observation=await ctx.sessionQuery.observeSession(result.sessionId);try{const errors=observation.events.filter(x=>x.type==='assistant/attempt'||x.type==='turn/end').map(x=>({type:x.type,data:x.type==='turn/end'?x.data.reason:x.data.stream.filter(r=>r.type==='chunk'&&r.chunk.type==='finish')}));const safe=JSON.stringify(errors).replace(/[A-Za-z0-9_+=/-]{40,}/g,'[长标识已隐藏]');await writeFile(root+'/reports/matched-failure-detail.json',safe);console.log(safe);}finally{observation[Symbol.dispose]();}}finally{await ctx.fiber.dispose();}
