import test from 'node:test';
import assert from 'node:assert/strict';
import {siteCurrentPosition,siteCurrentFix} from '../src/site-bridge.web.ts';
import {PositionError} from '../src/current-position.ts';

async function withLocationBrowser(browser,run){
 const originalWindow=globalThis.window;
 const originalDocument=globalThis.document;
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const host=new EventTarget();
 globalThis.window=host;
 globalThis.document={visibilityState:'visible'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:browser});
 try{await run(host)}
 finally{
  globalThis.window=originalWindow;
  globalThis.document=originalDocument;
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);
  else delete globalThis.navigator;
 }
}

test('embedded website uses only Android GPS even when web geolocation would ask again',async()=>withLocationBrowser({
 permissions:{query:()=>{throw Error('must not check browser permission')}},
 geolocation:{getCurrentPosition:()=>{throw Error('must not request WebView location')}}
},async host=>{
 let requests=0;
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);requests++;
  assert.equal(request.type,'location');assert.equal(request.askPermission,false);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{
   id:request.id,point:{latitude:51.48,longitude:7.21},error:null
  }})));
 }};
 assert.deepEqual(await siteCurrentPosition(false),{latitude:51.48,longitude:7.21});
 assert.equal(requests,1);
}));

test('native permission still works without web origin permission',async()=>withLocationBrowser({
 permissions:{query:async()=>({state:'denied'})},
 geolocation:{getCurrentPosition:()=>{throw Error('automatic browser prompt must not run')}}
},async host=>{
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:request.id,point:{latitude:52.4,longitude:13.1},error:null}})));
 }};
 assert.deepEqual(await siteCurrentPosition(false),{latitude:52.4,longitude:13.1});
}));

test('automatic location does not ask browser permission after native denial',async()=>withLocationBrowser({
 permissions:{query:async()=>({state:'denied'})},
 geolocation:{getCurrentPosition:()=>{throw Error('automatic browser prompt must not run')}}
},async host=>{
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id:request.id,point:null,error:'permission'}})));
 }};
 await assert.rejects(siteCurrentPosition(false),error=>error instanceof PositionError&&error.code==='permission');
}));

test('manual location permission is requested only from Android, not WebView',async()=>withLocationBrowser({
 permissions:{query:()=>{throw Error('must not check browser permission')}},
 geolocation:{getCurrentPosition:()=>{throw Error('must not ask for website location')}}
},async host=>{
 let requests=0;
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);requests++;
  assert.equal(request.askPermission,true);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{
   id:request.id,point:{latitude:52.4,longitude:13.1},error:null
  }})));
 }};
 assert.deepEqual(await siteCurrentPosition(true),{latitude:52.4,longitude:13.1});
 assert.equal(requests,1);
}));

test('unresponsive Android location bridge fails within a fixed timeout',t=>withLocationBrowser({
 permissions:{query:()=>{throw Error('browser permission must not be checked')}},
 geolocation:{getCurrentPosition:()=>{throw Error('browser GPS must not run')}}
},async host=>{
 t.mock.timers.enable({apis:['setTimeout']});
 host.ReactNativeWebView={postMessage:()=>{}};
 const locating=siteCurrentPosition(false);
 t.mock.timers.tick(11000);
 await assert.rejects(locating,error=>error instanceof PositionError&&error.code==='timeout');
}));

test('Android ride tracking accepts only accurate native GPS metadata',async()=>withLocationBrowser({
 permissions:{query:()=>{throw Error('must not check browser permission')}},
 geolocation:{getCurrentPosition:()=>{throw Error('must not use browser GPS for rides')}}
},async host=>{
 const now=Date.now();
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);assert.equal(request.track,true);assert.equal(request.askPermission,false);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{
   id:request.id,point:{latitude:51.5,longitude:7.2},
   fix:{accuracy:15,time:now},error:null
  }})));
 }};
 assert.deepEqual(await siteCurrentFix(false),{latitude:51.5,longitude:7.2,accuracy:15,time:now});
}));

test('Android ride tracking rejects coarse GPS instead of inventing paid distance',async()=>withLocationBrowser({
 geolocation:{getCurrentPosition:()=>{throw Error('browser GPS must never be used for ride tracking')}}
},async host=>{
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);assert.equal(request.track,true);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{
   id:request.id,point:{latitude:51.5,longitude:7.2},
   fix:{accuracy:400,time:Date.now()},error:null
  }})));
 }};
 await assert.rejects(siteCurrentFix(false),error=>error instanceof PositionError&&error.code==='position');
}));
