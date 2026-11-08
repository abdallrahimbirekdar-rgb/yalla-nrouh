import assert from 'node:assert/strict';
import test from 'node:test';
import {nextGoogleReset,quotaRemaining,serviceMetrics,usageSnapshotExpired,validUsageDate} from '../src/service-usage.ts';
test('Google usage renews at Pacific midnight, not at UTC midnight',()=>{
 const past=new Date('2026-12-01T07:59:59Z'),renewed=new Date('2026-12-01T08:00:00Z');
 const old={used:400,resets_on:'2026-12-01',recorded_at:'2026-11-30T18:00:00Z'};
 assert.equal(nextGoogleReset(past),'2026-12-01');
 assert.equal(nextGoogleReset(renewed),'2027-01-01');
 assert.equal(usageSnapshotExpired(serviceMetrics.google[0],old,past),false);
 assert.equal(usageSnapshotExpired(serviceMetrics.google[0],old,renewed),true);
});
test('usage indicates near and exceeded limits without negative remaining quota',()=>{
 assert.deepEqual(quotaRemaining(80,100),{remaining:20,ratio:.8,state:'near'});
 assert.deepEqual(quotaRemaining(120,100),{remaining:0,ratio:1,state:'limit'});
 assert.equal(validUsageDate('2026-02-29'),false);
 assert.equal(validUsageDate('2028-02-29'),true);
});
