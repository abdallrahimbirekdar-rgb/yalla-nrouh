import test from 'node:test';
import assert from 'node:assert/strict';
import {mapNetwork,mapPolicy} from '../src/map/network-policy.ts';
test('passive network hints select conservative maps without treating unknown speed as offline',()=>{
 assert.equal(mapNetwork({}),'normal');
 assert.equal(mapNetwork({offline:true,downlink:10}),'offline');
 for(const hints of [{generation:'2g'},{generation:'3g'},{effectiveType:'slow-2g'},{downlink:0.4},{rtt:900},{saveData:true},{expensive:true}])assert.equal(mapNetwork(hints),'limited');
 assert.equal(mapNetwork({generation:'5g',downlink:20,rtt:50}),'normal');
 assert.equal(mapPolicy('offline',false).lean,true);
 assert.equal(mapPolicy('limited',false).lean,true);
 assert.equal(mapPolicy('normal',false).lean,false);
 assert.equal(mapPolicy('normal',true).lean,true);
});
