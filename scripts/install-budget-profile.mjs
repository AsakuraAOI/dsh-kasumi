import {startProfile,root} from './runtime.mjs';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const name='hiagent-budget-dev',init=process.argv.includes('--init');
process.env.DSH_HIAGENT_VERIFICATION??=root+'/reports/provider-verification.json';
const {ctx,profile}=await startProfile(name,[],init);
try{const specs=[`@local/dsh-kasumi-presets@link:${resolve(root,'../hiagent-presets').replaceAll('\\','/')}`,`@local/dsh-kasumi@file:${root.replaceAll('\\','/')}/releases/local-dsh-kasumi-0.3.1.tgz`,`@local/dsh-kasumi-dev-profile@file:${root.replaceAll('\\','/')}/releases/local-dsh-kasumi-dev-profile-0.3.1.tgz`,`@local/dsh-kasumi-budget-profile@file:${root.replaceAll('\\','/')}/releases/local-dsh-kasumi-budget-profile-0.3.1.tgz`];const results=[];for(const spec of specs){const result=await ctx.pluginManager.installBundle(spec);results.push({spec,result});if(result.application==='failed')throw Error(JSON.stringify(result.error));}await writeFile(root+'/reports/install-budget-profile.json',JSON.stringify({profile:profile.dir,results},null,2));console.log(JSON.stringify({profile:profile.dir,installed:results.length}));}finally{await ctx.fiber.dispose();}
