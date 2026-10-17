import {readFile,writeFile} from 'node:fs/promises';
import {formatSearchOutput} from '@deepseek-ai/dsh-tool-web';
import {GatewaySearchProvider} from '../../dsh-kasumi-websearch/src/provider.js';
import {root} from './runtime.mjs';
const area='C:/Users/Hyper/Desktop/github/hiagent-coding-provider/.scratch/searxng';
const before=JSON.parse(await readFile(area+'/evidence-before.json','utf8'));
const after=JSON.parse(await readFile(area+'/evidence-after.json','utf8'));
const rows=[];
for(let i=0;i<before.length;i++){
 const a=before[i],b=after[i];
 const old=formatSearchOutput({sources:a.sourcesData,truncated:true});
 const provider=new GatewaySearchProvider({baseURL:'https://benchmark.example',resolveKey:async()=>'test',fetcher:async()=>Response.json({sources:b.sourcesData,truncated:true})});
 const current=formatSearchOutput(await provider.search({query:b.query,maxResults:5}));
 rows.push({query:a.query,beforeWallMs:a.wallMs,afterWallMs:b.wallMs,afterCached:b.cached,beforeSources:a.sources,afterSources:b.sources,beforeApiBytes:a.apiBytes,afterApiBytes:b.apiBytes,beforeToolBytes:Buffer.byteLength(old),afterToolBytes:Buffer.byteLength(current),pageFetchRequests:0});
}
await writeFile(root+'/reports/web-evidence-performance.json',JSON.stringify({scope:'Recorded real API results, deterministic native DSH formatter replay; before/after are not identical result snapshots',rows},null,2));
console.log(JSON.stringify(rows));
