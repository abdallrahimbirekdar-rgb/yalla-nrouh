import test from 'node:test';
import assert from 'node:assert/strict';
import {pickupAllowed} from '../src/pickup-policy.ts';
const here={latitude:51.48,longitude:7.21};
const north=metres=>({latitude:here.latitude+metres/6371000*180/Math.PI,longitude:here.longitude});
test('pickup requires a real position and accepts only points within 500 metres',()=>{
 assert.equal(pickupAllowed(here,null),false);
 assert.equal(pickupAllowed(undefined,here),false);
 assert.equal(pickupAllowed({latitude:NaN,longitude:7.2},here),false);
 assert.equal(pickupAllowed(here,here),true);
 assert.equal(pickupAllowed(north(499.99),here),true);
 assert.equal(pickupAllowed(north(500.01),here),false);
 assert.equal(pickupAllowed({latitude:33.5,longitude:36.3},here),false);
});
