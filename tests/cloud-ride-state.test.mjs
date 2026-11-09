import test from 'node:test';
import assert from 'node:assert/strict';
import {readRideState,setRideOwner,receiveRideState} from '../src/cloud-ride-state.ts';
test('safe refresh waits for known ride status and active rides prevent it',()=>{
 setRideOwner('owner');assert.equal(readRideState().known,false);
 receiveRideState('owner',[{status:'riding'}]);assert.equal(readRideState().active,true);
 receiveRideState('owner',[{status:'completed'}]);assert.equal(readRideState().active,false);
 setRideOwner(null);assert.deepEqual(readRideState(),{owner:null,known:true,active:false,resume:null});
});
test('late ride responses from a signed-out account cannot affect the next account',()=>{
 setRideOwner('first');setRideOwner('second');receiveRideState('first',[{status:'riding'}]);assert.deepEqual(readRideState(),{owner:'second',known:false,active:false,resume:null});setRideOwner(null);
});

test('a saved active ride is scoped to the owner and removed after a terminal snapshot',()=>{
 const previous=globalThis.localStorage;
 const store=new Map();
 globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 try{
  const id='00000000-0000-4000-8000-000000000001';
  setRideOwner('passenger');
  receiveRideState('passenger',[{id,passenger_id:'passenger',driver_id:'driver',status:'accepted'}]);
  assert.deepEqual(readRideState().resume,{id,status:'accepted'});
  setRideOwner('another');assert.equal(readRideState().resume,null);
  setRideOwner('passenger');assert.equal(readRideState().known,false);
  assert.deepEqual(readRideState().resume,{id,status:'accepted'});
  receiveRideState('passenger',[{id,passenger_id:'passenger',status:'completed'}]);
  assert.equal(readRideState().resume,null);assert.equal(store.size,0);
 }finally{setRideOwner(null);if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous}
});
