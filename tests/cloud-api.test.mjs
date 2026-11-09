import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudSignIn,cloudSignOut,cloudSignUp,cloudGetToken,cloudWhoAmI,
  cloudRequestRide,cloudRideOperation,cloudMutationUncertain,cloudCancelRide,cloudCancelRideWithReason,cloudReleaseRide,CloudError
} from '../src/cloud-api.ts';

const token='test-access-token-for-requests';
const requestId='00000000-0000-4000-8000-000000000001';
const draft={
  pickup:'First test point',destination:'Second test point',region:0,
  category:'classic',intercity:false,
  pickupPoint:{latitude:33.458,longitude:36.236},
  destinationPoint:{latitude:33.53,longitude:36.29}
};

function withFetch(mock,work){
 const previous=globalThis.fetch;globalThis.fetch=mock;
 return Promise.resolve().then(work).finally(()=>{globalThis.fetch=previous;cloudSignOut()});
}
function reply(data,status=200){
 return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)};
}

test('sign-in uses only the publishable API key and keeps access token in memory',async()=>{
 await withFetch(async (url,options)=>{
   assert.match(url,/\/auth\/v1\/token\?grant_type=password$/);
   assert.equal(options.method,'POST');
   assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
   assert.equal(options.headers.Authorization,undefined);
   assert.deepEqual(JSON.parse(options.body),{email:'test@example.com',password:'strong-password'});
   return reply({access_token:token});
 },async()=>{
   const result=await cloudSignIn(' test@example.com ','strong-password');
   assert.equal(result,token);assert.equal(cloudGetToken(),token);
 });
 assert.equal(cloudGetToken(),null);
});

test('invalid signup and missing authentication fail before a network request',async()=>{
 await withFetch(()=>{throw Error('no outgoing request expected')},async()=>{
   await assert.rejects(()=>cloudSignUp('bad','long-enough'),e=>e instanceof CloudError&&e.kind==='invalid_credentials');
   await assert.rejects(()=>cloudSignUp('test@example.com','short'),e=>e instanceof CloudError&&e.kind==='invalid_credentials');
   await assert.rejects(()=>cloudWhoAmI(''),e=>e instanceof CloudError&&e.kind==='login_required');
   await assert.rejects(()=>cloudCancelRide('','some-ride'),e=>e instanceof CloudError&&e.kind==='login_required');
 });
});

test('ride request needs two valid map coordinates',async()=>{
 await withFetch(()=>{throw Error('should not contact backend')},async()=>{
   await assert.rejects(()=>cloudRequestRide(token,{...draft,destinationPoint:undefined},requestId),e=>e instanceof CloudError&&e.kind==='select_map_points');
   await assert.rejects(()=>cloudRequestRide(token,{...draft,pickupPoint:{latitude:123,longitude:7}},requestId),e=>e instanceof CloudError&&e.kind==='select_map_points');
 });
});

test('ride request routes a Daraya pickup to Rural Damascus regardless of the saved region',async()=>{
 await withFetch(async (url,options)=>{
   assert.match(url,/\/rest\/v1\/rpc\/request_ride_once$/);
   assert.equal(options.method,'POST');
   assert.equal(options.headers.Authorization,'Bearer '+token);
   const payload=JSON.parse(options.body);
   assert.deepEqual(payload,{
     p_request_id:requestId,p_pickup:'First test point',p_destination:'Second test point',
     p_pickup_lat:33.458,p_pickup_lng:36.236,p_destination_lat:33.53,p_destination_lng:36.29,
     p_region:1,p_category:'classic'
   });
   return reply('00000000-0000-4000-8000-000000000000');
 },async()=>{
   const result=await cloudRequestRide(token,draft,requestId);
   assert.equal(result,'00000000-0000-4000-8000-000000000000');
 });
});

test('a quoted ride submits the opaque quote ID and no user-entered fare',async()=>{
 const quoteId='00000000-0000-4000-8000-000000000004';
 await withFetch(async(url,options)=>{
   assert.match(url,/request_ride_with_fare$/);
   const payload=JSON.parse(options.body);
   assert.equal(payload.p_quote_id,quoteId);
   assert.equal(payload.p_request_id,requestId);
   assert.equal(payload.p_fare,undefined);
   return reply(requestId);
 },async()=>assert.equal(await cloudRequestRide(token,draft,requestId,quoteId),requestId));
});

test('a pickup note uses the same quoted booking payload and request ID',async()=>{
 const quoteId='00000000-0000-4000-8000-000000000004';
 const calls=[];
 await withFetch(async(url,options)=>{
   calls.push([url.split('/').at(-1),JSON.parse(options.body)]);
   return reply(requestId);
 },async()=>{
   assert.equal(await cloudRequestRide(token,draft,requestId,quoteId,'  عند الباب الجانبي  '),requestId);
   assert.equal(await cloudRequestRide(token,draft,requestId,quoteId,'  '),requestId);
 });
 assert.equal(calls[0][0],'request_ride_with_pickup_note');
 assert.equal(calls[1][0],'request_ride_with_fare');
 assert.deepEqual(calls[0][1],{...calls[1][1],p_pickup_note:'عند الباب الجانبي'});
 assert.equal(calls[0][1].p_request_id,requestId);
 assert.equal(calls[0][1].p_quote_id,quoteId);
});

test('an ambiguous ride submission can be checked and retried with the same request ID',async()=>{
 const owner='00000000-0000-4000-8000-000000000002';
 const ride={id:'00000000-0000-4000-8000-000000000003',passenger_id:owner,status:'requested'};
 let attempts=0;
 await withFetch(async(url,options)=>{
   if(options.method==='POST'){
     assert.equal(JSON.parse(options.body).p_request_id,requestId);
     if(++attempts===1)throw Error('response lost after commit');
     return reply(ride.id);
   }
   const query=new URL(url).searchParams;
   assert.equal(query.get('client_request_id'),'eq.'+requestId);
   assert.equal(query.get('passenger_id'),'eq.'+owner);
   return reply([ride]);
 },async()=>{
   await assert.rejects(()=>cloudRequestRide(token,draft,requestId),cloudMutationUncertain);
   assert.deepEqual(await cloudRideOperation(token,'request',requestId,owner),ride);
   assert.equal(await cloudRequestRide(token,draft,requestId),ride.id);
 });
 assert.equal(cloudMutationUncertain(new CloudError(400,'23505')),false);
});

test('server authorization failures are returned as coded errors',async()=>{
 await withFetch(async()=>reply({code:'not_admin',message:'not_admin'},403),async()=>{
   await assert.rejects(()=>cloudWhoAmI(token),e=>e instanceof CloudError&&e.status===403&&e.kind==='not_admin');
 });
});

test('failed network calls return a network error without a false success',async()=>{
 await withFetch(async()=>{throw Error('connection lost')},async()=>{
   await assert.rejects(()=>cloudWhoAmI(token),e=>e instanceof CloudError&&e.kind==='network');
 });
});

test('driver release uses the assigned-ride RPC, not unrestricted table writes',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 await withFetch(async (url,options)=>{
   assert.match(url,/\/rest\/v1\/rpc\/release_ride$/);
   assert.equal(options.headers.Authorization,'Bearer '+token);
   assert.deepEqual(JSON.parse(options.body),{p_ride_id:id});
   return reply(true);
 },async()=>assert.equal(await cloudReleaseRide(token,id),true));
});

test('saved places belong to the signed-in account and survive a new login',async()=>{
 const {cloudSavedPlaces,cloudSavePlaces}=await import('../src/cloud-api.ts');
 const places=[{id:'home',label:'Home',coordinate:{latitude:51.48,longitude:7.21}}];
 let stored=[];
 await withFetch(async(url,options)=>{
  assert.match(url,/\/auth\/v1\/user$/);
  assert.equal(options.headers.Authorization,'Bearer '+token);
  if(options.method==='PUT'){
   const payload=JSON.parse(options.body);
   assert.deepEqual(Object.keys(payload.data),['yalla_saved_places']);
   stored=payload.data.yalla_saved_places;
  }
  return reply({id:'user-one',user_metadata:{other_setting:true,yalla_saved_places:stored}});
 },async()=>{
  assert.deepEqual(await cloudSavedPlaces(token),[]);
  assert.deepEqual(await cloudSavePlaces(token,places),places);
  cloudSignOut();
  assert.deepEqual(await cloudSavedPlaces(token),places);
  assert.deepEqual(await cloudSavePlaces(token,[]),[]);
 });
});
test('saved places validate coordinates and do not report success after a failed save',async()=>{
 const {parseSavedPlaces,cloudSavePlaces}=await import('../src/cloud-api.ts');
 assert.deepEqual(parseSavedPlaces([{id:'bad',label:'Home',coordinate:{latitude:200,longitude:7}}]),[]);
 await withFetch(async()=>reply({code:'unauthorized'},401),async()=>{
  await assert.rejects(()=>cloudSavePlaces(token,[]),e=>e instanceof CloudError&&e.status===401);
 });
});

test('central fare settings read numeric server values and block non-admin updates',async()=>{
 const {cloudFareSettings,cloudUpdateFareSettings}=await import('../src/cloud-api.ts');
 await withFetch(async(url,options)=>{
  if(url.includes('/rpc/is_staff_admin'))return reply(false);
  assert.equal(options.method,'GET');
  return reply([{base:'50',per_km:'60',per_minute:'10',peak_multiplier:'1',updated_at:'2026-11-04T00:00:00Z'}]);
 },async()=>{
  const tariff=await cloudFareSettings(token);assert.equal(tariff.perKm,60);
  await assert.rejects(()=>cloudUpdateFareSettings(token,tariff),e=>e instanceof CloudError&&e.kind==='not_admin');
 });
});

test('signed-in requests resolve a refreshed access token before calling the server',async()=>{
 const {cloudSetSessionBridge}=await import('../src/cloud-api.ts');let current=token;
 cloudSetSessionBridge(()=>current,async()=>{current='refreshed-user-access-token';return current});
 try{await withFetch(async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer refreshed-user-access-token');return reply({id:'owner'})},async()=>assert.equal((await cloudWhoAmI(token)).id,'owner'))}
 finally{cloudSetSessionBridge(null,null)}
});
test('stale requests cannot borrow the next signed-in account session',async()=>{
 const {cloudSetSessionBridge}=await import('../src/cloud-api.ts');
 cloudSetSessionBridge(()=>'other-account-access-token',async()=>{throw Error('must not resolve a different account')});
 try{await withFetch(()=>{throw Error('must not send stale request')},async()=>assert.rejects(()=>cloudWhoAmI(token),e=>e.status===401))}
 finally{cloudSetSessionBridge(null,null)}
});

test('driver starts the ride with one request and no pickup confirmation',async()=>{
 const {cloudAdvanceRide}=await import('../src/cloud-api.ts');
 const ride='00000000-0000-4000-8000-000000000004';
 const requests=[];
 await withFetch(async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});
  return reply('riding');
 },async()=>assert.equal(await cloudAdvanceRide(token,ride,'riding'),'riding'));
 assert.equal(requests.length,1);
 assert.match(requests[0].url,/\/rpc\/advance_ride$/);
 assert.deepEqual(requests[0].body,{p_ride_id:ride,p_next:'riding',p_pin:null});
});
test('admin adds a verified driver email through a restricted server RPC',async()=>{
 const {cloudAdminAddDriverByEmail}=await import('../src/cloud-api.ts');
 await withFetch(async(url,options)=>{
  assert.match(url,/\/rpc\/admin_add_driver_by_email$/);
  assert.equal(options.headers.Authorization,'Bearer '+token);
  assert.deepEqual(JSON.parse(options.body),{p_email:'driver@example.com',p_region:0,p_category:'classic'});
  return reply(true);
 },async()=>assert.equal(await cloudAdminAddDriverByEmail(token,' Driver@Example.com '),true));
});

test('driver inbox renews a stale online session before requesting matching rides',async()=>{
 const {cloudDriverInbox}=await import('../src/cloud-api.ts');const original=globalThis.fetch;const calls=[];
 const oldDriver={user_id:'driver',region:0,category:'classic',approved:true,online:true,last_seen_at:'2026-01-01T00:00:00Z'};
 globalThis.fetch=async(url)=>{calls.push(String(url));if(String(url).includes('/driver_accounts?'))return reply([oldDriver]);if(String(url).endsWith('/driver_heartbeat'))return reply(true);if(String(url).endsWith('/open_ride_estimated_previews')){assert.match(calls.at(-2),/driver_heartbeat$/);return reply([{ride_id:'pending-request',region:0,category:'classic',estimated_fare:550,remaining_ms:90000}])}throw Error('unexpected call')};
 try{const inbox=await cloudDriverInbox('test-driver-token');assert.equal(inbox.offers[0].ride_id,'pending-request');assert.equal(calls.length,3)}finally{globalThis.fetch=original}
});
test('offline drivers never renew availability or read ride previews',async()=>{
 const {cloudDriverInbox}=await import('../src/cloud-api.ts');const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return reply([{approved:true,online:false}])};
 try{assert.deepEqual((await cloudDriverInbox('test-driver-token')).offers,[]);assert.equal(calls,1)}finally{globalThis.fetch=original}
});

test('driver route preview requests only the scoped RPC and validates the ride endpoints',async()=>{
 const {cloudDriverRidePreview}=await import('../src/cloud-api.ts');const id='00000000-0000-4000-8000-000000000010';
 await withFetch(async(url,options)=>{assert.match(String(url),/\/rpc\/driver_ride_preview$/);assert.deepEqual(JSON.parse(options.body),{p_ride_id:id});return reply([{ride_id:id,pickup_lat:33.5,pickup_lng:36.2,destination_lat:33.6,destination_lng:36.3}])},async()=>{assert.equal((await cloudDriverRidePreview(token,id)).ride_id,id)});
 await withFetch(async()=>reply([]),async()=>{await assert.rejects(cloudDriverRidePreview(token,id),error=>error.kind==='ride_unavailable')});
 await withFetch(async()=>reply([{ride_id:id,pickup_lat:100,pickup_lng:36.2,destination_lat:33.6,destination_lng:36.3}]),async()=>{await assert.rejects(cloudDriverRidePreview(token,id),error=>error.kind==='ride_unavailable')});
});

test('successful cancellation confirmation does not wait for the ride list',async()=>{
 await withFetch(async(url,options)=>{
  assert.match(url,/\/rpc\/cancel_ride_with_reason$/);
  assert.deepEqual(JSON.parse(options.body),{p_ride_id:requestId,p_actor:'driver',p_reason:'other'});
  return reply(true);
 },async()=>assert.equal(await cloudCancelRideWithReason(token,requestId,'driver-one','driver','other'),true));
});

test('cancellation checks the exact ride when the server reply is lost',async()=>{
 for(const actor of ['driver','passenger']){
  let submissions=0;
  await withFetch(async(url,options)=>{
   if(options.method==='POST'){submissions++;throw Error('Response lost')}
   assert.match(url,new RegExp('&id=eq\\.'+requestId+'&'+actor+'_id=eq\\.owner&limit=1$'));
   return reply([{id:requestId,status:'cancelled'}]);
  },async()=>assert.equal(await cloudCancelRideWithReason(token,requestId,'owner',actor,'other'),true));
  assert.equal(submissions,1);
 }
});
