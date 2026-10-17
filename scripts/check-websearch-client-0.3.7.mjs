import {startProfile,root} from './runtime.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const overrides=['web-startup','webserver','web-runtime','connection','desktop-product-telemetry','product-analytics'].map(id=>({id,disabled:true}));
const {ctx}=await startProfile('desktop',overrides);
try{
 const ordinary=await ctx.web.search({query:'机械原理',maxResults:5},AbortSignal.timeout(25000));
 assert.equal(ordinary.sources.length,5);assert.equal(ordinary.content,undefined);
 const combined=await ctx.web.search({query:'Jee 放炮 梗 意思',maxResults:5},AbortSignal.timeout(25000));
 assert.ok(combined.sources.length<=5);assert.match(combined.content,/B站补充/);assert.match(combined.content,/https:\/\/www\.bilibili\.com\/video\//);assert.doesNotMatch(combined.content,/未找到相关来源/);
 const before=JSON.parse(await readFile(root+'/reports/websearch-before-desktop.json','utf8'));
 const after=JSON.parse(await readFile(process.env.USERPROFILE+'/.dsh/profiles/desktop/package.json','utf8'));
 assert.match(after.dependencies['@local/dsh-kasumi-websearch'],/0\.3\.7\.tgz$/);
 for(const bundle of before.dsh.profile.bundles)assert.ok(after.dsh.profile.bundles.includes(bundle));
 for(const [name,value] of Object.entries(before.dependencies))if(name!=='@local/dsh-kasumi-websearch')assert.equal(after.dependencies[name],value);
 const result={success:true,adapterVersion:'0.3.7',ordinary,combined,previousBundlesAndDependencyVersionsPreserved:true,GUIRestartRequired:true};
 await writeFile(root+'/reports/websearch-client-0.3.7.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({success:true,ordinarySources:ordinary.sources.length,combinedOrdinarySources:combined.sources.length,bilibiliSupplementPresent:true,previousBundlesAndDependencyVersionsPreserved:true,GUIRestartRequired:true}));
}finally{await ctx.fiber.dispose();}
