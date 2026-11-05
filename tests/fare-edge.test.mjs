import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../backend/fare-route/index.ts',import.meta.url),'utf8'));
const base='https://gokosprcqpdvqgahvquk.supabase.co';
const origin='https://abdallrahimbirekdar-rgb.github.io';
const input={origin:{latitude:33.51,longitude:36.27},destination:{latitude:33.54,longitude:36.30},languageCode:'ar'};
function host({key='private-test-route-key',quota=true,googleStatus=200}={}){
 let handler;const requests=[];
 const env={SUPABASE_URL:base,SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-server-only',...(key?{GOOGLE_ROUTES_API_KEY:key}:{})};
 vm.runInNewContext(source,{Deno:{env:{get:name=>env[name]},serve:value=>{handler=value}},Request,Response,AbortSignal,fetch:async(url,options)=>{
  requests.push({url,options});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});
  if(url.includes('consume_google_route_quota'))return Response.json(quota);
  if(url.includes('fare_settings'))return Response.json([{base:50,per_km:60,per_minute:10,peak_multiplier:1,updated_at:'2026-11-04T00:00:00Z'}]);
  if(url.startsWith('https://routes.googleapis.com/'))return Response.json({routes:[{distanceMeters:5000,duration:'600s'}]},{status:googleStatus});
  throw Error('Unexpected request');
 }});
 const run=(body=input,authorization='Bearer test-user-token',siteOrigin=origin)=>handler(new Request(base+'/functions/v1/fare-route/v1/google/routes',{method:'POST',headers:{origin:siteOrigin,...(authorization?{authorization}:{}),'content-type':'application/json'},body:JSON.stringify(body)}));
 return {run,requests};
}
test('fare proxy blocks unapproved origins, unsigned callers and invalid coordinates',async()=>{
 const app=host();
 assert.equal((await app.run(input,undefined,'https://other.example')).status,403);
 assert.equal((await app.run(input,'')).status,401);
 assert.equal((await app.run({...input,origin:{latitude:999,longitude:0}})).status,400);
 assert.equal(app.requests.filter(r=>r.url.includes('routes.googleapis.com')).length,0);
});
test('a missing server key and exhausted quota never trigger a Google charge',async()=>{
 for(const settings of [{key:null},{quota:false}]){
  const app=host(settings);const result=await app.run();
  assert.equal(result.status,settings.key===null?503:429);
  assert.equal(app.requests.filter(r=>r.url.includes('routes.googleapis.com')).length,0);
 }
});
test('fare proxy returns road data and central rates without exposing secrets',async()=>{
 const app=host();const result=await app.run();assert.equal(result.status,200);
 const body=await result.text();assert.ok(!body.includes('private-test-route-key'));assert.ok(!body.includes('test-server-only'));
 const parsed=JSON.parse(body);assert.equal(parsed.tariff.perKm,60);assert.equal(parsed.routes[0].distanceMeters,5000);
 const outgoing=app.requests.find(r=>r.url.includes('routes.googleapis.com'));
 const payload=JSON.parse(outgoing.options.body);
 assert.equal(payload.routingPreference,'TRAFFIC_UNAWARE');assert.equal(payload.computeAlternativeRoutes,false);assert.equal(payload.polylineQuality,'HIGH_QUALITY');
 assert.deepEqual(payload.origin.location.latLng,input.origin);
 assert.equal(result.headers.get('cache-control'),'no-store');
});
test('Google authorization errors remain errors instead of fake fares',async()=>{
 const app=host({googleStatus:403});const result=await app.run();assert.equal(result.status,502);assert.equal((await result.json()).error,'google_not_enabled');
});
