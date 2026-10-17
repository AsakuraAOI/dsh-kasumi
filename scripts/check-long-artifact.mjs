import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {root} from './runtime.mjs';
import assert from 'node:assert/strict';
const workspace=root+'/benchmark-runs/long-project-03/workspace';
const api=await import(pathToFileURL(workspace+'/src/index.js').href);
for(let i=1;i<=16;i++){assert.equal(api['job'+i]([]),null);assert.equal(api['job'+i]([1,2]),1.5);assert.equal(api['job'+i]([5]),5);assert.match(await readFile(workspace+`/src/jobs/job${i}.js`,'utf8'),/mean/);}
assert.deepEqual(api.summarize([-3,1,2]),{count:3,mean:0,min:-3,max:2});assert.deepEqual(api.summarize([]),{count:0,mean:null,min:null,max:null});assert.equal(await readFile(workspace+'/KEEP.txt','utf8'),'IMMUTABLE-LP41\n');
await writeFile(root+'/reports/long-project-independent.json',JSON.stringify({success:true,freshProcessValidation:true,jobCount:16,checks:'empty, single, noninteger mean, signed values, summary exports and immutable marker'},null,2));console.log('长项目最终文件在独立进程中通过额外边界校验。');
