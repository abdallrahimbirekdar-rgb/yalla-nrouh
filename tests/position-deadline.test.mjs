import test from 'node:test';
import assert from 'node:assert/strict';
import {positionDeadline} from '../src/position-deadline.ts';

test('a GPS bridge that never settles still releases the UI and cancels native work',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const controller=new AbortController();
 const pending=positionDeadline(()=>new Promise(()=>{}),controller,22000);
 const rejected=assert.rejects(pending,error=>error.code==='timeout');
 t.mock.timers.tick(22000);await rejected;assert.equal(controller.signal.aborted,true);
});
test('replacing a GPS request settles the old request without affecting the new one',async()=>{
 const old=new AbortController();const pending=positionDeadline(()=>new Promise(()=>{}),old,22000);
 const rejected=assert.rejects(pending,error=>error.code==='position');old.abort();await rejected;
 const next=new AbortController();const point={latitude:51.5,longitude:7.2};
 assert.deepEqual(await positionDeadline(async()=>point,next,22000),point);
 assert.equal(next.signal.aborted,false);
});
