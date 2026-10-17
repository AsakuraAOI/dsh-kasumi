import{startProfile,root,creatorDevComposition}from'./runtime.mjs';
import{writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const{ctx}=await startProfile('hiagent-dev',creatorDevComposition());const result={success:false};
try{
 const start=performance.now();
 result.dateSearch=await ctx.web.search({query:'DeepSeek V3.2 发布日期',maxResults:5},AbortSignal.timeout(60000));result.ms=Math.round(performance.now()-start);result.bytes=Buffer.byteLength(JSON.stringify(result.dateSearch));
 assert.match(result.dateSearch.content,/2025-09-29/);assert.match(result.dateSearch.content,/2025-12-01/);assert.match(result.dateSearch.content,/api-docs\.deepseek\.com/);
 result.rejected=await ctx.web.search({query:'水在标准大气压下的沸点',maxResults:5},AbortSignal.timeout(20000));
 assert.equal(result.rejected.sources.length,0);assert.match(result.rejected.content,/未返回可用来源/);
 result.success=true;console.log(JSON.stringify({success:true,ms:result.ms,bytes:result.bytes,dateSources:result.dateSearch.sources.length,unrelatedSourcesRejected:true}));
}catch(error){result.error=String(error.message).split('\n')[0];console.log(JSON.stringify({success:false,error:result.error}));process.exitCode=1;}
finally{await writeFile(root+'/reports/web-research-direct-final.json',JSON.stringify(result,null,2));await ctx.fiber.dispose();}
