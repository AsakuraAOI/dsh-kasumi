import {startProfile,creatorDevComposition,root} from './runtime.mjs';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {providerConfig} from '../config/provider.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const workspace=root+'/benchmark-runs/creator-04/workspace';await mkdir(workspace,{recursive:true});
const {ctx}=await startProfile('hiagent-dev',[...creatorDevComposition(),{id:'llm-pi-ai',config:providerConfig(160000,true)},{id:'fs-sandbox',config:{cwd:workspace}},{id:'session-persistence-jsonl',config:{root:root+'/benchmark-runs/creator-04/sessions'}}]);
let handle,timer;const result={runtime:'0.2.1-rc.1',bundleVersion:'0.6.0',preset:'hiagent-creator',workspace};
try{
 handle=await ctx.agents.create({sessionId:`creator-live-${Date.now()}`,meta:{cwd:workspace},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async owner=>{await ctx.agentPresets.mount(owner,'hiagent-creator');}});const agent=handle.agent;
 result.tools=ctx.tools.schemas(agent).map(x=>x.name).sort();result.compaction=!!ctx.agentPresets.serviceFor(agent,'compaction');
 // Read-only management check under explicit Full access in this isolated dev
 // process. This does not alter either profile's saved permission policy.
 const management=await ctx.tools.execute({name:'plugin_manager',arguments:{action:'list_bundles',limit:100},callId:'creator-manager-list',agent,signal:new AbortController().signal});
 assert.equal(management.isError,false,JSON.stringify(management.content));result.pluginManagerList=true;
 const started=performance.now();timer=setTimeout(()=>agent.cancel(),330000);
 agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'This is a small Creator-mode acceptance task. Load the official editing-cordis-compositions skill. Call cordis_inspect_list and make one read-only host query using a method discovered in that list. Then create ONLY a standalone Markdown deliverable creator-check.md in this working directory. Include the exact marker HIAGENT_CREATOR_OK and one factual sentence explaining the difference between an agent preset and a profile bundle. Use present to deliver that existing file. Do not install or change any plugins, bundles, presets, settings or permissions; do not delegate. Reply briefly in Chinese.'}]}));
 await agent.whenIdle();clearTimeout(timer);
 const events=Array.from({length:agent.session.seq},(_,i)=>agent.session.eventAt(i));
 const ending=events.filter(x=>x.type==='turn/end').at(-1);result.ending=ending?.data.reason;
 assert.equal(result.ending?.kind,'completed',JSON.stringify(result.ending));
 const messages=agent.session.deriveMessages();result.calls=messages.flatMap(x=>x.content.filter(y=>y.type==='tool-call').map(y=>({name:y.name,id:y.id})));
 for(const name of ['skill','cordis_inspect_list','cordis_inspect_query','present'])assert.ok(result.calls.some(x=>x.name===name),name);
 const text=await readFile(workspace+'/creator-check.md','utf8');assert.match(text,/HIAGENT_CREATOR_OK/);result.file=text;
 result.toolErrors=events.filter(x=>x.type==='tool/result'&&x.data?.result?.isError).length;
 result.elapsedMs=Math.round(performance.now()-started);result.success=true;
 console.log(JSON.stringify({success:result.success,calls:result.calls.map(x=>x.name),elapsedMs:result.elapsedMs}));
}catch(error){result.success=false;result.error=error.message;throw error;}
finally{clearTimeout(timer);await writeFile(root+'/reports/creator-04.json',JSON.stringify(result,null,2));await handle?.dispose();await ctx.fiber.dispose();}
