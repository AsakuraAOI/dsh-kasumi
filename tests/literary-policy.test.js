import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {apply} from '../src/literary-policy.js';
const setup=(config={})=>{let guard;apply({tools:{guard:fn=>{guard=fn;}}},config);return guard;};
const agentAt=cwd=>{const events=[{type:'step/start'}];return {events,session:{get seq(){return events.length;},eventAt:i=>events[i],header:{meta:{cwd}}}};};
test('literary guard bounds reads per step and resets on the next step',()=>{
 const guard=setup({maxReadCallsPerStep:2}),agent=agentAt(process.cwd());
 const read=()=>guard({name:'read',arguments:{file_path:'scene.md'},agent});
 assert.equal(read(),undefined);assert.equal(read(),undefined);assert.match(read(),/later step/);
 agent.events.push({type:'step/end'},{type:'step/start'});assert.equal(read(),undefined);
 assert.equal(guard({name:'read_image',arguments:{file_path:'x.png'},agent}),undefined);
});
test('literary guard refuses to overwrite an unread manuscript but allows new files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kasumi-literary-'));
 fs.writeFileSync(path.join(dir,'chapter-1.md'),'旧稿');
 const guard=setup(),agent=agentAt(dir);
 assert.match(guard({name:'write',arguments:{file_path:'chapter-1.md'},agent}),/already exists/);
 assert.equal(guard({name:'write',arguments:{file_path:'chapter-2.md'},agent}),undefined);
 assert.equal(guard({name:'read',arguments:{file_path:'chapter-1.md'},agent}),undefined);
 assert.equal(guard({name:'write',arguments:{file_path:'chapter-1.md'},agent}),undefined);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('literary guard can be disabled independently',()=>{apply({tools:{guard:()=>{assert.fail('disabled guard registered');}}},{enabled:false});});