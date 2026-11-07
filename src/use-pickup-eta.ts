import {useEffect,useMemo,useRef,useState} from 'react';
import {cloudCurrentToken} from './cloud-api';
import type {Coordinate} from './geo';
import {distanceMeters,navigationProgress} from './navigation-progress';
import {routeScheduler} from './route-scheduler';
import {createRoutingClient,type RoutePlan} from './routing';

const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
const minGap=45000;
const maxRequests=3;

export function usePickupEta(fix:{point:Coordinate;time:number}|null,pickup:Coordinate,enabled:boolean,language:string){
 const {latitude,longitude}=pickup;
 const [result,setResult]=useState<{plan:RoutePlan;target:string}|null>(null);
 const [pending,setPending]=useState(false);
 const target=latitude+':'+longitude;
 const run=useRef<{request?:AbortController;count:number;last?:{point:Coordinate;time:number}}|null>(null);
 useEffect(()=>{
  run.current={count:0};
  setPending(false);
  return()=>{run.current?.request?.abort();run.current=null};
 },[target]);
 useEffect(()=>{
  if(!enabled){
   run.current?.request?.abort();
   setPending(false);
  }
 },[enabled]);
 const plan=result?.target===target?result.plan:null;
 const progress=useMemo(()=>plan&&fix?navigationProgress(plan,fix.point):null,[plan,fix]);
 useEffect(()=>{
  const scope=run.current;
  if(!enabled||!fix||!scope||scope.request||scope.count>=maxRequests)return;
  const now=Date.now();
  if(scope.last&&now-scope.last.time<minGap)return;
  if(plan&&scope.last&&progress&&progress.offRouteMeters<=100&&
     (now-scope.last.time<120000||distanceMeters(scope.last.point,fix.point)<200))return;
  const controller=new AbortController();
  scope.request=controller;
  scope.count++;
  scope.last={point:fix.point,time:now};
  setPending(true);
  void routeScheduler.run(async()=>{
   const token=await cloudCurrentToken();
   return client.route(fix.point,{latitude,longitude},controller.signal,language,token);
  },controller.signal).then(next=>{
   if(!controller.signal.aborted)setResult({plan:next,target});
  }).catch(()=>{/* Keep the live map and any usable estimate. */}).finally(()=>{
   if(scope.request===controller)scope.request=undefined;
   if(run.current===scope&&!controller.signal.aborted)setPending(false);
  });
 },[enabled,fix,language,latitude,longitude,pending,plan,progress,target]);
 const usable=enabled&&progress&&progress.offRouteMeters<=100?progress:null;
 return {
  minutes:usable?Math.max(0,Math.ceil(usable.remainingSeconds/60)):null,
  meters:usable?Math.round(usable.remainingMeters):null,
  route:usable?.remainingPath,
  pending,
 };
}
