import test from 'node:test';
import assert from 'node:assert/strict';
import {getWebPosition,recentWebPosition,webLocationGranted} from '../src/web-position.ts';
async function withBrowser(browser,work,host={}){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const oldWindow=globalThis.window;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:browser});
 globalThis.window=host;
 try{await work()}finally{
  if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);
  else delete globalThis.navigator;
  globalThis.window=oldWindow;
 }
}
test('website auto-centering needs a pre-existing permission',()=>withBrowser({
 geolocation:{getCurrentPosition:()=>{}},
 permissions:{query:async()=>({state:'prompt'})},
},async()=>{
 assert.equal(await webLocationGranted(),false);
},{__YALLA_NATIVE_LOCATION_GRANTED__:false}));
test('native grant allows checking location without a browser permission prompt',()=>withBrowser({
 geolocation:{getCurrentPosition:()=>{}},
 permissions:{query:async()=>({state:'prompt'})},
},async()=>assert.equal(await webLocationGranted(),true),{__YALLA_NATIVE_LOCATION_GRANTED__:true}));
test('explicit web permission denial takes priority over the Android host state',()=>withBrowser({
 geolocation:{getCurrentPosition:()=>{}},
 permissions:{query:async()=>({state:'denied'})},
},async()=>assert.equal(await webLocationGranted(),false),{__YALLA_NATIVE_LOCATION_GRANTED__:true}));
test('browser location returns valid coordinates and maps denied and timed-out errors',()=>withBrowser({
 geolocation:{getCurrentPosition:(success)=>success({coords:{latitude:33.51,longitude:36.27}})},
},async()=>{
 assert.deepEqual(await getWebPosition(),{latitude:33.51,longitude:36.27});
 const geo=globalThis.navigator.geolocation;
 geo.getCurrentPosition=(_ok,error)=>error({code:1});
 await assert.rejects(getWebPosition(),e=>e.code==='permission');
 geo.getCurrentPosition=(_ok,error)=>error({code:3});
 await assert.rejects(getWebPosition(),e=>e.code==='timeout');
 geo.getCurrentPosition=(success)=>success({coords:{latitude:111,longitude:36.27}});
 await assert.rejects(getWebPosition(),e=>e.code==='position');
}));

test('first approved location is ready while the home map mounts',()=>withBrowser({
 geolocation:{getCurrentPosition:(success)=>success({coords:{latitude:33.512,longitude:36.276}})},
},async()=>{
 const point=await getWebPosition();
 assert.deepEqual(recentWebPosition(12000),point);
 assert.equal(recentWebPosition(-1),null);
}));

test('a browser GPS implementation that never calls back cannot leave an endless spinner',t=>withBrowser({geolocation:{getCurrentPosition:()=>{}}},async()=>{
 t.mock.timers.enable({apis:['setTimeout']});const pending=getWebPosition(1000);const rejected=assert.rejects(pending,e=>e.code==='timeout');t.mock.timers.tick(1500);await rejected;
}));


test('Android browser fallback rejects imprecise or stale fixes before racing native GPS',()=>withBrowser({
 geolocation:{getCurrentPosition:success=>success({coords:{latitude:51.5,longitude:7.2,accuracy:1800},timestamp:Date.now()})},
},async()=>{
 await assert.rejects(getWebPosition(6500,250),e=>e.code==='accuracy');
 navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:51.5,longitude:7.2,accuracy:20},timestamp:Date.now()-60000});
 await assert.rejects(getWebPosition(6500,250),e=>e.code==='position');
 navigator.geolocation.getCurrentPosition=success=>success({coords:{latitude:51.5,longitude:7.2,accuracy:20},timestamp:Date.now()});
 assert.deepEqual(await getWebPosition(6500,250),{latitude:51.5,longitude:7.2});
}));

test('re-announcing the same phone point preserves its measurement without making an old fix fresh',async()=>{
 const {announceWebPosition,recentMeasuredWebPosition,clearWebPosition}=await import('../src/web-position.ts');
 const point={latitude:51.5,longitude:7.2};clearWebPosition();const time=Date.now();
 announceWebPosition(point,{accuracy:20,time});announceWebPosition(point);
 assert.equal(recentMeasuredWebPosition().time,time);assert.equal(recentMeasuredWebPosition().accuracy,20);
 clearWebPosition();announceWebPosition(point,{accuracy:20,time:Date.now()-60000});announceWebPosition(point);
 assert.equal(recentMeasuredWebPosition(),null);
});

test('a late older GPS result cannot replace the shared newer phone location',async()=>{
 const {announceWebPosition,recentMeasuredWebPosition,clearWebPosition}=await import('../src/web-position.ts');clearWebPosition();
 const time=Date.now();announceWebPosition({latitude:51.5,longitude:7.2},{accuracy:20,time});
 announceWebPosition({latitude:51.4,longitude:7.1},{accuracy:20,time:time-5000});
 assert.equal(recentMeasuredWebPosition().latitude,51.5);assert.equal(recentMeasuredWebPosition().time,time);
});
