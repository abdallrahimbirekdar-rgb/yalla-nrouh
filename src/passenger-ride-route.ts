import {useEffect,useState} from 'react';
import {cloudCurrentToken} from './cloud-api';
import {readRideState} from './cloud-ride-state';
import type {Coordinate} from './geo';
import {routeScheduler} from './route-scheduler';
import {createRoutingClient} from './routing';

const routing=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
const routeKey=(owner:string,rideId:string,from:Coordinate,to:Coordinate)=>[owner,rideId,from.latitude,from.longitude,to.latitude,to.longitude].join(':');
type Preview={key:string;points:Coordinate[]};
let latest:Preview|undefined;

export function rememberPassengerRoute(owner:string,rideId:string,from:Coordinate,to:Coordinate,points:Coordinate[]){
 if(readRideState().owner===owner)latest={key:routeKey(owner,rideId,from,to),points};
}

export function usePassengerRideRoute(owner:string|undefined,rideId:string|undefined,from:Coordinate|undefined,to:Coordinate|undefined,connected:boolean,language:string){
 const fromLat=from?.latitude,fromLng=from?.longitude,toLat=to?.latitude,toLng=to?.longitude;
 const key=owner&&rideId&&from&&to?routeKey(owner,rideId,from,to):null;
 const [preview,setPreview]=useState<Preview|undefined>(()=>latest?.key===key?latest:undefined);
 useEffect(()=>{
  if(!key||!owner||fromLat===undefined||fromLng===undefined||toLat===undefined||toLng===undefined)return;
  if(latest?.key===key){setPreview(latest);return}
  if(!connected)return;
  const controller=new AbortController();
  void routeScheduler.run(async()=>{
   const token=await cloudCurrentToken();
   return routing.route({latitude:fromLat,longitude:fromLng},{latitude:toLat,longitude:toLng},controller.signal,language,token);
  },controller.signal).then(plan=>{
   if(!controller.signal.aborted&&readRideState().owner===owner){
    latest={key,points:plan.points};setPreview(latest);
   }
  }).catch(()=>{/* Keep the two saved endpoints visible if a route is unavailable. */});
  return()=>controller.abort();
 },[key,owner,fromLat,fromLng,toLat,toLng,connected,language]);
 return preview?.key===key?preview?.points:undefined;
}
