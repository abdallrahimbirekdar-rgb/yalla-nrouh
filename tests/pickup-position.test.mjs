import test from 'node:test';
import assert from 'node:assert/strict';
import {pickupPosition,pickupPositionMessage} from '../src/pickup-position.ts';
import {clearWebPosition,announceWebPosition,recentVerifiedWebPosition} from '../src/web-position.ts';
import {pickupQuoteMatches} from '../src/pickup-policy.ts';
import {PositionError} from '../src/current-position.ts';
const phone={latitude:51.48,longitude:7.21};
async function browser(permission,geolocation,work,native=false){
 const oldWindow=globalThis.window;const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 globalThis.window=new EventTarget();if(native)window.ReactNativeWebView={postMessage:()=>{}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{permissions:{query:async()=>({state:permission})},geolocation}});
 clearWebPosition();announceWebPosition(phone); // no accuracy metadata: this is never trusted as a verified fix.
 try{await work()}finally{globalThis.window=oldWindow;if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator}
}
test('a pickup confirmation in browser prompt state actively obtains a precise location',()=>browser('prompt',{
 getCurrentPosition:(success,_error,options)=>{assert.equal(options.enableHighAccuracy,true);success({coords:{...phone,accuracy:20},timestamp:Date.now()})},
},async()=>{assert.deepEqual(await pickupPosition(async()=>{throw Error('must not mistake prompt for denial')}),phone)}));
test('a recent measured phone fix survives confirmation without a redundant GPS read',()=>browser('granted',{
 getCurrentPosition:()=>{throw Error('must use the recent measured fix')},
},async()=>{
 announceWebPosition(phone,{accuracy:15,time:Date.now()});const current=await pickupPosition(async()=>{throw Error('unused')});
 assert.deepEqual(current,phone);assert.equal(pickupQuoteMatches(phone,current),true);assert.equal(pickupQuoteMatches({...phone,latitude:phone.latitude+.01},current),false);
}));
test('an old or coarse fix and a selected map point cannot validate a pickup',()=>browser('granted',{
 getCurrentPosition:success=>success({coords:{...phone,accuracy:20},timestamp:Date.now()}),
},async()=>{
 assert.equal(recentVerifiedWebPosition(),null);
 announceWebPosition(phone,{accuracy:20,time:Date.now()-60000});assert.equal(recentVerifiedWebPosition(),null);
 announceWebPosition(phone,{accuracy:900,time:Date.now()});assert.equal(recentVerifiedWebPosition(),null);
 assert.deepEqual(await pickupPosition(async()=>{throw Error('unused')}),phone);
}));
test('explicit browser denial is not bypassed with an earlier cached location',()=>browser('denied',{
 getCurrentPosition:()=>{throw Error('must not ask after denial')},
},async()=>{announceWebPosition(phone,{accuracy:20,time:Date.now()});await assert.rejects(pickupPosition(async()=>phone),e=>e.code==='permission')}));
test('Android confirmation asks its native reader and never uses browser GPS',()=>browser('prompt',{
 getCurrentPosition:()=>{throw Error('native permission only')},
},async()=>{let asked;assert.deepEqual(await pickupPosition(async ask=>{asked=ask;return phone}),phone);assert.equal(asked,true)},true));
test('the Android picker and review can share a measured fix while submission still reads natively',()=>browser('prompt',{},async()=>{
 let reads=0;
 const read=async()=>{reads++;return phone};
 announceWebPosition(phone,{accuracy:20,time:Date.now()});
 await pickupPosition(read,{reuseNative:true});
 assert.equal(reads,1);
 window.__YALLA_NATIVE_LOCATION_GRANTED__=true;
 assert.deepEqual(await pickupPosition(read,{reuseNative:true}),phone);
 assert.equal(reads,1);
 await pickupPosition(read);
 assert.equal(reads,2);
},true));
test('a timeout is explained as a timeout rather than a missing location permission',()=>{
 assert.match(pickupPositionMessage(new PositionError('timeout'),false),/took too long/);
 assert.doesNotMatch(pickupPositionMessage(new PositionError('timeout'),false),/permission/);
});
