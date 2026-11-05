import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptableFix,awaitFreshFix,deadlineOr} from '../src/android-fresh/gps.ts';
import {readWebMessage,trustedSite,positionScript,bootstrapScript,autoFixScript} from '../src/android-fresh/bridge.ts';
test('trusted website only; no JavaScript URL injection',()=>{
 assert.equal(trustedSite('https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/'),true);
 assert.equal(trustedSite('https://evil.example/yalla-nrouh/'),false);
 assert.equal(trustedSite('https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh-evil/'),false);
 assert.equal(readWebMessage('{"type":"location","id":"a-1","askPermission":true}')?.type,'location');
 assert.equal(readWebMessage('{"type":"location","id":"!!!","askPermission":true}'),null);
 assert.equal(readWebMessage('{"type":"notify","id":"abc","title":"x","body":"y"}')?.type,'notify');
 assert.deepEqual(readWebMessage('{"type":"location-cancel","id":"x"}'),{type:'location-cancel',id:'x'});
});
test('native bootstrap and position events serialize as data',()=>{
 const result=positionScript({id:'x',point:{latitude:50,longitude:7}});
 assert.match(result,/yalla:native-position/);
 assert.match(bootstrapScript('x',true),/YALLA_NATIVE_LOCATION_GRANTED__/);
 assert.match(autoFixScript({latitude:51.5,longitude:7.2},Date.now()),/YALLA_NATIVE_AUTOFIX__/);
 assert.doesNotMatch(positionScript({id:'x',point:null,error:'timeout'}),/eval\s*\(/);
});
test('freshness, accuracy, and coordinate bounds are enforced',()=>{
 const now=Date.now();
 const good={coords:{latitude:51.48,longitude:7.21,accuracy:22},timestamp:now};
 assert.equal(acceptableFix(good,150,30000,now),true);
 assert.equal(acceptableFix({...good,timestamp:now-60000},150,30000,now),false);
 assert.equal(acceptableFix({...good,coords:{...good.coords,accuracy:700}},150,30000,now),false);
 assert.equal(acceptableFix({...good,coords:{...good.coords,latitude:100}},150,30000,now),false);
});
test('a late subscription is always removed after a valid fix',async()=>{
 let callback,removed=0;
 const task=awaitFreshFix(
  async next=>{callback=next;await Promise.resolve();return {remove:()=>{removed++}}},
  value=>value===7,1000,
 );
 await Promise.resolve();await Promise.resolve();
 callback?.(7);
 assert.equal(await task,7);
 // The GPS callback may resolve before Android returns the subscription handle.
 // Cleanup is guaranteed after handle registration, not synchronously with fix resolution.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(removed,1);
});
test('aborted requests cannot contaminate later requests',async()=>{
 let removed=0;
 const controller=new AbortController();
 const first=awaitFreshFix(async()=>({remove:()=>{removed++}}),()=>true,1000,controller.signal);
 await Promise.resolve();controller.abort();
 await assert.rejects(first,/GPS_CANCELLED/);
 const second=awaitFreshFix(async next=>{
  queueMicrotask(()=>next('ok'));
  return {remove:()=>{removed++}};
 },()=>true,1000,new AbortController().signal);
 assert.equal(await second,'ok');
 assert.ok(removed>=1);
});
test('a stalled cache read has a deterministic short fallback',async()=>{
 const task=new Promise(()=>{});
 assert.equal(await deadlineOr(task,5,null),null);
});

test('concurrent map requests share GPS and cancelling one does not stop another',async()=>{
 const {GpsTaskPool}=await import('../src/android-fresh/gps.ts');const pool=new GpsTaskPool();
 const a=new AbortController(),b=new AbortController();let calls=0,signal,done,preview;
 const start=(s,p)=>{calls++;signal=s;preview=p;return new Promise(resolve=>{done=resolve})};
 const seen=[];const first=pool.request('map',a.signal,()=>{},start);const rejected=assert.rejects(first,/GPS_CANCELLED/);
 const second=pool.request('map',b.signal,fix=>seen.push(fix),start);
 await Promise.resolve();assert.equal(calls,1);a.abort();await rejected;assert.equal(signal.aborted,false);
 preview(9);done(10);assert.equal(await second,10);assert.deepEqual(seen,[9]);
});
test('last GPS consumer cancels the provider and later request starts cleanly',async()=>{
 const {GpsTaskPool}=await import('../src/android-fresh/gps.ts');const pool=new GpsTaskPool();const a=new AbortController();let oldSignal;
 const first=pool.request('map',a.signal,()=>{},async signal=>{oldSignal=signal;return new Promise(()=>{})});
 const rejected=assert.rejects(first,/GPS_CANCELLED/);await Promise.resolve();a.abort();await rejected;assert.equal(oldSignal.aborted,true);
 assert.equal(await pool.request('map',new AbortController().signal,()=>{},async()=>17),17);
});
