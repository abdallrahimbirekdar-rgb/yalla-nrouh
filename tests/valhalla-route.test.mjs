import test from 'node:test';
import assert from 'node:assert/strict';
import {parseValhallaRoute,getValhallaRoute} from '../src/valhalla-route.ts';

const from={latitude:0,longitude:0},to={latitude:0,longitude:.0001};
const sample={trip:{status:0,units:'kilometers',legs:[{
 shape:'???gE',summary:{length:.012,time:4},maneuvers:[
  {type:1,length:.012,instruction:'Drive east.',begin_shape_index:0},
  {type:6,length:0,instruction:'Your destination is on the left.',begin_shape_index:1},
 ],
}]}};
test('pilot parses polyline6, route units and indexed instructions in Arabic',()=>{
 const route=parseValhallaRoute(sample,from,to,'ar');
 assert.deepEqual(route.points,[from,to]);
 assert.equal(route.meters,12);
 assert.equal(route.steps[1].instruction,'الوجهة على اليسار');
 assert.equal(route.steps[1].shapeIndex,1);
 assert.throws(()=>parseValhallaRoute({...sample,trip:{...sample.trip,units:'miles'}},from,to,'ar'),/response/);
 const invalid=structuredClone(sample);
 invalid.trip.legs[0].maneuvers[1].begin_shape_index=8;
 assert.throws(()=>parseValhallaRoute(invalid,from,to,'en'),/response/);
});
test('pilot sends only route coordinates to Valhalla and identifies itself',async()=>{
 const fetcher=async(url,options)=>{
  const request=new URL(url);
  assert.equal(request.origin,'https://valhalla1.openstreetmap.de');
  assert.deepEqual(JSON.parse(request.searchParams.get('json')).locations,[{lat:0,lon:0},{lat:0,lon:.0001}]);
  assert.equal(options.credentials,'omit');
  assert.equal(options.headers.Authorization,undefined);
  assert.ok(options.headers['X-Client-Id'].endsWith('driver-pilot'));
  return Response.json(sample);
 };
 const route=await getValhallaRoute(from,to,'en',new AbortController().signal,fetcher);
 assert.equal(route.provider,'Valhalla');
});
