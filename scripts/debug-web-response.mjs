import{startProfile,root,creatorDevComposition}from'./runtime.mjs';
import{GatewaySearchProvider}from'../../dsh-hiagent-websearch/src/provider.js';
import{writeFile}from'node:fs/promises';
const{ctx}=await startProfile('hiagent-dev',creatorDevComposition());const record={};
try{
 const key=(await ctx.credentials.resolve('HIAGENT_API_KEY'))?.value;
 const response=await fetch('https://api.asakuraaoi.cn/v1/web/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({query:'机械原理',maxResults:5}),signal:AbortSignal.timeout(20000)});
 record.status=response.status;record.type=response.headers.get('content-type');record.data=await response.json();
 const provider=new GatewaySearchProvider({baseURL:'https://api.asakuraaoi.cn',resolveKey:async()=>'test',fetcher:async()=>Response.json(record.data)});
 try{record.parsed=await provider.search({query:'机械原理',maxResults:5});}catch(error){record.parserError={message:error.message,code:error.code};}
 console.log(JSON.stringify({status:record.status,type:record.type,sources:record.data.sources?.length,parserError:record.parserError,parsed:record.parsed?.sources.length}));
 try{const r=await ctx.web.search({query:'机械原理',maxResults:5},AbortSignal.timeout(25000));console.log(JSON.stringify({contextSources:r.sources.length}));}catch(e){console.log(JSON.stringify({contextError:e.message}));}
}catch(error){console.log(JSON.stringify({message:error.message,cause:error.cause?.code}));}
finally{await writeFile(root+'/reports/web-response-debug.json',JSON.stringify(record,null,2));await ctx.fiber.dispose();}
