import test from 'node:test';
import assert from 'node:assert/strict';
import {pickupQuoteMatches} from '../src/pickup-policy.ts';
const here={latitude:51.48,longitude:7.21};
const north=metres=>({latitude:here.latitude+metres/6371000*180/Math.PI,longitude:here.longitude});
test('a phone move needs a new quote; normal GPS jitter can keep the estimate',()=>{
 assert.equal(pickupQuoteMatches(undefined,here),false);
 assert.equal(pickupQuoteMatches({latitude:NaN,longitude:7.2},here),false);
 assert.equal(pickupQuoteMatches(here,here),true);
 assert.equal(pickupQuoteMatches(here,north(29.9)),true);
 assert.equal(pickupQuoteMatches(here,north(30.1)),false);
 assert.equal(pickupQuoteMatches(here,north(499)),false);
});
