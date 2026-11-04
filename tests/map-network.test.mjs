import test from 'node:test';
import assert from 'node:assert/strict';
import {mapNetwork,mapPolicy} from '../src/map/network-policy.ts';
import {TileQueue} from '../src/map/tile-queue.ts';
test('passive network hints select conservative maps without treating unknown speed as offline',()=>{
 assert.equal(mapNetwork({}),'normal');
 assert.equal(mapNetwork({offline:true,downlink:10}),'offline');
 for(const hints of [{generation:'2g'},{generation:'3g'},{effectiveType:'slow-2g'},{downlink:0.4},{rtt:900},{saveData:true},{expensive:true}])assert.equal(mapNetwork(hints),'limited');
 assert.equal(mapNetwork({generation:'5g',downlink:20,rtt:50}),'normal');
 assert.equal(mapPolicy('offline',false).tileConcurrency,0);
 assert.equal(mapPolicy('limited',false).tileConcurrency,4);
 assert.equal(mapPolicy('normal',false).tileConcurrency,12);
 assert.equal(mapPolicy('normal',true).lean,true);
});
test('visible tile queue responds to slowdown, offline and reconnection without restarting active loads',()=>{
 const q=new TileQueue(2),started=[],done=[];
 for(let i=0;i<5;i++)q.add(finish=>{started.push(i);done.push(finish)});
 assert.deepEqual(started,[0,1]);q.setLimit(1);done[0]();assert.deepEqual(started,[0,1]);
 q.setLimit(0);done[1]();assert.deepEqual(started,[0,1]);
 q.setLimit(2);assert.deepEqual(started,[0,1,2,3]);
 done[1]();assert.equal(started.length,4); // duplicate load/error events are harmless
 done[2]();assert.deepEqual(started,[0,1,2,3,4]);
 q.dispose();q.add(()=>assert.fail('disposed map must not load tiles'));
});
