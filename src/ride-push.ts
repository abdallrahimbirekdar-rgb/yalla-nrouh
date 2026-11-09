import {useSyncExternalStore} from 'react';
import {cloudRidePushReady,cloudCurrentToken,cloudRegisterRidePush,cloudRemoveRidePush} from './cloud-api';
import {readRideState} from './cloud-ride-state';

type PushHost=Window&{__YALLA_RIDE_PUSH__?:boolean;ReactNativeWebView?:{postMessage:(data:string)=>void}};
const host=()=>typeof window==='undefined'?undefined:window as PushHost;
export const ridePushAvailable=()=>host()?.__YALLA_RIDE_PUSH__===true;
const tokenKey=(owner:string)=>'yalla-ride-push:'+owner;
let device:{owner:string;token:string}|null=null;
let enrolledOwner:string|null=null;
const listeners=new Set<()=>void>();
function publish(owner:string|null){
 if(owner===enrolledOwner)return;
 enrolledOwner=owner;
 for(const listener of listeners)listener();
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export function useRidePushEnrolled(owner:string|undefined){
 return useSyncExternalStore(subscribe,()=>!!owner&&enrolledOwner===owner,()=>false);
}

function readToken(owner:string){
 if(device?.owner===owner)return device.token;
 try{return localStorage.getItem(tokenKey(owner))}catch{return null}
}
function saveToken(owner:string,token:string|null){
 if(token)device={owner,token};
 else if(device?.owner===owner)device=null;
 try{
  if(token)localStorage.setItem(tokenKey(owner),token);
  else localStorage.removeItem(tokenKey(owner));
 }catch{/* The current token stays available in memory. */}
}
function nativePush(type:'ride-push-token'|'ride-push-disable'):Promise<string|null>{
 const bridge=host()?.ReactNativeWebView;
 if(!bridge)return Promise.resolve(null);
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 return new Promise(resolve=>{
  const finish=(token:string|null)=>{clearTimeout(timer);window.removeEventListener('yalla:ride-push-result',receive);resolve(token)};
  const receive=(event:Event)=>{
   const result=(event as CustomEvent).detail;
   if(result?.id===id)finish(typeof result.token==='string'&&/^[a-z0-9:_-]{40,4096}$/i.test(result.token)?result.token:null);
  };
  const timer=setTimeout(()=>finish(null),8000);
  window.addEventListener('yalla:ride-push-result',receive);
  try{bridge.postMessage(JSON.stringify({type,id}))}catch{finish(null)}
 });
}
let sequence:Promise<void>=Promise.resolve();
let revision=0;
function queue(task:()=>Promise<void>){
 const request=sequence.then(task).catch(()=>{});
 sequence=request;
 return request;
}
export function syncRidePush(owner:string,enabled:boolean){
 if(!ridePushAvailable())return Promise.resolve();
 if(!enabled)return disableRidePush(owner);
 const generation=++revision;
 return queue(async()=>{
  const current=()=>generation===revision&&readRideState().owner===owner;
  if(!current())return;
  const configured=await cloudRidePushReady();
  if(!current())return;
  if(!configured){publish(null);return}
  const token=await nativePush('ride-push-token');
  if(!current())return;
  if(!token){publish(null);return}
  const access=await cloudCurrentToken();
  if(!current())return;
  const registered=await cloudRegisterRidePush(access,token,readToken(owner)).catch(()=>false);
  if(registered)saveToken(owner,token);
  if(current())publish(registered?owner:null);
 });
}

export function disableRidePush(owner:string){
 if(!ridePushAvailable())return Promise.resolve();
 ++revision;
 if(enrolledOwner===owner)publish(null);
 return queue(async()=>{
  if(readRideState().owner!==owner)return;
  const token=readToken(owner);
  if(!token)return;
  // Invalidate the device token as well as removing its server registration.
  const invalidate=nativePush('ride-push-disable');
  try{await cloudRemoveRidePush(await cloudCurrentToken(),token);saveToken(owner,null)}catch{/* Retry on a later foreground synchronization. */}
  await invalidate;
 });
}
