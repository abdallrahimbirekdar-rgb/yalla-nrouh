import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {initialState} from '../src/domain.ts';
import {emptyDraft} from '../src/persistence.ts';
const oldState=JSON.stringify({storageVersion:2,state:initialState,draft:emptyDraft});
import {isSiteUrl,externalLink,readShellMessage,bootstrapScript} from '../src/site-shell-policy.ts';
import {loadSiteState,nativeAction} from '../src/site-bridge.web.ts';
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

test('invalid migrated data never replaces an empty website store',()=>withBrowser(async(host,storage)=>{
 host.ReactNativeWebView={postMessage:raw=>{const message=JSON.parse(raw);queueMicrotask(()=>host.dispatchEvent(new CustomEvent('yalla:native-bootstrap',{detail:{id:message.id,savedState:'invalid-data',locationGranted:false}})))}};
 await assert.rejects(loadSiteState(storage,'state'));assert.equal(storage.getItem('state'),null);
}));
