import type {RoutePlan} from './routing.ts';
import type {Coordinate} from './geo.ts';
import {distanceMeters} from './meter.ts';
// Short-lived page memory only: never persist Google route content on disk.
export function createOfferRouteCache(ttl=300000,capacity=20){
 const entries=new Map<string,{at:number;trip:RoutePlan;pickup:RoutePlan|null}>();
 return {
  get(key:string,from:Coordinate,to:Coordinate,now=Date.now()){
   const entry=entries.get(key);
   if(!entry)return null;
   if(now-entry.at>=ttl||distanceMeters(entry.trip.from,from)>1||distanceMeters(entry.trip.to,to)>1){entries.delete(key);return null}
   return {trip:entry.trip,pickup:entry.pickup};
  },
  set(key:string,value:{trip:RoutePlan;pickup:RoutePlan|null},now=Date.now()){
   entries.delete(key);entries.set(key,{...value,at:now});
   while(entries.size>capacity)entries.delete(entries.keys().next().value!);
  }
 };
}
export const offerRouteCache=createOfferRouteCache();
