import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteScheduler} from '../src/route-scheduler.ts';
test('request summaries serialize road calls and do not run cancelled requests',async()=>{
 const queue=createRouteScheduler(0);const calls=[];let finish;const controller=new AbortController();
 const first=queue.run(async()=>{calls.push('trip');await new Promise(resolve=>{finish=resolve});return 1});
 await Promise.resolve();await Promise.resolve();
 const cancelled=queue.run(async()=>{calls.push('cancelled');return 2},controller.signal);const rejected=assert.rejects(cancelled);
 const third=queue.run(async()=>{calls.push('pickup');return 3});controller.abort();finish();
 assert.equal(await first,1);await rejected;assert.equal(await third,3);assert.deepEqual(calls,['trip','pickup']);
});
