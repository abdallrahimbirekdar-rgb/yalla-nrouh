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
 t.mock.timers.tick(25000);
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

test('an approximate Android grant has a distinct actionable error',async()=>withLocationBrowser({},async host=>{
 host.ReactNativeWebView={postMessage:raw=>{const {id}=JSON.parse(raw);queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id,point:null,error:'accuracy'}})))}};
 await assert.rejects(siteCurrentPosition(false),error=>error.code==='accuracy');
}));

test('a fresh Android fix after the old short deadline still reaches the website',t=>withLocationBrowser({},async host=>{
 t.mock.timers.enable({apis:['setTimeout']});let id;
 host.ReactNativeWebView={postMessage:raw=>{id=JSON.parse(raw).id}};
 const task=siteCurrentPosition(false);t.mock.timers.tick(15000);
 host.dispatchEvent(new CustomEvent('yalla:native-position',{detail:{id,point:{latitude:51.48,longitude:7.21}}}));
 assert.deepEqual(await task,{latitude:51.48,longitude:7.21});
}));


test('Android app can use browser GPS if native bridge stalls and Android grant exists',async()=>withLocationBrowser({
 geolocation:{getCurrentPosition:success=>{
  queueMicrotask(()=>success({coords:{latitude:51.47,longitude:7.23,accuracy:25},timestamp:Date.now()}));
 }}
},async host=>{
 host.__YALLA_NATIVE_LOCATION_GRANTED__=true;
 let nativeIds=[];
 host.ReactNativeWebView={postMessage:raw=>{const value=JSON.parse(raw);nativeIds.push(value)}};
 const request=siteCurrentPosition(false);
 await new Promise(resolve=>setTimeout(resolve,1700));
 assert.deepEqual(await request,{latitude:51.47,longitude:7.23});
 assert.equal(nativeIds[0]?.type,'location');
 assert.equal(nativeIds[nativeIds.length-1]?.type,'location-cancel');
}));
test('native autolocation survives event before home page mounts',async()=>withLocationBrowser({},async host=>{
 const now=Date.now();
 host.ReactNativeWebView={postMessage:()=>{}};
 host.__YALLA_NATIVE_AUTOFIX__={point:{latitude:51.48,longitude:7.21},time:now};
 const position=await import('../src/web-position.ts');
 const point=position.recentWebPosition();
 // The cache is attached when the webpage sends its first native request.
 // Prime the listener with a native request but do not await its timeout.
 const controller=new AbortController();
 const {nativeCurrentPosition}=await import('../src/site-bridge.web.ts');
 const native=nativeCurrentPosition(false,controller.signal);
 controller.abort();await native;
 assert.deepEqual(position.recentWebPosition(),host.__YALLA_NATIVE_AUTOFIX__.point);
}));
