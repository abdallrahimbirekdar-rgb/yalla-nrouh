import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceMeters,navigationProgress} from '../src/navigation-progress.ts';
const plan={from:{latitude:0,longitude:0},to:{latitude:.01,longitude:0},meters:4000,seconds:600,points:[{latitude:0,longitude:0},{latitude:0,longitude:.01},{latitude:.01,longitude:.01},{latitude:.01,longitude:0}],steps:[{instruction:'Go east',meters:1333},{instruction:'Turn left',meters:1334},{instruction:'Turn left again',meters:1333}],provider:'Google Maps'};
test('navigation follows the road polyline rather than a straight line to the destination',()=>{
 const position={latitude:0,longitude:.01};const progress=navigationProgress(plan,position);
 assert.ok(progress.remainingMeters>2600&&progress.remainingMeters<2700);
 assert.ok(progress.remainingMeters>distanceMeters(position,plan.to));assert.ok(progress.offRouteMeters<1);
 assert.equal(progress.instruction,'Turn left');
});
test('navigation detects arrival and off-route location without advancing ride status',()=>{
 assert.equal(navigationProgress(plan,plan.to).arrived,true);
 assert.ok(navigationProgress(plan,{latitude:.05,longitude:.05}).offRouteMeters>100);
 assert.equal(navigationProgress(plan,plan.from).remainingMeters,4000);
 assert.equal(navigationProgress(plan,plan.to).remainingMeters,0);
});
test('zero-length geometry is bounded and has no invented progress',()=>{
 const p={...plan,points:[plan.from,plan.from],meters:0,seconds:0,steps:[]};const result=navigationProgress(p,plan.from);
 assert.equal(result.remainingMeters,0);assert.equal(result.instruction,'');assert.ok(Number.isFinite(result.remainingSeconds));
});
test('Valhalla times a turn by its point on the shape, independently of leg distance estimates',()=>{
 const p={...plan,provider:'Valhalla',steps:[
  {instruction:'Start',meters:2000,shapeIndex:0},
  {instruction:'Turn left',meters:500,shapeIndex:1},
  {instruction:'Turn left again',meters:1500,shapeIndex:2},
 ]};
 const before=navigationProgress(p,{latitude:.00004,longitude:.009});
 assert.equal(before.nextInstruction,'Turn left');
 assert.ok(before.nextTurnMeters>100&&before.nextTurnMeters<120);
 assert.ok(before.offRouteMeters>4&&before.offRouteMeters<5);
 assert.equal(before.snapped.latitude,0);
 const after=navigationProgress(p,{latitude:.001,longitude:.01});
 assert.equal(after.nextInstruction,'Turn left again');
});
