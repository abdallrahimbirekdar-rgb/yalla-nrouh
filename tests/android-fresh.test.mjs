import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptableFix,awaitFreshFix,deadlineOr} from '../src/android-fresh/gps.ts';
import {readWebMessage,trustedSite,trustedWebMessage,positionScript,bootstrapScript,autoFixScript,websiteEntryUrl} from '../src/android-fresh/bridge.ts';
test('trusted website only; no JavaScript URL injection',()=>{
 assert.equal(trustedSite('https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/'),true);
 assert.equal(trustedSite('https://evil.example/yalla-nrouh/'),false);
 assert.equal(trustedSite('https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh-evil/'),false);
 assert.equal(readWebMessage('{"type":"location","id":"a-1","askPermission":true}')?.type,'location');
 assert.equal(readWebMessage('{"type":"location","id":"!!!","askPermission":true}'),null);
 assert.equal(readWebMessage('{"type":"notify","id":"abc","title":"x","body":"y"}')?.type,'notify');
 assert.deepEqual(readWebMessage('{"type":"location-cancel","id":"x"}'),{type:'location-cancel',id:'x'});
 assert.deepEqual(readWebMessage('{"type":"host-alive","id":"resume-1"}'),{type:'host-alive',id:'resume-1'});
 assert.equal(readWebMessage('{"type":"host-alive","id":"bad!"}'),null);
 assert.deepEqual(readWebMessage('{"type":"driver-location-start","id":"drive-1","askPermission":false}'),{type:'driver-location-start',id:'drive-1',askPermission:false});
 assert.deepEqual(readWebMessage('{"type":"driver-location-stop","id":"drive-1"}'),{type:'driver-location-stop',id:'drive-1'});
 assert.equal(readWebMessage('{"type":"driver-location-start","id":"drive-1"}'),null);
 assert.equal(readWebMessage('{"type":"driver-location-stop","id":"<script>"}'),null);
 assert.deepEqual(readWebMessage('{"type":"driver-speak","id":"turn-1","text":"انعطف يمينًا","language":"ar"}'),{type:'driver-speak',id:'turn-1',text:'انعطف يمينًا',language:'ar'});
 assert.equal(readWebMessage('{"type":"driver-speak","id":"turn-1","text":" ","language":"ar"}'),null);
 assert.equal(readWebMessage('{"type":"driver-speak","id":"turn-1","text":"turn","language":"de"}'),null);
 assert.equal(readWebMessage(JSON.stringify({type:'driver-speak',id:'turn-1',text:'a'.repeat(241),language:'en'})),null);
 assert.deepEqual(readWebMessage('{"type":"driver-speech-stop"}'),{type:'driver-speech-stop'});
 assert.deepEqual(readWebMessage('{"type":"driver-voice-setup"}'),{type:'driver-voice-setup'});
});
test('Android launches reuse the document cache after a successful manual refresh',()=>{
 const entry=websiteEntryUrl();
 assert.equal(entry,websiteEntryUrl(null));
 assert.equal(entry,websiteEntryUrl('https://foreign.example/'));
 const refreshed=websiteEntryUrl('1794069000000');
 assert.notEqual(entry,refreshed);
 assert.equal(refreshed,websiteEntryUrl('1794069000000'));
 assert.equal(trustedSite(refreshed),true);
});
test('Android messages accept a sender origin only on a trusted top-level document',()=>{
 const origin='https://abdallrahimbirekdar-rgb.github.io';
 const page=origin+'/yalla-nrouh/cloud?mode=driver';
 assert.equal(trustedWebMessage(origin,page),true);
 assert.equal(trustedWebMessage(page,page),true);
 assert.equal(trustedWebMessage(origin,''),false);
 assert.equal(trustedWebMessage(origin,origin+'/other-app/'),false);
 assert.equal(trustedWebMessage(origin+'/other-app/',page),false);
 assert.equal(trustedWebMessage('https://foreign.example',page),false);
 assert.equal(trustedWebMessage(page,'https://foreign.example'),false);
});
test('native bootstrap and position events serialize as data',()=>{
 const result=positionScript({id:'x',point:{latitude:50,longitude:7}});
 assert.match(result,/yalla:native-position/);
 assert.match(bootstrapScript('x',true),/YALLA_NATIVE_LOCATION_GRANTED__/);
 assert.match(bootstrapScript('x',true),/YALLA_DRIVER_LOCATION_STREAM__/);
 assert.match(bootstrapScript('x',true,true,true),/YALLA_DRIVER_VOICE_SETUP__=true/);
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

test('ride sharing and external maps are narrow native operations',()=>{
 const rideId='aaaabbbb-cccc-4ddd-8eee-123456789012';
 const secret='abcdbbbb-cccc-4ddd-8eee-123456789012';
 const start={type:'ride-share-start',id:'test-1',rideId,secret};
 assert.deepEqual(readWebMessage(JSON.stringify(start)),start);
 assert.equal(readWebMessage(JSON.stringify({...start,secret:'account-token'})),null);
 const maps={type:'ride-maps',id:'test-2',latitude:51.481,longitude:7.219,adjacent:true};
 assert.deepEqual(readWebMessage(JSON.stringify(maps)),maps);
 assert.equal(readWebMessage(JSON.stringify({...maps,type:'ride-yandex'})),null);
 assert.equal(readWebMessage(JSON.stringify({...maps,type:'ride-maps-me'})),null);
 assert.equal(readWebMessage(JSON.stringify({...maps,longitude:181})),null);
 const osmand={...maps,type:'ride-osmand'};
 assert.deepEqual(readWebMessage(JSON.stringify(osmand)),osmand);
 assert.deepEqual(readWebMessage(JSON.stringify({...osmand,adjacent:false})),{...osmand,adjacent:false});
 assert.equal(readWebMessage(JSON.stringify({...osmand,latitude:'33.5'})),null);
 assert.equal(readWebMessage(JSON.stringify({...maps,latitude:91})),null);
 assert.equal(readWebMessage(JSON.stringify({...maps,adjacent:'true'})),null);
});


test('only the OsmAnd bridge accepts authenticated passenger display data',()=>{
 const rideId='00000000-0000-4000-8000-000000000001';
 const accessToken='header.payload.signature';
 const location={type:'ride-osmand',id:'maps-1',latitude:33.5,longitude:36.3,adjacent:false};
 const read=message=>readWebMessage(JSON.stringify(message));
 assert.deepEqual(read({...location,rideId,accessToken}),{...location,passenger:{rideId,accessToken}});
 assert.deepEqual(read({...location,rideId,accessToken:'Bearer bad'}),location);
 assert.deepEqual(read({...location,rideId:'not-a-ride',accessToken}),location);
 assert.deepEqual(read({...location,rideId,accessToken,type:'ride-maps'}),{...location,type:'ride-maps'});
 assert.deepEqual(read({type:'osmand-map-access',id:'permission-1'}),{type:'osmand-map-access',id:'permission-1'});
 assert.deepEqual(read({type:'osmand-passenger-stop'}),{type:'osmand-passenger-stop'});
 assert.match(bootstrapScript('x',true,false,false,true),/YALLA_OSMAND_PASSENGER__=true/);
});
