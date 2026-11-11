import test from 'node:test';
import assert from 'node:assert/strict';
import {claimDriverSharingAttempt,readDriverSharingConsent,saveDriverSharingConsent,shouldShareDriverInForeground} from '../src/driver-sharing-consent.ts';

test('driver sharing requires consent per account and starts automatically once per ride',()=>{
 const values=new Map();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 assert.equal(claimDriverSharingAttempt(storage,'driver-a','ride-1'),false);
 assert.equal(saveDriverSharingConsent(storage,'driver-a',{allowed:true}),true);
 assert.equal(readDriverSharingConsent(storage,'driver-b').allowed,false);
 assert.equal(claimDriverSharingAttempt(storage,'driver-a','ride-1'),true);
 assert.equal(claimDriverSharingAttempt(storage,'driver-a','ride-1'),false);
 assert.equal(claimDriverSharingAttempt(storage,'driver-a','ride-2'),true);
 assert.equal(saveDriverSharingConsent(storage,'driver-a',{allowed:false}),true);
 assert.equal(claimDriverSharingAttempt(storage,'driver-a','ride-3'),false);
});

test('automatic sharing stays off when the attempt cannot be recorded',()=>{
 const storage={getItem:()=>'{"allowed":true}',setItem:()=>{throw Error('storage unavailable')}};
 assert.equal(claimDriverSharingAttempt(storage,'driver','ride'),false);
});


test('foreground sharing covers browser and failed Android startup while respecting driver consent and stops',()=>{
 assert.equal(shouldShareDriverInForeground({allowed:false},'ride',false,true),false);
 assert.equal(shouldShareDriverInForeground({allowed:true},'ride',false,false),true);
 assert.equal(shouldShareDriverInForeground({allowed:true},'ride',true,false),false);
 const attempted={allowed:true,attemptedRide:'ride'};
 assert.equal(shouldShareDriverInForeground(attempted,'ride',true,true),true);
 assert.equal(shouldShareDriverInForeground(attempted,'ride',false,false),false);
 assert.equal(shouldShareDriverInForeground(attempted,'another-ride',false,false),true);
});
