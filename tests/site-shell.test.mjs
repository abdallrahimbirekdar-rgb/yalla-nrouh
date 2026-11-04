import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {initialState} from '../src/domain.ts';
import {loadRecoverable,readSaved,emptyDraft} from '../src/persistence.ts';
const oldState=JSON.stringify({storageVersion:2,state:initialState,draft:emptyDraft});
import {isSiteUrl,externalLink,readShellMessage,bootstrapScript} from '../src/site-shell-policy.ts';
import {loadSiteState,nativeAction,siteMigrationPending} from '../src/site-bridge.web.ts';
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
test('first native launch imports the old APK state; later website state is never overwritten',()=>withBrowser(async(host,storage)=>{
 const requests=[];host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);requests.push(message);queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:message.needsSavedState?oldState:null,locationGranted:true}})))}};
 assert.equal(await loadSiteState(storage,'state'),oldState);assert.equal(host.__YALLA_NATIVE_LOCATION_GRANTED__,true);
 storage.setItem('state','newer-web-state');assert.equal(await loadSiteState(storage,'state'),'newer-web-state');assert.equal(requests[1].needsSavedState,false);
}));
test('notification actions wait for their matching response',()=>withBrowser(async(host)=>{
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);queueMicrotask(()=>{host.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:'wrong-id',ok:true}}));host.dispatchEvent(new CustomEvent('yalla:native-result',{detail:{id:message.id,ok:false}}))})}};
 assert.equal(await nativeAction('alerts-enable'),false);
}));

test('invalid migrated data never replaces an empty website store',()=>withBrowser(async(host,storage,values)=>{
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:'invalid-data',locationGranted:false}})))}};
 assert.equal(await loadSiteState(storage,'state'),null);assert.equal(storage.getItem('state'),null);assert.equal([...values.values()].includes('invalid-data'),true);
}));

test('a dropped first bootstrap message is retried and old data is imported',t=>withBrowser(async(host,storage)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});let requests=0;
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);if(++requests===1)return;host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:oldState,locationGranted:true}}))}};
 const result=loadSiteState(storage,'state');t.mock.timers.tick(1000);
 assert.equal(await result,oldState);assert.equal(requests,2);assert.equal(siteMigrationPending(),false);
}));
test('unavailable native migration does not block opening but prevents overwriting native data',t=>withBrowser(async(host,storage)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});host.ReactNativeWebView={postMessage:()=>{}};
 const result=loadSiteState(storage,'state');t.mock.timers.tick(15000);
 assert.equal(await result,null);assert.equal(siteMigrationPending(),true);assert.equal(storage.getItem('state'),null);
}));
test('existing website data is usable even when the native bridge never responds',t=>withBrowser(async(host,storage)=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});storage.setItem('state',oldState);host.ReactNativeWebView={postMessage:()=>{}};
 const result=loadSiteState(storage,'state');t.mock.timers.tick(3000);
 assert.equal(await result,oldState);assert.equal(siteMigrationPending(),false);
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
