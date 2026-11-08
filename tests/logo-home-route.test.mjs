import assert from 'node:assert/strict';
import test from 'node:test';
import {logoHomeHref} from '../src/logo-home-route.ts';

test('logo returns visitors, passengers and admins to the public home map',()=>{
 for(const [driver,admin] of [[false,false],[false,true],[true,true]]){
  assert.equal(logoHomeHref(driver,admin),'/');
 }
});

test('logo returns driver-only accounts to their driver dashboard',()=>{
 assert.deepEqual(logoHomeHref(true,false),{pathname:'/cloud',params:{mode:'driver'}});
});
