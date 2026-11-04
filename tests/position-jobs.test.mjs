import test from 'node:test';
import assert from 'node:assert/strict';
import {createPositionJobs} from '../src/position-jobs.ts';
test('concurrent native location requests share a GPS task and release it afterwards',async()=>{
 let resolve,calls=0;const jobs=createPositionJobs(()=>{calls++;return new Promise(done=>{resolve=done})});
 const first=jobs(false),second=jobs(false);assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 resolve({latitude:51.48,longitude:7.21});assert.deepEqual(await first,await second);
 const next=jobs(false);assert.notEqual(next,first);await Promise.resolve();assert.equal(calls,2);resolve({latitude:51.48,longitude:7.21});await next;
});
test('stalled GPS tasks expire and cannot permanently block the next retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;const jobs=createPositionJobs(()=>{calls++;return new Promise(()=>{})},1000);
 const failed=jobs(false);const rejection=assert.rejects(failed,e=>e.code==='timeout');await Promise.resolve();t.mock.timers.tick(1000);await rejection;
 const retry=jobs(false);assert.notEqual(retry,failed);const again=assert.rejects(retry,e=>e.code==='timeout');await Promise.resolve();t.mock.timers.tick(1000);await again;assert.equal(calls,2);
});
