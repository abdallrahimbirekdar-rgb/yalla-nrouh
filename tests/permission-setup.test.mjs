import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPermission} from '../src/android-fresh/permission-setup.ts';

test('device permission setup remembers a refusal and reads later changes from Android settings',async()=>{
 const values=new Map();
 const store={getItem:async key=>values.get(key)??null,setItem:async (key,value)=>{values.set(key,value)}};
 let permission={granted:false,canAskAgain:true},dialogs=0;
 const read=async()=>permission;
 const request=async()=>{dialogs++;return permission};
 assert.equal((await setupPermission(store,'location',read,request)).granted,false);
 assert.equal((await setupPermission(store,'location',read,request)).granted,false);
 assert.equal(dialogs,1);
 permission={granted:true,canAskAgain:true};
 assert.equal((await setupPermission(store,'location',read,request)).granted,true);
 assert.equal(dialogs,1);
});
