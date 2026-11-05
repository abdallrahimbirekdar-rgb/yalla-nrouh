import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshQueue} from '../src/refresh-queue.ts';
test('driver mode refresh is queued instead of being lost behind passenger loading',async()=>{
 const queue=createRefreshQueue();let finish;const events=[];
 const first=queue.run(async()=>{events.push('passenger');await new Promise(resolve=>{finish=resolve})});
 await Promise.resolve();queue.run(async()=>{events.push('old driver refresh')});
 const last=queue.run(async()=>{events.push('current driver refresh')});finish();await Promise.all([first,last]);
 assert.deepEqual(events,['passenger','current driver refresh']);
});
test('a failed refresh does not block retry',async()=>{
 const queue=createRefreshQueue();await assert.rejects(queue.run(async()=>{throw Error('offline')}),/offline/);
 let recovered=false;await queue.run(async()=>{recovered=true});assert.equal(recovered,true);
});
