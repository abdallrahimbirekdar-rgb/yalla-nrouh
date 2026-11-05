import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingOfferChimes,playOfferChime,rememberOfferChimes} from '../src/driver-offer-chime.ts';

test('new active offers chime once across refreshed snapshots',()=>{
 const offers=[{ride_id:'new',expiresOnDevice:600},{ride_id:'old',expiresOnDevice:300},{ride_id:'new',expiresOnDevice:600}];
 const heard={other:799000};
 assert.deepEqual(pendingOfferChimes(offers,heard,400,800000),['new']);
 const saved=rememberOfferChimes(heard,['new'],800000);
 assert.deepEqual(pendingOfferChimes(offers,saved,450,800050),[]);
 assert.deepEqual(rememberOfferChimes({old:1},['new'],800000),{new:800000});
});

test('the two-note alert plays only when audio is unlocked',()=>{
 const starts=[],stops=[],frequencies=[];
 const context={
  state:'suspended',currentTime:5,destination:{},
  createOscillator(){const frequency={value:0};frequencies.push(frequency);return {frequency,connect:node=>node,start:time=>starts.push(time),stop:time=>stops.push(time)}},
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}},
 };
 assert.equal(playOfferChime(context),false);
 assert.deepEqual(starts,[]);
 context.state='running';
 assert.equal(playOfferChime(context),true);
 assert.deepEqual(frequencies.map(note=>note.value),[740,988]);
 assert.equal(starts.length,2);
 assert.equal(stops.length,2);
 assert.ok(starts[1]>stops[0]);
});
