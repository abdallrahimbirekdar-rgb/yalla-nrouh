import {useEffect,useRef,useState} from 'react';
import {cloudCurrentToken,cloudRideOperation,matchesRideOperation,type CloudRide,type RideOperation} from './cloud-api';

type Pending={kind:RideOperation;owner:string;id:string;since:number};
const storageKey=(kind:RideOperation,owner:string)=>'yalla-ride-operation:'+kind+':'+owner;
// Use secure random bytes on WebViews that predate crypto.randomUUID().
export function newRideRequestId(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;
 bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readPendingRideOperation(kind:RideOperation,owner:string|undefined):Pending|null{
 if(!owner)return null;
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey(kind,owner))??'null') as Partial<Pending>|null;
  if(typeof saved?.id==='string'&&idPattern.test(saved.id)&&typeof saved.since==='number'&&Number.isFinite(saved.since))
   return {kind,owner,id:saved.id,since:saved.since};
 }catch{}
 return null;
}

export function useRideRecovery(kind:RideOperation,owner:string|undefined,foreground:boolean,busy:boolean,onFound:(ride:CloudRide)=>void){
 const [operation,setOperation]=useState(()=>readPendingRideOperation(kind,owner));
 const [absentId,setAbsentId]=useState<string|null>(null);
 const pending=operation?.owner===owner&&operation?.kind===kind?operation:null;
 const found=useRef(onFound);found.current=onFound;
 const account=useRef(owner);account.current=owner;
 const current=useRef(pending);current.current=pending;

 useEffect(()=>{
  setOperation(readPendingRideOperation(kind,owner));
  setAbsentId(null);
 },[kind,owner]);

 function remember(id:string){
  if(!owner)return;
  const next={kind,owner,id,since:Date.now()};
  current.current=next;setOperation(next);setAbsentId(null);
  try{localStorage.setItem(storageKey(kind,owner),JSON.stringify(next))}catch{}
 }
 function clear(){
  if(!owner||account.current!==owner)return;
  const id=current.current?.id;
  current.current=null;setOperation(null);setAbsentId(null);
  try{
   const key=storageKey(kind,owner),raw=localStorage.getItem(key);
   if(raw&&JSON.parse(raw).id===id)localStorage.removeItem(key);
  }catch{}
 }

 useEffect(()=>{
  if(!owner||!pending||!foreground||busy||typeof window==='undefined')return;
  const {id,since}=pending;
  let active=true,running=false;
  async function check(){
   if(!active||running||document.visibilityState==='hidden'||navigator.onLine===false)return;
   running=true;
   try{
    const ride=await cloudRideOperation(await cloudCurrentToken(),kind,id,owner!);
    if(!active||account.current!==owner||current.current?.id!==id)return;
    if(matchesRideOperation(kind,owner!,ride)){
     current.current=null;setOperation(null);setAbsentId(null);
     try{
      const key=storageKey(kind,owner!),raw=localStorage.getItem(key);
      if(raw&&JSON.parse(raw).id===id)localStorage.removeItem(key);
     }catch{}
     found.current(ride);
    }else if(Date.now()-since>=15000){
     setAbsentId(id);
    }
   }catch{
    if(active&&account.current===owner&&current.current?.id===id)setAbsentId(null);
   }finally{running=false}
  }
  const retry=()=>void check();
  const timer=setInterval(retry,6000);
  window.addEventListener('online',retry);
  document.addEventListener('visibilitychange',retry);
  retry();
  return()=>{active=false;clearInterval(timer);window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry)};
 },[kind,owner,pending,foreground,busy]);
 return {id:pending?.id,checking:!!pending&&absentId!==pending.id,remember,clear};
}
