import {startProfile,root} from './runtime.mjs';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const overrides=['web-startup','webserver','web-runtime','connection','desktop-product-telemetry','product-analytics'].map(id=>({id,disabled:true}));
const {ctx}=await startProfile('desktop',overrides);
try{
 const sources=await ctx.web.search({query:'机械原理',maxResults:5},AbortSignal.timeout(25000));
 assert.equal(sources.sources.length,5);assert.ok(sources.sources.some(x=>(x.title+x.snippet).includes('机械原理')));
 const expected=JSON.parse(await readFile(root+'/reports/websearch-before-desktop.json','utf8'));
 const after=JSON.parse(await readFile(process.env.USERPROFILE+'/.dsh/profiles/desktop/package.json','utf8'));
 for(const bundle of expected.dsh.profile.bundles)assert.ok(after.dsh.profile.bundles.includes(bundle));
 for(const [name,value]of Object.entries(expected.dependencies))if(name!=='@local/dsh-kasumi-websearch')assert.equal(after.dependencies[name],value);
 const result={success:true,desktopSearch:sources,previousBundlesAndDependencyVersionsPreserved:true,GUIRestartRequired:true};
 await writeFile(root+'/reports/websearch-desktop-01.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({success:true,sources:sources.sources.length,previousBundlesAndDependencyVersionsPreserved:true,GUIRestartRequired:true}));
}finally{await ctx.fiber.dispose();}
