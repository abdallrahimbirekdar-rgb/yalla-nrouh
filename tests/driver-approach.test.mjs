import assert from 'node:assert/strict';
import test from 'node:test';
import {driverApproachPath,liveDriverFix} from '../src/driver-approach.ts';

const pickup={latitude:33.511,longitude:36.280};
const taxi={latitude:33.510,longitude:36.270};
const current={point:taxi,time:123_000};
test('hide an outdated driver position instead of showing a false live taxi',()=>{
 assert.equal(liveDriverFix(null,123_000),null);
 assert.equal(liveDriverFix(current,153_000),null);
 assert.equal(liveDriverFix({...current,time:126_500},123_000),null);
 assert.deepEqual(liveDriverFix(current,125_000),current);
});
test('draw only the taxi to customer pickup, not the entire passenger trip',()=>{
 const approach=driverApproachPath(current,pickup,undefined);
 assert.deepEqual(approach.path,[taxi,pickup]);
 assert.equal(approach.fallback,true);
});
test('prefer street route and identify when no live taxi exists',()=>{
 const street=[taxi,{latitude:33.5115,longitude:36.273},pickup];
 assert.deepEqual(driverApproachPath(current,pickup,street),{path:street,fallback:false});
 assert.deepEqual(driverApproachPath(null,pickup,street),{path:undefined,fallback:false});
});
