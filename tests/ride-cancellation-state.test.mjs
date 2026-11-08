import assert from 'node:assert/strict';
import test from 'node:test';
import {applyConfirmedCancellations,isUnresolvedRide} from '../src/ride-cancellation-state.ts';

const makeRide=(id,status)=>({
 id,passenger_id:'passenger',driver_id:'driver',pickup:'A',destination:'B',
 pickup_lat:33.5,pickup_lng:36.2,destination_lat:33.6,destination_lng:36.3,
 category:'classic',region:1,status,created_at:'2026-11-08T15:00:00Z',updated_at:'2026-11-08T15:00:00Z',
});

test('confirmed cancellation always stays cancelled when an older accepted read arrives',()=>{
 const older=makeRide('ride-1','accepted');
 const confirmed=new Set(['ride-1']);
 const result=applyConfirmedCancellations([older],confirmed);
 assert.equal(result[0].status,'cancelled');
 assert.equal(isUnresolvedRide(result[0],confirmed),false);
 assert.equal(older.status,'accepted','do not mutate the network result');
});

test('unconfirmed driver rides remain active and are not removed',()=>{
 const active=makeRide('ride-2','arrived');
 const unchanged=applyConfirmedCancellations([active],new Set());
 assert.equal(unchanged[0],active);
 assert.equal(isUnresolvedRide(active,new Set()),true);
});

test('late accepted recovery cannot revive a confirmed cancellation or another ride',()=>{
 const old=makeRide('ride-1','accepted'),next=makeRide('ride-2','accepted');
 const confirmed=new Set(['ride-1']);
 const rows=applyConfirmedCancellations([old,next],confirmed);
 assert.deepEqual(rows.map(row=>row.status),['cancelled','accepted']);
 assert.deepEqual(rows.filter(row=>isUnresolvedRide(row,confirmed)).map(row=>row.id),['ride-2']);
});

test('completed rides are not treated as active rides',()=>{
 assert.equal(isUnresolvedRide(makeRide('ride-3','completed'),new Set()),false);
});
