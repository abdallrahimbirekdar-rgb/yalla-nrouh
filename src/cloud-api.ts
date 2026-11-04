import type {TripDraft} from './domain.ts';
import {isCoordinate} from './geo.ts';

const API_ROOT='https://gokosprcqpdvqgahvquk.supabase.co';
let volatileToken:string|null=null;
export const cloudGetToken=()=>volatileToken;
export const cloudSignOut=()=>{volatileToken=null};
/** Supabase publishable key (not a service-role/secret key); safe for public clients. */
const API_KEY='sb_publishable_0l-T6t_dTDt1OedSTIpLNA_uruCvJ8C';

export interface CloudRide {
  id:string; passenger_id:string;driver_id:string|null;pickup:string;destination:string;
  category:string;region:number;pickup_lat:number;pickup_lng:number;destination_lat:number;destination_lng:number;
  status:'requested'|'accepted'|'arrived'|'riding'|'completed'|'cancelled';
  created_at:string;updated_at:string;
}
export interface CloudDriver {user_id:string;region:number;category:string;approved:boolean;online:boolean;last_seen_at:string|null}
export interface RidePreview {ride_id:string;region:number;category:string;created_at:string;pickup_lat_approx:number;pickup_lng_approx:number}
export interface StaffDriver {user_id:string;region:number;category:string;approved:boolean;online:boolean;created_at:string}
export class CloudError extends Error {
  readonly status:number;
  readonly kind:string;
  constructor(status:number,kind:string){super(kind);this.status=status;this.kind=kind;this.name='CloudError'}
}
const headers=(token?:string):Record<string,string>=>({
  apikey:API_KEY,'Content-Type':'application/json',
  ...(token?{Authorization:'Bearer '+token}:{})
});
async function call<T>(path:string,method:'GET'|'POST'|'PUT',token?:string,body?:unknown):Promise<T>{
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(API_ROOT+path,{method,headers:headers(token),body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,credentials:'omit'});
    const raw=await response.text();
    let data:unknown;
    try{data=raw?JSON.parse(raw):null}catch{throw new CloudError(response.status,'bad_response')}
    if(!response.ok){
      const error:Record<string,unknown>=data&&typeof data==='object'?(data as Record<string,unknown>):{};
      const kind=typeof error.code==='string'?error.code:typeof error.error_code==='string'?error.error_code:typeof error.message==='string'?error.message:'request_failed';
      throw new CloudError(response.status,kind);
    }
    return data as T;
  }catch(error){
    if(error instanceof CloudError)throw error;
    throw new CloudError(0,controller.signal.aborted?'timeout':'network');
  }finally{clearTimeout(timeout)}
}
const requireToken=(token:string)=>{if(!token||token.length<10)throw new CloudError(401,'login_required')};
const rpc=async<T>(name:string,token:string,payload:Record<string,unknown>={})=>{
  requireToken(token);
  return call<T>('/rest/v1/rpc/'+name,'POST',token,payload);
};

export async function cloudSignIn(email:string,password:string):Promise<string>{
  const result=await call<{access_token?:string}>('/auth/v1/token?grant_type=password','POST',undefined,{email:email.trim(),password});
  if(!result.access_token)throw new CloudError(401,'login_required');
  volatileToken=result.access_token;
  return result.access_token;
}
export async function cloudSignUp(email:string,password:string):Promise<void>{
  if(password.length<8||!email.includes('@'))throw new CloudError(400,'invalid_credentials');
  await call<unknown>('/auth/v1/signup','POST',undefined,{email:email.trim(),password});
}
export async function cloudWhoAmI(token:string):Promise<{id:string;email?:string;user_metadata?:Record<string,unknown>}>{
  requireToken(token);
  return call('/auth/v1/user','GET',token);
}
export async function cloudMyRides(token:string):Promise<CloudRide[]>{
  requireToken(token);
  return call('/rest/v1/rides?select=id,passenger_id,driver_id,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,category,region,status,created_at,updated_at&order=created_at.desc&limit=30','GET',token);
}
export async function cloudMyDriver(token:string):Promise<CloudDriver|null>{
  requireToken(token);
  const accounts=await call<CloudDriver[]>('/rest/v1/driver_accounts?select=user_id,region,category,approved,online,last_seen_at&limit=1','GET',token);
  return accounts[0]??null;
}
export async function cloudRequestRide(token:string,draft:TripDraft):Promise<{ride_id:string;pin:string}>{
  if(!isCoordinate(draft.pickupPoint)||!isCoordinate(draft.destinationPoint)||!draft.pickup.trim()||!draft.destination.trim())
    throw new CloudError(400,'select_map_points');
  const rows=await rpc<{ride_id:string;pin:string}[]>('request_ride',token,{
    p_pickup:draft.pickup.trim(),p_destination:draft.destination.trim(),
    p_pickup_lat:draft.pickupPoint.latitude,p_pickup_lng:draft.pickupPoint.longitude,
    p_destination_lat:draft.destinationPoint.latitude,p_destination_lng:draft.destinationPoint.longitude,
    p_region:draft.region,p_category:draft.category
  });
  if(!Array.isArray(rows)||!rows[0]?.ride_id||!rows[0]?.pin)throw new CloudError(500,'bad_response');
  return rows[0];
}
export const cloudCancelRide=(token:string,id:string)=>rpc<boolean>('cancel_ride',token,{p_ride_id:id});
export const cloudReleaseRide=(token:string,id:string)=>rpc<boolean>('release_ride',token,{p_ride_id:id});
export const cloudPassengerPin=(token:string,id:string)=>rpc<string|null>('passenger_ride_pin',token,{p_ride_id:id});
export const cloudRegisterDriver=(token:string,region:number,category:string)=>rpc<boolean>('register_driver',token,{p_region:region,p_category:category});
export const cloudSetDriverOnline=(token:string,online:boolean)=>rpc<boolean>('set_driver_online',token,{p_online:online});
export const cloudHeartbeat=(token:string)=>rpc<boolean>('driver_heartbeat',token);
export const cloudOpenRides=(token:string)=>rpc<RidePreview[]>('open_ride_previews',token);
export const cloudAcceptRide=(token:string,id:string)=>rpc<boolean>('accept_ride',token,{p_ride_id:id});
export const cloudAdvanceRide=(token:string,id:string,next:'arrived'|'riding'|'completed',pin?:string)=>rpc<string>('advance_ride',token,{p_ride_id:id,p_next:next,p_pin:pin??null});

export const cloudIsAdmin=(token:string)=>rpc<boolean>('is_staff_admin',token);
export const cloudStaffDrivers=(token:string)=>rpc<StaffDriver[]>('admin_pending_drivers',token);
export const cloudApproveDriver=(token:string,id:string,approved:boolean)=>rpc<boolean>('admin_review_driver',token,{p_driver_id:id,p_approved:approved});

export interface SavedPlace {id:string;label:string;coordinate:{latitude:number;longitude:number}}
export function parseSavedPlaces(value:unknown):SavedPlace[]{
 if(!Array.isArray(value))return [];
 return value.filter((p):p is SavedPlace=>!!p&&typeof p.id==='string'&&p.id.length<=100&&typeof p.label==='string'&&!!p.label.trim()&&p.label.length<=200&&isCoordinate(p.coordinate)).slice(0,20);
}
export async function cloudSavedPlaces(token:string):Promise<SavedPlace[]>{
 const user=await cloudWhoAmI(token);return parseSavedPlaces(user.user_metadata?.yalla_saved_places);
}
export async function cloudSavePlaces(token:string,places:SavedPlace[]):Promise<SavedPlace[]>{
 requireToken(token);
 const clean=parseSavedPlaces(places);
 const user=await call<{user_metadata?:Record<string,unknown>}>('/auth/v1/user','PUT',token,{data:{yalla_saved_places:clean}});
 const verified=parseSavedPlaces(user.user_metadata?.yalla_saved_places);
 if(JSON.stringify(verified)!==JSON.stringify(clean))throw new CloudError(500,'bad_response');
 return verified;
}
