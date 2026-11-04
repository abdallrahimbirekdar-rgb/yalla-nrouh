import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPosition} from '../src/current-position.ts';
const base=()=>({permission:async()=>({granted:true}),requestPermission:async()=>{throw Error('unexpected prompt')},services:async()=>true,position:async()=>({coords:{latitude:51.48,longitude:7.21}})});
test('home auto-centre reads an existing grant and returns only a valid coordinate',async()=>{
 assert.deepEqual(await currentPosition(base(),false),{latitude:51.48,longitude:7.21});
 const adapter=base();adapter.permission=async()=>({granted:false});adapter.position=async()=>{throw Error('must not read position without consent')};
 await assert.rejects(currentPosition(adapter,false),e=>e.code==='permission');
});
test('manual locate can request consent but never reads after denial or disabled GPS',async()=>{
 const adapter=base();adapter.permission=async()=>({granted:false});let prompts=0,fixes=0;
 adapter.requestPermission=async()=>{prompts++;return {granted:false}};adapter.position=async()=>{fixes++;return {coords:{latitude:0,longitude:0}}};
 await assert.rejects(currentPosition(adapter,true),e=>e.code==='permission');assert.equal(prompts,1);assert.equal(fixes,0);
 adapter.requestPermission=async()=>({granted:true});assert.deepEqual(await currentPosition(adapter,true),{latitude:0,longitude:0});
 adapter.services=async()=>false;await assert.rejects(currentPosition(adapter,true),e=>e.code==='services');assert.equal(fixes,1);
});
test('GPS errors, invalid coordinates and timeouts are recoverable without an endless spinner',async()=>{
 const adapter=base();adapter.position=async()=>({coords:{latitude:100,longitude:7}});await assert.rejects(currentPosition(adapter,false),e=>e.code==='position');
 adapter.position=async()=>{throw Error('GPS unavailable')};await assert.rejects(currentPosition(adapter,false),e=>e.code==='position');
 adapter.position=()=>new Promise(()=>{});await assert.rejects(currentPosition(adapter,false,5),e=>e.code==='timeout');
});
test('a timed-out permission request cannot start a late location read',async()=>{
 const adapter=base();let complete,fixes=0;adapter.permission=()=>new Promise(resolve=>complete=resolve);adapter.position=async()=>{fixes++;return {coords:{latitude:0,longitude:0}}};
 await assert.rejects(currentPosition(adapter,false,5),e=>e.code==='timeout');complete({granted:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(fixes,0);
});
