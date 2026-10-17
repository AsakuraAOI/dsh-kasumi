import{startProfile,root,creatorDevComposition}from'./runtime.mjs';
import{writeFile}from'node:fs/promises';
import assert from'node:assert/strict';
const{ctx}=await startProfile('hiagent-dev',creatorDevComposition());const rows=[];
try{
 for(const query of ['水在标准大气压下的沸点','NumPy reshape -1 meaning original documentation']){
  const start=performance.now();
  const result=await ctx.web.search({query,maxResults:5},AbortSignal.timeout(60000));
  rows.push({query,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(JSON.stringify(result)),result});
  assert.ok(result.sources.length>0);
  if(query.startsWith('NumPy')){assert.match(result.content,/numpy\.org\/doc\//u);assert.match(result.content,/One shape dimension can be -1/u);}
 }
 console.log(JSON.stringify({success:true,queries:rows.map(x=>({query:x.query,ms:x.ms,bytes:x.bytes,sources:x.result.sources.length}))}));
}catch(error){rows.push({error:error.message});console.log(JSON.stringify({success:false,error:error.message}));process.exitCode=1;}
finally{await writeFile(root+'/reports/web-research-quality.json',JSON.stringify(rows,null,2));await ctx.fiber.dispose();}
