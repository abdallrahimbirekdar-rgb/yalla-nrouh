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

test('driver guidance requests precise Android GPS after a 100 m fix and ignores coarse updates',()=>host(async window=>{
 const messages=[];
 window.ReactNativeWebView={postMessage:raw=>messages.push(JSON.parse(raw))};
 announceWebPosition(point,{accuracy:100,time:Date.now()});
 const pending=navigationPosition(false,undefined,true);
 const request=messages.find(message=>message.type==='location');
 assert.equal(request.track,true);
 let settled=false;void pending.then(()=>{settled=true});
 announceWebPosition(point,{accuracy:95,time:Date.now()});
 await Promise.resolve();
 assert.equal(settled,false);
 window.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:request.id,point,fix:{accuracy:18,time:Date.now()}}}));
 const fix=await pending;
 assert.equal(fix.accuracy,18);
 assert.equal(navigationGuidanceReady(fix),true);
}));
