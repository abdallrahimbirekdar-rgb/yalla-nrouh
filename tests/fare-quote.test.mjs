import test from 'node:test';
import assert from 'node:assert/strict';

test('booking quotes store the server-calculated fare without copying Google route details',async()=>{
 const root='https://supabase.invalid',originalFetch=globalThis.fetch;
 let handler,issuance;
 globalThis.Deno={env:{get:name=>name==='SUPABASE_URL'?root:'test-key'},serve:fn=>{handler=fn}};
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'passenger'});
  if(url.endsWith('/consume_google_route_quota'))return Response.json(true);
  if(url.includes('/fare_settings?'))return Response.json([{base:50,per_km:60,per_minute:10,peak_multiplier:1}]);
  if(url.endsWith(':computeRoutes'))return Response.json({routes:[{distanceMeters:8000,duration:'1200s'}]});
  if(url.endsWith('/issue_ride_fare_quote')){
   issuance=JSON.parse(options.body);
   return Response.json('quote-id');
  }
  throw Error('unexpected request '+url);
 };
 const origin={latitude:33.46,longitude:36.23},destination={latitude:33.51,longitude:36.29};
 const request=quote=>new Request('https://proxy.invalid',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({origin,destination,quote})});
 try{
  await import('../backend/fare-route/index.ts');
  const preview=await handler(request(false));
  assert.equal(preview.status,200);
  assert.equal(issuance,undefined);
  const booking=await handler(request(true));
  assert.equal(booking.status,200);
  assert.deepEqual((await booking.json()).quote,{id:'quote-id',fare:730});
  assert.deepEqual(issuance,{p_user:'passenger',p_pickup_lat:33.46,p_pickup_lng:36.23,p_destination_lat:33.51,p_destination_lng:36.29,p_fare:730});
 }finally{globalThis.fetch=originalFetch;delete globalThis.Deno}
});
