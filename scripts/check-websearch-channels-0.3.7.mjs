import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyWebSearchTool,formatSearchOutput} from '@deepseek-ai/dsh-tool-web';
import {WebRuntime} from '@deepseek-ai/dsh-web';
import {GatewaySearchProvider} from '../../dsh-hiagent-websearch/src/provider.js';
const version=process.argv[2]??'0.3.7';

const primary=Array.from({length:5},(_,i)=>({url:`https://example.org/${i}`,title:`Ordinary article ${i}`}));
const videos=Array.from({length:3},(_,i)=>({url:`https://www.bilibili.com/video/BV000000000${i+1}/`,title:`Supplement ${i+1}`,snippet:'Creator description',snippet_source:'platform_search'}));
const provider=new GatewaySearchProvider({baseURL:'https://fixture.example',resolveKey:async()=>'fixture',fetcher:async(_url,init)=>{
  const {query}=JSON.parse(init.body);
  return Response.json({sources:query==='ordinary'||query==='combined'?primary:[],...(query==='combined'?{supplementarySources:videos}:{}),truncated:false});
}});
// Exercise both the real web seam cap and the real tool's multi-query merge.
const web={searchProviders:new Map([[provider.id,provider]]),searchProviderId:provider.id,search:WebRuntime.prototype.search};
let definition;
applyWebSearchTool({web,systemPrompt:{section(){},getSectionOrder(){return 0;}},tools:{register(d){definition=d;}}},5,4,20000,true);
const run=async queries=>{const value=await definition.execute({queries},{signal:new AbortController().signal});return{value,text:formatSearchOutput(value)};};
const combined=await run(['combined','empty-a','empty-b']);
assert.equal(combined.value.sources.length,5);
for(const page of primary)assert.ok(combined.text.includes(page.url));
for(const video of videos)assert.ok(combined.text.includes(video.url));
assert.match(combined.text,/B站补充/);assert.doesNotMatch(combined.text,/未找到相关来源|No results found/);
if(version==='0.3.8')assert.doesNotMatch(combined.text,/未读取视频|video_content_read|事件日期未核验/);
const empty=await run(['empty-a','empty-b','empty-c']);
assert.equal(empty.value.content,undefined);assert.equal((empty.text.match(/No results found\./g)??[]).length,1);
const mixed=await run(['empty-a','ordinary','empty-b']);
assert.equal(mixed.value.content,undefined);assert.equal(mixed.value.sources.length,5);assert.doesNotMatch(mixed.text,/未找到相关来源|No results found/);
const sha=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const nativeHash=sha(new URL(import.meta.resolve('@deepseek-ai/dsh-tool-web')));
assert.equal(nativeHash,'a8313d4e02c751f79d0f91dceb8dfcaa29e7c7a0299ab0d7f8db65471217b0c8');
const result={success:true,version,scope:'Deterministic fixtures through unchanged native WebRuntime and web_search execution/formatter',ordinarySources:5,additionalBilibiliSources:3,allEmptyBatchNotices:1,mixedBatchEmptyNotices:0,nativeWebToolHash:nativeHash,combinedText:combined.text,emptyText:empty.text};
fs.writeFileSync(new URL(`../reports/websearch-native-channels-${version}.json`,import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,combinedText:undefined,emptyText:undefined}));
