import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as flush} from 'node:timers/promises';
import {foregroundFix} from '../src/foreground-fix.ts';
test('waits past inaccurate first callback and removes subscription on accurate fix',async()=>{
 let next,removed=0;const signal=new AbortController().signal;
 const task=foregroundFix(async cb=>{next=cb;return {remove:()=>removed++}},value=>value.accuracy<=50,signal);
 await Promise.resolve();await Promise.resolve();next({accuracy:900});next({accuracy:20});assert.deepEqual(await task,{accuracy:20});await flush();assert.equal(removed,1);
});
test('stalled registration is cleaned when it eventually arrives after deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let register,removed=0;
 const task=foregroundFix(()=>new Promise(resolve=>register=resolve),()=>true,new AbortController().signal,1000);
 const failure=assert.rejects(task,e=>e.code==='timeout');await Promise.resolve();t.mock.timers.tick(1000);await failure;
 register({remove:()=>removed++});await Promise.resolve();await Promise.resolve();assert.equal(removed,1);
});
test('background transition cancels foreground GPS and removes subscription',async()=>{
 const controller=new AbortController();let removed=0;
 const task=foregroundFix(async()=>({remove:()=>removed++}),()=>true,controller.signal);
 const failure=assert.rejects(task,e=>e.code==='position');await Promise.resolve();await Promise.resolve();controller.abort();await failure;assert.equal(removed,1);
});
test('callback before async subscription registration still cleans native watcher',async()=>{
 let removed=0;const task=foregroundFix(async next=>{next(1);return {remove:()=>removed++}},()=>true,new AbortController().signal);
 assert.equal(await task,1);await flush();assert.equal(removed,1);
});
