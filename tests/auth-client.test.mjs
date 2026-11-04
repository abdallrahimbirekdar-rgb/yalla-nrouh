import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppAuthClient} from '../src/auth-client.ts';
function setup(){
 const records=new Map();const requests=[];const expires=Math.floor(Date.now()/1000)+3600;
 const user={id:'00000000-0000-4000-8000-000000000001',email:'owner@example.com',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-11-05T00:00:00Z'};
 const jwt=nonce=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:expires,iat:expires-3600,nonce})).toString('base64url'),'test-signature'].join('.');
 const session=nonce=>({access_token:jwt(nonce),refresh_token:'refresh-'+nonce,expires_in:3600,expires_at:expires,token_type:'bearer',user});
 const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
 const fetcher=async(url,options)=>{requests.push({url:String(url),options});if(String(url).includes('/logout'))return new Response(null,{status:204});if(String(url).includes('/user'))return Response.json(user);return Response.json(session(String(url).includes('refresh_token')?'renewed':'first'))};
 const create=()=>createAppAuthClient({storage,fetcher,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false});
 return {records,requests,create};
}
test('app auth restores a saved account after reopening without storing the password',async()=>{
 const fixture=setup();const first=fixture.create();
 const login=await first.auth.signInWithPassword({email:'owner@example.com',password:'test-password-only'});assert.equal(login.error,null);assert.equal(login.data.session.user.email,'owner@example.com');
 const persisted=fixture.records.get('yalla-nrouh-auth-v1');assert.ok(persisted);assert.ok(!persisted.includes('test-password-only'));
 const reopened=fixture.create();const restored=await reopened.auth.getSession();assert.equal(restored.error,null);assert.equal(restored.data.session.user.id,login.data.session.user.id);
 await reopened.auth.signOut({scope:'local'});const signedOut=await reopened.auth.getSession();assert.equal(signedOut.data.session,null);assert.equal(fixture.records.has('yalla-nrouh-auth-v1'),false);first.auth.stopAutoRefresh();reopened.auth.stopAutoRefresh();
});
test('app auth refreshes a session using the refresh token and replaces the stored token',async()=>{
 const fixture=setup();const client=fixture.create();await client.auth.signInWithPassword({email:'owner@example.com',password:'test-password-only'});
 const result=await client.auth.refreshSession();assert.equal(result.error,null);assert.equal(result.data.session.refresh_token,'refresh-renewed');
 const request=fixture.requests.find(r=>r.url.includes('grant_type=refresh_token'));assert.ok(request);assert.equal(JSON.parse(request.options.body).refresh_token,'refresh-first');
 assert.equal(JSON.parse(fixture.records.get('yalla-nrouh-auth-v1')).refresh_token,'refresh-renewed');await client.auth.signOut({scope:'local'});client.auth.stopAutoRefresh();
});
