import assert from 'node:assert/strict';
import test from 'node:test';
import {cancellationReasonOptions} from '../src/ride-cancellation-options.ts';

test('a driver can choose the usual cancellation reasons before arriving',()=>{
 const ids=cancellationReasonOptions('driver',false).map(([id])=>id);
 assert.ok(ids.includes('vehicle_problem'));
 assert.ok(ids.includes('emergency'));
 assert.ok(ids.includes('other'));
 assert.ok(!ids.includes('passenger_not_found'));
});

test('a driver who arrived may report a missing passenger',()=>{
 const ids=cancellationReasonOptions('driver',true).map(([id])=>id);
 assert.ok(ids.includes('passenger_not_found'));
});

test('passenger cancellation reasons stay available',()=>{
 const ids=cancellationReasonOptions('passenger',false).map(([id])=>id);
 assert.ok(ids.includes('changed_plans'));
 assert.ok(ids.includes('wait_too_long'));
});
