import {startProfile,root,creatorDevComposition} from './runtime.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const profileName=process.argv[2]??'hiagent-dev';
const bundleVersion=process.argv[3]??'0.1.0';
const overlays=profileName==='desktop'?['web-startup','webserver','web-runtime','connection','desktop-product-telemetry','product-analytics'].map(id=>({id,disabled:true})):creatorDevComposition();
const {ctx,profile}=await startProfile(profileName,overlays);
try{
 const before=JSON.parse(await readFile(resolve(profile.dir,'package.json'),'utf8'));
 await mkdir(root+'/reports',{recursive:true});
 await writeFile(root+`/reports/websearch-before-${profileName}.json`,JSON.stringify(before,null,2));
 const spec=`@local/dsh-kasumi-websearch@file:${root.replaceAll('\\','/')}/releases/local-dsh-hiagent-websearch-${bundleVersion}.tgz`;
 const result=await ctx.pluginManager.installBundle(spec);
 if(result.application==='failed'||result.packageResult?.exitCode!==0||result.pendingBuilds?.length)throw Error('网页搜索 Bundle 安装失败');
 const after=JSON.parse(await readFile(resolve(profile.dir,'package.json'),'utf8'));
 if(before.dsh.profile.bundles.some(x=>!after.dsh.profile.bundles.includes(x)))throw Error('既有 Bundle 被移除');
 await writeFile(root+`/reports/websearch-install-${profileName}.json`,JSON.stringify({success:true,profile:profile.dir,spec,application:result.application,previousBundlesPreserved:true},null,2));
 console.log(JSON.stringify({success:true,profile:profileName,application:result.application,previousBundlesPreserved:true}));
}finally{await ctx.fiber.dispose();}
