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
test('remaining road line starts at the taxi and ends at pickup without showing the journey',()=>{
 const taxi={latitude:0,longitude:.01};
 const result=navigationProgress(plan,taxi);
 assert.deepEqual(result.remainingPath[0],taxi);
 assert.deepEqual(result.remainingPath.at(-1),plan.to);
 assert.ok(result.remainingPath.length>=3);
 assert.ok(!result.remainingPath.some(point=>point.latitude===0&&point.longitude===0));
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
