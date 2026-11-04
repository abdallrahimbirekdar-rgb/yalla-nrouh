import test from 'node:test';
import assert from 'node:assert/strict';
import {readRideState,setRideOwner,receiveRideState} from '../src/cloud-ride-state.ts';
test('safe refresh waits for known ride status and active rides prevent it',()=>{
 setRideOwner('owner');assert.equal(readRideState().known,false);
 receiveRideState('owner',[{status:'riding'}]);assert.equal(readRideState().active,true);
 receiveRideState('owner',[{status:'completed'}]);assert.equal(readRideState().active,false);
 setRideOwner(null);assert.deepEqual(readRideState(),{owner:null,known:true,active:false});
});
test('late ride responses from a signed-out account cannot affect the next account',()=>{
 setRideOwner('first');setRideOwner('second');receiveRideState('first',[{status:'riding'}]);assert.deepEqual(readRideState(),{owner:'second',known:false,active:false});setRideOwner(null);
});
