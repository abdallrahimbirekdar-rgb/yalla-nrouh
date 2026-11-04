import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {initialState} from '../src/domain.ts';
import {loadRecoverable,readSaved,emptyDraft} from '../src/persistence.ts';
const oldState=JSON.stringify({storageVersion:2,state:initialState,draft:emptyDraft});
import {isSiteUrl,externalLink,readShellMessage,bootstrapScript,locationScript} from '../src/site-shell-policy.ts';
import {loadSiteState,nativeAction,nativeCurrentPosition,siteMigrationPending} from '../src/site-bridge.web.ts';
test('only the exact HTTPS site origin and project path stay inside the app',()=>{
 assert.equal(isSiteUrl('https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/?app=android'),true);
 assert.equal(isSiteUrl('https://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/driver'),true);
 for(const url of ['http://abdallrahimbirekdar-rgb.github.io/yalla-nrouh/','https://abdallrahimbirekdar-rgb.github.io:444/yalla-nrouh/','https://evil@abdallrahimbirekdar-rgb.github.io/yalla-nrouh/','https://abdallrahimbirekdar-rgb.github.io.evil.example/yalla-nrouh/','https://abdallrahimbirekdar-rgb.github.io/other/','file:///yalla-nrouh/','javascript:alert(1)'])assert.equal(isSiteUrl(url),false,url);
 assert.equal(externalLink('https://www.google.com/maps/dir/?api=1'),true);assert.equal(externalLink('tel:+491234'),true);
 assert.equal(externalLink('javascript:alert(1)'),false);assert.equal(externalLink('data:text/html,hello'),false);
});
test('native bridge accepts only bounded typed messages, not arbitrary commands',()=>{
 for(const value of ['null','{}','bad','{"type":"eval","code":"doSomething()"}','{"type":"status","safeToReload":"yes","canGoBack":true}',JSON.stringify({type:'notify',id:'ok',title:'x',body:'x'.repeat(1001)})])assert.equal(readShellMessage(value),null);
 assert.deepEqual(readShellMessage('{"type":"status","safeToReload":false,"canGoBack":true}'),{type:'status',safeToReload:false,canGoBack:true});
});
test('GPS bridge accepts only typed permission requests with bounded IDs',()=>{
 assert.deepEqual(readShellMessage('{"type":"location","id":"gps-1","askPermission":false}'),{type:'location',id:'gps-1',askPermission:false});
 assert.deepEqual(readShellMessage('{"type":"location","id":"gps-2","askPermission":false,"track":true}'),{type:'location',id:'gps-2',askPermission:false,track:true});
 assert.equal(readShellMessage('{"type":"location","id":"gps-2","askPermission":false,"track":"true"}'),null);
 assert.equal(readShellMessage('{"type":"location","id":"gps-1","askPermission":"yes"}'),null);
 assert.equal(readShellMessage('{"type":"location","id":"<script>","askPermission":true}'),null);
});
test('GPS response is serialized safely and invalid coordinates are removed',()=>{
 let payload;
 const context={window:{dispatchEvent:event=>{payload=event.detail}},CustomEvent:class{constructor(_name,options){this.detail=options.detail}}};
 vm.runInNewContext(locationScript('gps-1',{latitude:51.48,longitude:7.21}),context);
 assert.equal(payload.id,'gps-1');assert.equal(payload.point.latitude,51.48);assert.equal(payload.point.longitude,7.21);
 vm.runInNewContext(locationScript('gps-2',{latitude:120,longitude:200}),context);
 assert.equal(payload.point,null);
 vm.runInNewContext(locationScript('gps-3',{latitude:51.48,longitude:7.21},undefined,{accuracy:18,time:1790000000000}),context);
 assert.deepEqual(JSON.parse(JSON.stringify(payload.fix)),{accuracy:18,time:1790000000000});
 vm.runInNewContext(locationScript('gps-4',{latitude:51.48,longitude:7.21},undefined,{accuracy:-1,time:1790000000000}),context);
 assert.equal(payload.fix,undefined);
});
test('saved data is injected as data and cannot execute JavaScript',()=>{
 const text='</script>"});globalThis.pwned=true;//';let detail;
 const context={window:{dispatchEvent:event=>{detail=event.detail}},CustomEvent:class {constructor(_name,options){this.detail=options.detail}}};
 vm.runInNewContext(bootstrapScript('request-1',text,true),context);assert.equal(detail.savedState,text);assert.equal(context.pwned,undefined);
});
async function withBrowser(work){
 const previous={window:globalThis.window,document:globalThis.document};const host=new EventTarget();
 const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 globalThis.window=host;globalThis.document={querySelector:()=>({getAttribute:()=> 'a'.repeat(40)})};
 try{await work(host,storage,values)}finally{globalThis.window=previous.window;globalThis.document=previous.document}
}
test('ordinary browsers read their existing local data without contacting the native bridge',()=>withBrowser(async(_host,storage)=>{
 storage.setItem('state','existing');assert.equal(await loadSiteState(storage,'state'),'existing');
}));
test('the website keeps its own data and never imports an old APK state',()=>withBrowser(async(host,storage)=>{
 const requests=[];
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);requests.push(message);queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:oldState,locationGranted:true}})))}};
 assert.equal(await loadSiteState(storage,'state'),null);
 await new Promise(resolve=>queueMicrotask(resolve));
 assert.equal(storage.getItem('state'),null);
 assert.equal(host.__YALLA_NATIVE_LOCATION_GRANTED__,true);
 assert.equal(requests[0].needsSavedState,false);
 storage.setItem('state','newer-web-state');
 assert.equal(await loadSiteState(storage,'state'),'newer-web-state');
 assert.equal(storage.getItem('state'),'newer-web-state');
 assert.equal(requests[1].needsSavedState,false);
}));
test('native foreground location answers a website request without writing to storage',()=>withBrowser(async(host,storage)=>{
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);
  assert.equal(request.type,'location');assert.equal(request.askPermission,false);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{
   detail:{id:request.id,point:{latitude:51.48,longitude:7.21},error:null}
  })));
 }};
 const response=await nativeCurrentPosition(false);
 assert.deepEqual(response,{point:{latitude:51.48,longitude:7.21},error:null});
 assert.equal(storage.getItem('state'),null);
}));
test('native location permission rejection is explicit',()=>withBrowser(async(host)=>{
 host.ReactNativeWebView={postMessage:raw=>{
  const request=JSON.parse(raw);
  assert.equal(request.askPermission,true);
  queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-position',{
   detail:{id:request.id,point:null,error:'permission'}
  })));
 }};
 assert.deepEqual(await nativeCurrentPosition(true),{point:null,error:'permission'});
}));
test('notification actions wait for their matching response',()=>withBrowser(async(host)=>{
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);queueMicrotask(()=>{host.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:'wrong-id',ok:true}}));host.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:message.id,ok:false}}))})}};
 assert.equal(await nativeAction('alerts-enable'),false);
}));

test('unexpected legacy payloads are ignored without changing website storage',()=>withBrowser(async(host,storage,values)=>{
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:'invalid-data',locationGranted:false}})))}};
 assert.equal(await loadSiteState(storage,'state'),null);
 await new Promise(resolve=>queueMicrotask(resolve));
 assert.equal(storage.getItem('state'),null);
 assert.equal(values.size,0);
}));
test('a missed native reply is retried for optional location status',t=>withBrowser(async(host,storage)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});let requests=0;
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);if(++requests===1)return;host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:oldState,locationGranted:true}}))}};
 assert.equal(await loadSiteState(storage,'state'),null);
 t.mock.timers.tick(1000);
 assert.equal(requests,2);
 assert.equal(host.__YALLA_NATIVE_LOCATION_GRANTED__,true);
 assert.equal(siteMigrationPending(),false);
 assert.equal(storage.getItem('state'),null);
}));
test('missing native reply never delays the map or blocks website saves',t=>withBrowser(async(host,storage)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 host.ReactNativeWebView={postMessage:()=>{}};
 assert.equal(await loadSiteState(storage,'state'),null);
 assert.equal(siteMigrationPending(),false);
 storage.setItem('state',oldState);
 t.mock.timers.tick(5000);
 assert.equal(storage.getItem('state'),oldState);
}));
test('existing website data is returned immediately without native response',t=>withBrowser(async(host,storage)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 storage.setItem('state',oldState);
 host.ReactNativeWebView={postMessage:()=>{}};
 assert.equal(await loadSiteState(storage,'state'),oldState);
 assert.equal(siteMigrationPending(),false);
 t.mock.timers.tick(5000);
}));
test('malformed saved data is backed up unchanged before a readable replacement is stored',async()=>{
 const broken=JSON.stringify({storageVersion:2,state:{...initialState,trips:[{oldFormat:true}]},draft:{...emptyDraft,pickup:'Old pickup'}});
 const data=new Map([['state',broken]]);const writes=[];
 const result=await loadRecoverable(k=>data.get(k)??null,(k,v)=>{writes.push(k);data.set(k,v)},'state');
 assert.equal(result.recovered,true);assert.match(writes[0],/^state-recovery-/);assert.equal(data.get(writes[0]),broken);assert.equal(writes[1],'state');
 assert.equal(readSaved(result.raw).draft.pickup,'Old pickup');assert.deepEqual(readSaved(result.raw).state.trips,[]);
});
test('valid data is not rewritten and failed backup or reads never erase the original',async()=>{
 const writes=[];const result=await loadRecoverable(()=>oldState,(k,v)=>writes.push([k,v]),'state');assert.equal(result.raw,oldState);assert.equal(result.recovered,false);assert.equal(writes.length,0);
 await assert.rejects(loadRecoverable(()=>{throw Error('disk read failed')},()=>writes.push('unexpected'),'state'));assert.equal(writes.length,0);
 await assert.rejects(loadRecoverable(()=>'{broken',()=>{throw Error('backup failed')},'state'));
});
