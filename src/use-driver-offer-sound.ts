import {useCallback,useEffect,useRef,useState} from 'react';
import {Platform} from 'react-native';
import {pendingOfferChimes,playOfferChime,rememberOfferChimes,type HeardOffers} from './driver-offer-chime';

export function useDriverOfferSound(
 owner:string|undefined,
 enabled:boolean,
 offers:readonly {ride_id:string;expiresOnDevice?:number}[],
){
 const [ready,setReady]=useState(false),[problem,setProblem]=useState(false);
 const audio=useRef<AudioContext|null>(null);
 const heard=useRef<{owner:string;ids:HeardOffers}|null>(null);

 const unlock=useCallback(async()=>{
  if(Platform.OS!=='web'||typeof window==='undefined')return;
  setProblem(false);
  try{
   const Audio=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(!Audio)throw Error('audio_unavailable');
   const context=audio.current??new Audio();
   audio.current=context;
   context.onstatechange=()=>{if(audio.current===context)setReady(context.state==='running')};
   if(context.state!=='running')await context.resume();
   if(audio.current===context)setReady(context.state==='running');
  }catch{setProblem(true)}
 },[]);

 useEffect(()=>()=>{const context=audio.current;audio.current=null;if(context){context.onstatechange=null;void context.close().catch(()=>{})}},[]);
 useEffect(()=>{
  if(Platform.OS!=='web'||!enabled||ready)return;
  const activate=()=>void unlock();
  document.addEventListener('click',activate,{once:true});
  return()=>document.removeEventListener('click',activate);
 },[enabled,ready,unlock]);

 useEffect(()=>{
  const context=audio.current;
  if(!enabled||!owner||!ready||!context||offers.length===0||document.visibilityState==='hidden')return;
  const key='yalla-driver-offer-chimes:'+owner;
  let remembered:HeardOffers=heard.current?.owner===owner?heard.current.ids:{};
  try{
   const stored=JSON.parse(localStorage.getItem(key)??'{}') as HeardOffers|null;
   if(stored&&typeof stored==='object')remembered={...remembered,...stored};
  }catch{}
  const now=Date.now();
  const ids=pendingOfferChimes(offers,remembered,performance.now(),now);
  if(ids.length===0||!playOfferChime(context))return;
  const updated=rememberOfferChimes(remembered,ids,now);
  heard.current={owner,ids:updated};
  try{localStorage.setItem(key,JSON.stringify(updated))}catch{}
 },[enabled,owner,offers,ready]);

 return {ready,problem,unlock};
}
