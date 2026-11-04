import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudSignIn,cloudSignOut,cloudSignUp,cloudGetToken,cloudWhoAmI,
  cloudRequestRide,cloudCancelRide,cloudReleaseRide,CloudError
} from '../src/cloud-api.ts';

const token='test-access-token-for-requests';
const draft={
  pickup:'First test point',destination:'Second test point',region:1,
  category:'classic',intercity:false,
  pickupPoint:{latitude:33.5,longitude:36.25},
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
   await assert.rejects(()=>cloudRequestRide(token,{...draft,destinationPoint:undefined}),e=>e instanceof CloudError&&e.kind==='select_map_points');
   await assert.rejects(()=>cloudRequestRide(token,{...draft,pickupPoint:{latitude:123,longitude:7}}),e=>e instanceof CloudError&&e.kind==='select_map_points');
 });
});

test('ride request posts a safe payload to the backend RPC',async()=>{
 await withFetch(async (url,options)=>{
   assert.match(url,/\/rest\/v1\/rpc\/request_ride$/);
   assert.equal(options.method,'POST');
   assert.equal(options.headers.Authorization,'Bearer '+token);
   const payload=JSON.parse(options.body);
   assert.deepEqual(payload,{
     p_pickup:'First test point',p_destination:'Second test point',
     p_pickup_lat:33.5,p_pickup_lng:36.25,p_destination_lat:33.53,p_destination_lng:36.29,
     p_region:1,p_category:'classic'
   });
   return reply([{ride_id:'00000000-0000-4000-8000-000000000000',pin:'123456'}]);
 },async()=>{
   const result=await cloudRequestRide(token,draft);
   assert.equal(result.pin,'123456');
 });
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
