import assert from 'node:assert/strict';
import test from 'node:test';
import {readRidePushTarget} from '../src/ride-push-target.ts';
import {readWebMessage} from '../src/android-fresh/bridge.ts';

test('only recognized ride events and UUIDs are routed from notification taps',()=>{
 const rideId='00000000-0000-4000-8000-000000000001';
 for(const type of ['driver-offer','passenger-accepted','passenger-arrived']){
  const target={rideId,type};
  assert.deepEqual(readRidePushTarget({...target,url:'https://unknown.invalid/'}),target);
  assert.deepEqual(readWebMessage(JSON.stringify({type:'notify',id:'message',title:'x',body:'y',target})).target,target);
 }
 assert.equal(readRidePushTarget({type:'driver-offer',rideId:'/admin'}),null);
 assert.equal(readRidePushTarget({type:'url',rideId}),null);
});
