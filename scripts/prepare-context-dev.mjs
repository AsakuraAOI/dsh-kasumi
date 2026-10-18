import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {startProfile,root,creatorDevComposition} from './runtime.mjs';
process.env.DSH_HOME=resolve(root,'.private/context-dev-home');
const baseline=resolve(root,'.private/context-baseline');await mkdir(baseline,{recursive:true});
await writeFile(resolve(baseline,'package.json'),await readFile(resolve(root,'baseline/package.json')));
await writeFile(resolve(baseline,'cordis.patch.yml'),await readFile(resolve(root,'baseline/cordis.patch.yml')));
const {ctx}=await startProfile('hiagent-dev',creatorDevComposition(),!existsSync(resolve(process.env.DSH_HOME,'profiles/hiagent-dev/package.json')));
try{
 for(const spec of [`@local/dsh-kasumi-presets@link:${baseline.replaceAll('\\','/')}`,`@local/dsh-kasumi@link:${root.replaceAll('\\','/')}`]){
  const result=await ctx.pluginManager.installBundle(spec);console.log(JSON.stringify({spec,application:result.application,exitCode:result.packageResult?.exitCode}));
  if(result.application==='failed'||result.packageResult?.exitCode!==0)throw Error('Context development bundle installation failed');
 }
}finally{await ctx.fiber.dispose();}
