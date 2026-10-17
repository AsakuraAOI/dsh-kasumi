import test from 'node:test';
import assert from 'node:assert/strict';
import {apply} from '../src/learning-policy.js';
test('learning guard bounds batches per agent and step, resets on the next step and preserves other tools',()=>{
 let guard;apply({tools:{guard:fn=>{guard=fn;}}},{maxReadCallsPerStep:2});
 const events=[{type:'step/start'}],agent={session:{get seq(){return events.length;},eventAt:i=>events[i]}};
 const read=()=>guard({name:'read',arguments:{file_path:'course.md'},agent});
 assert.equal(read(),undefined);assert.equal(read(),undefined);assert.match(read(),/later step/);
 assert.equal(guard({name:'read_image',arguments:{file_path:'x.png'},agent}),undefined);
 events.push({type:'step/end'},{type:'step/start'});assert.equal(read(),undefined);
 const other={session:agent.session};assert.equal(guard({name:'read',arguments:{file_path:'course.md'},agent:other}),undefined);
});
test('learning guard can be disabled independently',()=>{apply({tools:{guard:()=>{assert.fail('disabled guard registered');}}},{enabled:false});});
