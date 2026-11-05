import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDriverOffer,parseRoute,createRoutingClient} from '../src/routing.ts';
import {googleDirections} from '../src/google-links.ts';
import {priceForRoute} from '../src/meter.ts';
const from={latitude:33.46,longitude:36.23},to={latitude:33.51,longitude:36.29};
const response={routes:[{distanceMeters:8000,duration:'1200s',polyline:{geoJsonLinestring:{type:'LineString',coordinates:[[36.23,33.46],[36.29,33.51]]}},legs:[{steps:[{distanceMeters:8000,navigationInstruction:{instructions:'تابع السير'}}]}]}]};
test('Google directions links need no key and preserve endpoints and driving mode',()=>{const url=new URL(googleDirections(to,from));assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('destination'),'33.510000,36.290000');assert.equal(url.searchParams.get('origin'),'33.460000,36.230000');assert.equal(url.searchParams.get('travelmode'),'driving');assert.equal(url.searchParams.has('key'),false);});
test('driver navigation lets Google Maps use its own current-location permission',()=>{const url=new URL(googleDirections(to,undefined,true));assert.equal(url.searchParams.get('dir_action'),'navigate');assert.equal(url.searchParams.has('origin'),false);});
test('text addresses work without an in-app geocoding request',()=>{const url=new URL(googleDirections('دمشق & داريا','داريا'));assert.equal(url.searchParams.get('destination'),'دمشق & داريا');assert.equal(url.hostname,'www.google.com');assert.throws(()=>googleDirections(''));assert.throws(()=>googleDirections({latitude:100,longitude:20}));});
test('Google response parser validates geometry and uses road distance, duration and instructions',()=>{const p=parseRoute(response,from,to);assert.equal(p.meters,8000);assert.equal(p.seconds,1200);assert.deepEqual(p.points[0],from);assert.equal(p.steps[0].instruction,'تابع السير');assert.equal(p.provider,'Google Maps');});
test('invalid Google route responses cannot become a road or fare estimate',()=>{assert.throws(()=>parseRoute({},from,to));for(const patch of [{distanceMeters:-1},{duration:'Infinitys'},{duration:'-1s'},{polyline:{geoJsonLinestring:{type:'LineString',coordinates:[[999,200],[36,33]]}}},{legs:[]}])assert.throws(()=>parseRoute({routes:[{...response.routes[0],...patch}]},from,to));});
test('no paid route request is sent until an explicit proxy is configured',async()=>{let count=0;const client=createRoutingClient(undefined,async()=>{count++;throw Error();});await assert.rejects(client.route(from,to),{code:'not_configured'});assert.equal(count,0);});
test('configured route proxy gets a POST with no server API key in the app',async()=>{const realNow=Date.now;let seen;Date.now=()=>100000;try{const client=createRoutingClient('https://example.com',async(url,options)=>{seen={url,options};return new Response(JSON.stringify(response),{status:200});});await client.route(from,to);assert.equal(seen.url,'https://example.com/v1/google/routes');assert.equal(seen.options.method,'POST');assert.equal(seen.options.credentials,'omit');assert.deepEqual(JSON.parse(seen.options.body),{origin:from,destination:to,languageCode:'ar'});assert.equal(seen.options.headers['X-Goog-Api-Key'],undefined);await assert.rejects(client.route(from,to),{code:'busy'});assert.equal((await client.route(from,to,undefined,'ar',undefined,true)).meters,8000);}finally{Date.now=realNow;}});
test('price preview shares the configured minimum/base/km/minute formula with the meter',()=>{const t={base:1000,perKm:2000,perMinute:100,minimum:1500,updatedAt:new Date().toISOString()};assert.equal(priceForRoute(8000,20,t),19000);assert.equal(priceForRoute(0,0,t),1500);assert.equal(priceForRoute(8000,20,null),null);});

test('one driver summary response keeps pickup and passenger road distances separate',async()=>{
 const driver={latitude:33.49,longitude:36.24};
 const leg=(meters,duration,first,last)=>({distanceMeters:meters,duration,polyline:{geoJsonLinestring:{type:'LineString',coordinates:[[first.longitude,first.latitude],[last.longitude,last.latitude]]}},steps:[{distanceMeters:meters,navigationInstruction:{instructions:'Continue'}}]});
 const data={routes:[{legs:[leg(2000,'300s',driver,from),leg(8000,'1200s',from,to)]}],tariff:{base:50,perKm:60,perMinute:10,peakMultiplier:1,updatedAt:'2026-11-05T00:00:00Z'}};
 const parsed=parseDriverOffer(data,driver,from,to);assert.equal(parsed.pickup.meters,2000);assert.equal(parsed.trip.meters,8000);assert.equal(priceForRoute(parsed.trip.meters,parsed.trip.seconds/60,parsed.trip.tariff),730);
 let calls=0;const client=createRoutingClient('https://example.com',async(_url,options)=>{calls++;assert.deepEqual(JSON.parse(options.body).pickup,from);return Response.json(data)});
 const result=await client.driverOffer(driver,from,to);assert.equal(calls,1);assert.equal(result.pickup.seconds,300);assert.equal(result.trip.seconds,1200);
});

test('a zero or incomplete driver approach preserves the passenger route',()=>{
 const route=response.routes[0];
 const trip={...route,steps:route.legs[0].steps};
 const parse=approach=>parseDriverOffer({routes:[{legs:[approach,trip]}]},from,from,to);
 const arrived=parse({duration:'0s'});
 assert.equal(arrived.pickup.meters,0);
 assert.equal(arrived.pickup.seconds,0);
 assert.equal(arrived.trip.meters,8000);
 for(const approach of [null,{}, {distanceMeters:900,duration:'200s'}]){
  const partial=parse(approach);
  assert.equal(partial.pickup,null);
  assert.deepEqual(partial.trip,arrived.trip);
 }
});
