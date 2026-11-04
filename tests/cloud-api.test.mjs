import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloudSignIn,cloudSignOut,cloudSignUp,cloudGetToken,cloudWhoAmI,
  cloudRequestRide,cloudCancelRide,CloudError
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
