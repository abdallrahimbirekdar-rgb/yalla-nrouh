import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mapHtml,readMapPoint} from '../src/map/keyless-map-html.ts';
test('native map bridge rejects invalid coordinates and unrelated messages',()=>{
 for(const input of ['null','{}','bad','{"type":"command","point":{"latitude":1,"longitude":2}}','{"type":"point","point":{"latitude":91,"longitude":2}}'])assert.equal(readMapPoint(input),null);
 assert.deepEqual(readMapPoint('{"type":"point","point":{"latitude":33.5,"longitude":36.2}}'),{latitude:33.5,longitude:36.2});
});
test('map tap and marker drag both send selected coordinates to the native form',()=>{
 const events={},sent=[];let markerPosition;const markerEvents={};
 const map={setView(){return this},on(name,handler){events[name]=handler},getBounds(){return {contains:()=>true}}};
 const marker={addTo(){return this},on(name,handler){markerEvents[name]=handler},setLatLng(point){markerPosition=point},getLatLng(){return {wrap:()=>({lat:34,lng:37})}}};
 const context={L:{map:()=>map,divIcon:()=>({}),tileLayer:()=>({addTo(){}}),marker:point=>{markerPosition=point;return marker}},window:{ReactNativeWebView:{postMessage:value=>sent.push(JSON.parse(value))}}};
 const script=Array.from(mapHtml(null,true).matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)[1];vm.runInNewContext(script,context);
 events.click({latlng:{wrap:()=>({lat:33.5,lng:36.2})}});assert.deepEqual(sent[0],{type:'point',point:{latitude:33.5,longitude:36.2}});
 markerEvents.dragend();assert.deepEqual(sent[1],{type:'point',point:{latitude:34,longitude:37}});
 context.window.updatePoint({latitude:35,longitude:38});assert.deepEqual(Array.from(markerPosition),[35,38]);assert.equal(sent.length,2);
});
