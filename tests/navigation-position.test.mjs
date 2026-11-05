import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationPosition,navigationGuidanceReady} from '../src/navigation-position.ts';
import {announceWebPosition} from '../src/web-position.ts';
const point={latitude:51.5,longitude:7.2};
async function host(work){const old=globalThis.window;globalThis.window=new EventTarget();window.__YALLA_NATIVE_LOCATION_GRANTED__=true;announceWebPosition(point);try{await work(window)}finally{globalThis.window=old}}
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
