import{startProfile,root}from'./runtime.mjs';
import{formatSearchOutput,searchMetaFromValue}from'@deepseek-ai/dsh-tool-web';
import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
const overrides=['web-startup','webserver','web-runtime','connection','desktop-product-telemetry','product-analytics'].map(id=>({id,disabled:true}));
const{ctx}=await startProfile('desktop',overrides);const result={success:false};
try{
 result.search=await ctx.web.search({query:'Jee',maxResults:5},AbortSignal.timeout(20000));
 assert.ok(result.search.sources.length);assert.equal(result.search.content,undefined);assert.equal(searchMetaFromValue(result.search).answer,undefined);
 assert.doesNotMatch(formatSearchOutput(result.search),/以下来源已标明|摘要里的日期/);
 result.video=await ctx.web.fetch({url:'https://www.bilibili.com/video/BV1WvHX61Eb1/'},AbortSignal.timeout(20000));
 if(result.video.statusCode===200){assert.match(result.video.body.content,/"video_content_read": false/);assert.match(result.video.body.content,/未读取视频或字幕/);assert.doesNotMatch(result.video.body.content,/正文（来源 web_page）/);}
 else assert.match(result.video.body.content,/"content_verified": false/);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 result.nativeWebToolHash=sha(await readFile(new URL(import.meta.resolve('@deepseek-ai/dsh-tool-web'))));
 result.webSystemPromptHash=sha(await readFile(new URL('../../dsh-kasumi-websearch/src/index.js',import.meta.url)));
 assert.equal(result.nativeWebToolHash,'a8313d4e02c751f79d0f91dceb8dfcaa29e7c7a0299ab0d7f8db65471217b0c8');
 assert.equal(result.webSystemPromptHash,'6bd8555772d77a09d110ec0a9d43a10ba972853695aae18a5864ab0b1bfeba7f');
 result.success=true;console.log(JSON.stringify({success:true,sources:result.search.sources.length,ordinaryAnswerAbsent:true,videoStatus:result.video.statusCode,nativeToolAndPromptUnchanged:true}));
}catch(error){result.error=error.message;console.log(JSON.stringify({success:false,error:error.message}));process.exitCode=1;}
finally{await writeFile(root+'/reports/websearch-client-20261015.json',JSON.stringify(result,null,2));await ctx.fiber.dispose();}
