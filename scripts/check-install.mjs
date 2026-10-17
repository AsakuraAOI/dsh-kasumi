import { startProfile, creatorDevComposition, root } from './runtime.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const {ctx}=await startProfile('hiagent-dev',creatorDevComposition());
try {
  const roster=await ctx.agentPresets.remoteExportList();
  const results=[];
  for(const item of roster.presets) {
    const handle=await ctx.agents.create({sessionId:`installation-${item.id}-${Date.now()}`,meta:{cwd:root},agentOptions:{provider:'hiagent',model:'deepseek-v4.1-flash'},setup:async owner=>{await ctx.agentPresets.mount(owner,item.id);}});
    const schemas=ctx.tools.schemas(handle.agent);
    const record={id:item.id,tools:schemas.map(x=>x.name).sort(),schemaBytes:Buffer.byteLength(JSON.stringify(schemas)),schemas,compaction:!!ctx.agentPresets.serviceFor(handle.agent,'compaction')};
    results.push(record); console.log(JSON.stringify({...record,schemas:undefined}));
    await handle.dispose();
  }
  await mkdir(resolve(root,'reports'),{recursive:true});
  await writeFile(resolve(root,'reports/tool-inventory.json'),JSON.stringify({runtime:'0.2.1-rc.1',presets:results},null,2));
} finally {await ctx.fiber.dispose();}
