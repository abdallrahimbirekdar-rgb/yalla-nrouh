import test from 'node:test';
import assert from 'node:assert/strict';
import {siteCurrentPosition} from '../src/site-bridge.web.ts';
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

test('a fast browser fix is not blocked by an unresponsive Android GPS bridge',async()=>withLocationBrowser({
 permissions:{query:async()=>({state:'granted'})},
 geolocation:{getCurrentPosition:(success,error,options)=>{
  if(options.enableHighAccuracy){error({code:3});return}
  assert.equal(options.maximumAge,30000);
  assert.equal(options.timeout,6500);
  queueMicrotask(()=>success({coords:{latitude:51.48,longitude:7.21,accuracy:90}}));
 }}
},async host=>{
 let requests=0;host.ReactNativeWebView={postMessage:raw=>{requests++;assert.equal(JSON.parse(raw).type,'location')}};
 const start=Date.now();
 assert.deepEqual(await siteCurrentPosition(false),{latitude:51.48,longitude:7.21});
 assert.equal(requests,1);
 assert.ok(Date.now()-start<1000,'first fix should not wait for native timeout');
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
