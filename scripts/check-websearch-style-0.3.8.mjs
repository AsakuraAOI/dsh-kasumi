import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {startProfile,creatorDevComposition} from './runtime.mjs';
const checks=[];
const version=process.argv[2]??'0.3.8';
for(const profile of ['desktop','hiagent-dev']){
 const packageFile=process.env.USERPROFILE+`/.dsh/profiles/${profile}/package.json`;
 const manifest=JSON.parse(fs.readFileSync(packageFile,'utf8'));
 assert.ok(manifest.dependencies['@local/dsh-kasumi-websearch'].endsWith(`${version}.tgz`));
 const require=createRequire(packageFile),entry=pathToFileURL(require.resolve('@local/dsh-kasumi-websearch'));
 // Installed peers resolve through DSH's official two-anchor plugin loader.
 const overrides=profile==='desktop'?['web-startup','webserver','web-runtime','connection','desktop-product-telemetry','product-analytics'].map(id=>({id,disabled:true})):creatorDevComposition();
 const {ctx}=await startProfile(profile,overrides);
 let guidance;
 try{
  const section=ctx.systemPrompt.layers.merge(undefined,layer=>layer.sections).get('hiagent:web-evidence');
  assert.ok(section,'installed web evidence section registered');
  guidance=section.text.toString();
 }finally{await ctx.fiber.dispose();}
 assert.match(guidance,/independent verification is not a prerequisite/);
 if(version==='0.3.8'){assert.match(guidance,/Do not volunteer discussion/);assert.match(guidance,/Do not append routine disclaimers/);}
 else assert.doesNotMatch(guidance,/watched videos|accessed subtitles|retrieval details|disclaimers|things you did not check|Do not volunteer discussion/);
 const {GatewayFetchProvider,GatewaySearchProvider}=await import(new URL('./provider.js',entry).href);
 const source={url:'https://www.bilibili.com/video/BV0000000001/',title:'Community meme',snippet:'Community explanation',snippet_source:'platform_search'};
 const opts={baseURL:'https://fixture.example',resolveKey:async()=>'fixture'};
 const search=await new GatewaySearchProvider({...opts,fetcher:async()=>Response.json({sources:[],supplementarySources:[source],truncated:false})}).search({query:'Community meme'});
 const fetched=await new GatewayFetchProvider({...opts,fetcher:async()=>Response.json({url:source.url,statusCode:200,title:source.title,content:'标题：Community meme\n简介：Community explanation',content_source:'platform_api',content_verified:true,facts_verified:false,page_kind:'video',video_content_read:false,extraction_method:'bilibili_api',dates:{event_date:null},related_links:[],truncated:false})}).fetch({url:source.url});
 assert.doesNotMatch(search.content,/未读取视频|video_content_read|事件日期未核验/);
 assert.doesNotMatch(fetched.body.content,/未读取视频|video_content_read/);
 assert.match(fetched.body.content,/"content_source": "platform_api"/);assert.match(fetched.body.content,/"facts_verified": false/);
 const before=JSON.parse(fs.readFileSync(new URL(`../reports/websearch-before-${profile}.json`,import.meta.url)));
 for(const bundle of before.dsh.profile.bundles)assert.ok(manifest.dsh.profile.bundles.includes(bundle));
 for(const [name,value]of Object.entries(before.dependencies))if(name!=='@local/dsh-kasumi-websearch')assert.equal(manifest.dependencies[name],value);
 checks.push({profile,version,installedEntry:entry.pathname,communityAttributionAllowed:true,mediaAccessPolicyAbsent:version!=='0.3.8',sourceSemanticsPreserved:true,previousBundlesAndDependenciesPreserved:true,promptHash:createHash('sha256').update(fs.readFileSync(entry)).digest('hex')});
}
const result={success:true,scope:'Installed bundle prompt registration and deterministic search/fetch output checks; no live LLM answer evaluation',checks,GUIRestartRequired:true};
fs.writeFileSync(new URL(`../reports/websearch-style-${version}.json`,import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
