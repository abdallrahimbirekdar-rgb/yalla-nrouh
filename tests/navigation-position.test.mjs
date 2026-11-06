import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationPosition,navigationGuidanceReady} from '../src/navigation-position.ts';
import {clearWebPosition,announceWebPosition} from '../src/web-position.ts';
const point={latitude:51.5,longitude:7.2};
async function host(work){const old=globalThis.window;globalThis.window=new EventTarget();window.__YALLA_NATIVE_LOCATION_GRANTED__=true;clearWebPosition();announceWebPosition(point);try{await work(window)}finally{globalThis.window=old}}
test('a recent measured driver position displays immediately without another bridge or GPS request',()=>host(async window=>{
 let requests=0;window.ReactNativeWebView={postMessage:()=>{requests++}};
 announceWebPosition(point,{accuracy:20,time:Date.now()});const fix=await navigationPosition();
 assert.equal(requests,0);assert.equal(fix.accuracy,20);assert.equal(navigationGuidanceReady(fix),true);
}));
test('a measured approximate native fix may show the map but cannot enable turn directions',()=>host(async window=>{
 window.ReactNativeWebView={postMessage:raw=>{const request=JSON.parse(raw);assert.notEqual(request.track,true);queueMicrotask(()=>window.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:request.id,point,fix:{accuracy:120,time:Date.now()}}})))}};
 const fix=await navigationPosition();assert.equal(fix.accuracy,120);assert.equal(navigationGuidanceReady(fix),false);
}));
test('expired or imprecise measurements never enable turn directions',()=>{
 assert.equal(navigationGuidanceReady({...point,accuracy:20,time:Date.now()-60000}),false);
 assert.equal(navigationGuidanceReady({...point,accuracy:60,time:Date.now()}),false);
 assert.equal(navigationGuidanceReady(null),false);
});

test('a location delivered to the upper map resolves navigation already waiting on a different request',()=>host(async window=>{
 const {nativeCurrentPosition}=await import('../src/site-bridge.web.ts');const messages=[];
 window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};
 const upper=nativeCurrentPosition(false);const lower=navigationPosition();
 await Promise.resolve();await Promise.resolve();
 const first=messages.find(message=>message.type==='location');
 window.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:first.id,point,fix:{accuracy:20,time:Date.now()}}}));
 const [top,nav]=await Promise.all([upper,lower]);assert.deepEqual(top.point,point);assert.equal(nav.latitude,point.latitude);assert.equal(nav.longitude,point.longitude);
 assert.equal(navigationGuidanceReady(nav),true);assert.equal(messages.filter(message=>message.type==='location').length,2);
}));
test('the upper map position stays visible below even when its precision is unknown',()=>host(async()=>{
 const {sharedNavigationDisplay}=await import('../src/navigation-position.ts');const display=sharedNavigationDisplay(point);
 assert.deepEqual(display.point,point);assert.equal(display.accuracy,null);assert.equal(display.guidanceReady,false);
}));

test('driver guidance waits for a fresh Android fix after stale and coarse updates',()=>host(async window=>{
 const messages=[];
 window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};
 announceWebPosition(point,{accuracy:100,time:Date.now()});
 const pending=navigationPosition(false,undefined,true);
 const request=messages.find(message=>message.type==='location');
 assert.equal(request.track,true);
 let settled=false;void pending.then(()=>{settled=true});
 window.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:request.id,point,fix:{accuracy:50,time:Date.now()-10000}}}));
 announceWebPosition(point,{accuracy:95,time:Date.now()});
 await Promise.resolve();
 assert.equal(settled,false);
 window.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:request.id,point,fix:{accuracy:18,time:Date.now()}}}));
 const fix=await pending;
 assert.equal(fix.accuracy,18);
 assert.equal(navigationGuidanceReady(fix),true);
}));

test('browser navigation keeps watching after a coarse fix and clears the watch after a fresh fix',()=>host(async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 let onFix,options,cleared;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{
  watchPosition(success,_failure,settings){onFix=success;options=settings;return 12},
  clearWatch(id){cleared=id},
 }}});
 try{
  const pending=navigationPosition(true,undefined,true);
  await Promise.resolve();
  assert.equal(options.enableHighAccuracy,true);
  const reading=accuracy=>({coords:{...point,accuracy},timestamp:Date.now()});
  onFix(reading(80));
  assert.equal(cleared,undefined);
  onFix(reading(17));
  assert.equal((await pending).accuracy,17);
  await Promise.resolve();
  assert.equal(cleared,12);
 }finally{Object.defineProperty(globalThis,'navigator',original)}
}));

test('driver stream follows fresh Android positions and ignores stale or late events after stop',()=>host(async window=>{
 const {watchDriverPosition}=await import('../src/navigation-position.ts');
 const messages=[],fixes=[];
 window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};
 assert.equal(watchDriverPosition(false,()=>{},()=>{}),null);
 window.__YALLA_DRIVER_LOCATION_STREAM__=true;
 const stop=watchDriverPosition(false,fix=>fixes.push(fix),()=>assert.fail('unexpected GPS error'));
 const {id}=messages[0];
 const now=Date.now();
 const emit=(requestId,time,latitude)=>window.dispatchEvent(new CustomEvent('yalla:native-position',{
  detail:{id:requestId,point:{...point,latitude},fix:{time,accuracy:4}},
 }));
 emit(id,now-60000,51.48);
 emit('another-request',now-200,51.49);
 emit(id,now-100,51.5);
 emit(id,now,51.51);
 emit(id,now-100,51.5);
 stop();
 emit(id,now+1,51.52);
 assert.deepEqual(fixes.map(fix=>fix.latitude),[51.5,51.51]);
 assert.deepEqual(messages,[{type:'driver-location-start',id,askPermission:false},{type:'driver-location-stop',id}]);
}));
