import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGoogleMaps,webMapsKey,onMapsAuthFailure} from '../src/map/google-web.ts';
test('web loader requires its own public key and shares one SDK request across maps',async()=>{
 assert.equal(webMapsKey('  '),null);assert.equal(webMapsKey(' web-key '),'web-key');
 await assert.rejects(loadGoogleMaps(null,'ar'),/not_configured/);
 const oldWindow=globalThis.window,oldDocument=globalThis.document;const scripts=[];let removed=0;
 globalThis.window={};globalThis.document={createElement:()=>({remove(){removed++}}),head:{appendChild:script=>scripts.push(script)}};
 try{
  const first=loadGoogleMaps('website-only-key','ar'),second=loadGoogleMaps('website-only-key','ar');
  assert.equal(first,second);assert.equal(scripts.length,1);
  const url=new URL(scripts[0].src);assert.equal(url.origin,'https://maps.googleapis.com');assert.equal(url.searchParams.get('key'),'website-only-key');assert.equal(url.searchParams.get('language'),'ar');
  scripts[0].onerror();await assert.rejects(first,/map_load/);assert.equal(removed,1);
  const retry=loadGoogleMaps('website-only-key','ar');assert.equal(scripts.length,2);
  const maps={marker:{}};globalThis.window.google={maps};globalThis.window.__yallaGoogleMapsReady();assert.equal(await retry,maps);
  let errors=0;const off=onMapsAuthFailure(()=>errors++);globalThis.window.gm_authFailure();assert.equal(errors,1);off();globalThis.window.gm_authFailure();assert.equal(errors,1);
 }finally{globalThis.window=oldWindow;globalThis.document=oldDocument}
});
