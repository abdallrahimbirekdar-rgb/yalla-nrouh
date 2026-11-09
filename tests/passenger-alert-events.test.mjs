import assert from 'node:assert/strict';
import test from 'node:test';
import {passengerAlertEvent} from '../src/passenger-alert-events.ts';

const now=Date.parse('2026-11-09T12:00:00Z');
const ride={id:'ride-1',driver_id:'driver-1',status:'accepted',updated_at:new Date(now-4000).toISOString()};

test('passenger notifications identify confirmed acceptance and arrival separately',()=>{
 assert.deepEqual(passengerAlertEvent(ride,now),{key:'ride-1:driver-1:accepted',status:'accepted'});
 assert.deepEqual(passengerAlertEvent({...ride,status:'arrived'},now),{key:'ride-1:driver-1:arrived',status:'arrived'});
 assert.equal(passengerAlertEvent({...ride,driver_id:'driver-2'},now)?.key,'ride-1:driver-2:accepted');
 assert.equal(passengerAlertEvent({...ride,updated_at:new Date(now).toISOString()},now)?.key,passengerAlertEvent(ride,now)?.key);
});

test('unassigned, inactive and stale rides do not emit passenger notifications',()=>{
 for(const change of [
  {driver_id:null},{status:'requested'},{status:'riding'},{status:'completed'},{status:'cancelled'},
  {updated_at:'invalid'},{updated_at:new Date(now-120001).toISOString()},{updated_at:new Date(now+15001).toISOString()},
 ])assert.equal(passengerAlertEvent({...ride,...change},now),null);
});
