import assert from 'node:assert/strict';
import test from 'node:test';
import {driverLoginEmail,validDriverPassword} from '../src/driver-credentials.ts';
import {syrianMobile} from '../src/syrian-phone.ts';
import {driverPhoneAccount} from '../backend/driver-phone-account/index.ts';

const phone='+963944555666';
const endpoint='https://local.test/functions/v1/driver-phone-account';
const origin='https://abdallrahimbirekdar-rgb.github.io';
const request=(body,token='test-admin-token')=>new Request(endpoint,{
 method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token},body:JSON.stringify(body),
});
const password='SafeDriver2026!';
const form={action:'create',name:'  Test driver  ',phone,region:1,category:'classic',password};
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status});

test('normalizes Syrian mobile numbers and rejects foreign, landline and malformed input',()=>{
 for(const input of [phone,'0944 555 666','00963-944-555-666','963944555666','944555666','٠٩٤٤ ٥٥٥ ٦٦٦','۰۹۴۴۵۵۵۶۶۶']){
  assert.equal(syrianMobile(input),phone,input);
 }
 for(const input of ['+491601234567','0111234567','+9630944555666','+96394455566','++963944555666','', '0944555666 ext 1']){
  assert.equal(syrianMobile(input),null,input);
 }
});
async function withBackend(mock,check){
 const savedFetch=globalThis.fetch,savedDeno=globalThis.Deno;
 globalThis.Deno={env:{get:key=>({
  SUPABASE_URL:'https://local.test',SUPABASE_ANON_KEY:'public-test-key',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',
 })[key]}};
 globalThis.fetch=mock;
 try{await check()}finally{
  globalThis.fetch=savedFetch;
  if(savedDeno===undefined)delete globalThis.Deno;else globalThis.Deno=savedDeno;
 }
}

test('non-admin cannot reach the Auth Admin API',async()=>{
 let calls=0;
 await withBackend(async(url,init)=>{
  calls++;assert.match(url,/\/rpc\/is_staff_admin$/);
  assert.equal(init.headers.Authorization,'Bearer regular-user');return reply(false);
 },async()=>assert.equal((await driverPhoneAccount(request(form,'regular-user'))).status,403));
 assert.equal(calls,1);
});
test('admin chooses a driver password, which is never returned to client',async()=>{
 let created;
 await withBackend(async(url,init)=>{
  if(url.endsWith('/rpc/is_staff_admin'))return reply(true);
  assert.match(url,/\/admin\/users$/);assert.equal(init.method,'POST');
  assert.equal(init.headers.Authorization,'Bearer server-test-key');
  created=JSON.parse(init.body);
  assert.deepEqual(Object.keys(created).sort(),['app_metadata','email','email_confirm','password','phone','phone_confirm']);
  assert.equal(created.phone_confirm,true);
  assert.equal(created.email,driverLoginEmail(phone));
  assert.equal(created.email_confirm,true);
  assert.deepEqual(created.app_metadata.yalla_driver_phone,{name:'Test driver',region:1,category:'classic'});
  return reply({id:'new-user'});
 },async()=>{
  const response=await driverPhoneAccount(request(form));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const credentials=await response.json();
  assert.deepEqual(credentials,{phone});
  assert.equal(created.password,password);
 });
});
test('reset updates only the driver account returned by the protected lookup',async()=>{
 const id='21000000-0000-4000-8000-000000000001';
 await withBackend(async(url,init)=>{
  if(url.endsWith('/rpc/is_staff_admin'))return reply(true);
  if(url.endsWith('/rpc/admin_phone_driver_id')){
   assert.deepEqual(JSON.parse(init.body),{p_phone:phone});return reply(id);
  }
  assert.ok(url.endsWith('/auth/v1/admin/users/'+id));
  assert.equal(init.method,'PUT');
  assert.deepEqual(JSON.parse(init.body),{password});return reply({id});
 },async()=>assert.equal((await driverPhoneAccount(request({action:'reset',phone,password}))).status,200));
});

test('rejects weak or missing chosen passwords before touching Auth Admin API',async()=>{
 for(const bad of [undefined,'short1','a'.repeat(73),'س'.repeat(37),'password\n']){
  let adminCalls=0;
  await withBackend(async(url)=>{
   if(url.endsWith('/rpc/is_staff_admin'))return reply(true);
   adminCalls++;return reply({external:{phone:true}});
  },async()=>{
   const response=await driverPhoneAccount(request({...form,password:bad}));
   assert.equal(response.status,400);
   assert.deepEqual(await response.json(),{code:'invalid_driver_password'});
  });
  assert.equal(adminCalls,0);
 }
});

test('supports a safe feature check without creating an account',async()=>{
 let calls=0;
 await withBackend(async(url)=>{calls++;assert.match(url,/\/rpc\/is_staff_admin$/);return reply(true)},async()=>{
  const response=await driverPhoneAccount(request({action:'capabilities'}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{mode:'admin_phone_username_v2'});
 });
 assert.equal(calls,1);
});

test('phone usernames use an internal identifier and allow admin-selected words',()=>{
 assert.equal(driverLoginEmail(phone),'driver-963944555666@drivers.yalla-nrouh.invalid');
 for(const value of ['mydriverword','كلمةمرورطويلة','12345678'])assert.equal(validDriverPassword(value),true);
});

test('duplicate phone or reserved identifier returns a clear error',async()=>{
 for(const code of ['phone_exists','email_exists','user_already_exists']){
  await withBackend(async url=>url.endsWith('/rpc/is_staff_admin')?reply(true):reply({code:422,error_code:code},422),async()=>{
   const response=await driverPhoneAccount(request(form));
   assert.equal(response.status,409);assert.deepEqual(await response.json(),{code:'phone_driver_exists'});
  });
 }
});
