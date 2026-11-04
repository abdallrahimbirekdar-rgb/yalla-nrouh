import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reduce} from '../src/domain.ts';
import {createLatestWriter,readSaved,emptyDraft} from '../src/persistence.ts';
import {recordFix,newMeter,pauseMeter,fareEstimate,parseAmount} from '../src/meter.ts';
const start=Date.parse('2026-11-04T10:00:00Z');
const tariff={base:1000,perKm:2000,perMinute:100,minimum:1500,updatedAt:new Date(start).toISOString()};
const fix=(seconds,latitude=33.5,accuracy=5)=>({latitude,longitude:36.2,time:start+seconds*1000,accuracy});
test('old saved data migrates with data saver and notifications off, partial draft survives offline restart',()=>{
 const old={...initialState};delete old.preferences;delete old.tariff;
 assert.equal(readSaved(JSON.stringify(old)).state.preferences.dataSaver,true);
 assert.equal(readSaved(JSON.stringify(old)).state.preferences.notifications,false);
 const draft={...emptyDraft,pickup:'داريا',pickupPoint:{latitude:33.5,longitude:36.2}};
 assert.deepEqual(readSaved(JSON.stringify({storageVersion:2,state:initialState,draft})).draft,draft);
 assert.deepEqual(readSaved(JSON.stringify({storageVersion:2,state:initialState,draft:{...draft,pickupPoint:{latitude:999,longitude:1}}})).draft,emptyDraft);
 assert.throws(()=>readSaved('not json'));
});
test('GPS filters fast callbacks, poor accuracy, stale data and stationary drift',()=>{
 const first=recordFix(newMeter(start,tariff),fix(0),start);
 assert.equal(recordFix(first,fix(5,33.51),start+5000),first);
 assert.equal(recordFix(first,fix(10,33.51,80),start+10000),first);
 assert.equal(recordFix(first,fix(10),start+60000),first);
 const still=recordFix(first,fix(10,33.50001),start+10000);
 assert.equal(still.meters,0);assert.equal(still.points.length,1);
 const moved=recordFix(still,fix(20,33.5003),start+20000);
 assert.ok(moved.meters>30&&moved.meters<35);assert.equal(moved.points.length,2);
});
test('GPS gaps and impossible jumps never become charged distance',()=>{
 const first=recordFix(newMeter(start,tariff),fix(0),start);
 const gap=recordFix(first,fix(60,34),start+60000);
 assert.equal(gap.meters,0);assert.equal(gap.incomplete,true);
 const jump=recordFix(first,fix(10,34),start+10000);assert.equal(jump.meters,0);assert.equal(jump.incomplete,true);
 const paused=pauseMeter(first);assert.equal(paused.lastFix,undefined);
 const resumed=recordFix(paused,fix(70,35),start+70000);assert.equal(resumed.meters,0);
});
test('pricing snapshot is fixed for the ride and completed estimate does not keep growing',()=>{
 const m=newMeter(start,tariff);tariff.base=9000;assert.equal(m.tariff.base,1000);tariff.base=1000;
 assert.equal(fareEstimate({...m,meters:2000,endedAt:start+600000},start+3600000),6000);
 assert.equal(fareEstimate(newMeter(start,null),start),null);
 assert.equal(fareEstimate(m,start),1500);
});
test('ride and route recover after restart without bridging the last GPS fix',()=>{
 const draft={...emptyDraft,pickup:'داريا',destination:'دمشق'};let s=reduce(initialState,{type:'create',draft,id:'offline',now:new Date(start).toISOString(),pin:'1234'});
 s=reduce(s,{type:'approve',approved:true});s=reduce(s,{type:'online'});
 for(const to of ['accepted','arrived','riding'])s=reduce(s,{type:'transition',id:'offline',to,actor:'driver',now:new Date(start).toISOString(),pin:'1234'});
 s=reduce(s,{type:'fix',id:'offline',fix:fix(0),now:start});
 s=reduce(s,{type:'fix',id:'offline',fix:fix(10,33.5003),now:start+10000});
 const restored=readSaved(JSON.stringify({storageVersion:2,state:s,draft})).state;
 assert.equal(restored.activeTripId,'offline');assert.equal(restored.trips[0].meter.points.length,2);assert.ok(restored.trips[0].meter.meters>30);
 assert.equal(restored.trips[0].meter.lastFix,undefined);assert.equal(restored.trips[0].meter.incomplete,true);assert.equal(restored.driver.online,false);
});
test('serialized storage coalesces pending changes and never lets an older write finish last',async()=>{
 const seen=[];let release;const block=new Promise(r=>{release=r;});
 const writer=createLatestWriter(async value=>{if(value==='first')await block;seen.push(value);},()=>{});
 const result=writer.enqueue('first');void writer.enqueue('second');void writer.enqueue('newest');release();await result;
 assert.deepEqual(seen,['first','newest']);
});
test('failed storage writes surface an error and latest data can be retried',async()=>{
 let fail=true;const statuses=[],saved=[];const writer=createLatestWriter(async value=>{if(fail)throw Error('disk full');saved.push(value);},ok=>statuses.push(ok));
 await writer.enqueue('latest');assert.deepEqual(statuses,[false]);fail=false;await writer.retry();assert.deepEqual(saved,['latest']);assert.deepEqual(statuses,[false,true]);
});
test('prices accept Arabic numbers and reject ambiguous, negative and infinite values',()=>{
 assert.equal(parseAmount('١٢٫٥'),12.5);for(const value of ['','-1','1,000','Infinity','1e9'])assert.equal(parseAmount(value),null);
});
