import type {AdminServiceUsage} from './service-usage.ts';
import type {CancellationActor,CancellationReason} from './ride-cancellation';
import {readRideState,receiveRideState} from './cloud-ride-state.ts';
import type {RideType,TripDraft} from './domain.ts';
import {validTariff,type Tariff} from './meter.ts';
import {isCoordinate} from './geo.ts';
import {pickupRegion} from './map/pickup-region.ts';

const API_ROOT='https://gokosprcqpdvqgahvquk.supabase.co';
let volatileToken:string|null=null;
let sessionReader:(()=>string|null)|null=null;let tokenResolver:(()=>Promise<string>)|null=null;
export function cloudSetSessionBridge(read:(()=>string|null)|null,resolve:(()=>Promise<string>)|null){sessionReader=read;tokenResolver=resolve}
export const cloudGetToken=()=>sessionReader?sessionReader():volatileToken;
export async function cloudCurrentToken():Promise<string>{if(tokenResolver)return tokenResolver();const token=cloudGetToken();if(!token)throw new CloudError(401,'login_required');return token}
export const cloudSignOut=()=>{volatileToken=null};
/** Supabase publishable key (not a service-role/secret key); safe for public clients. */
const API_KEY='sb_publishable_0l-T6t_dTDt1OedSTIpLNA_uruCvJ8C';

export interface CloudRide {
  id:string; passenger_id:string;driver_id:string|null;pickup:string;destination:string;
  category:string;region:number;pickup_lat:number;pickup_lng:number;destination_lat:number;destination_lng:number;
  estimated_fare?:number|null;
  status:'requested'|'accepted'|'arrived'|'riding'|'completed'|'cancelled';
  created_at:string;updated_at:string;search_expired_at?:string|null;
}
export interface DriverVehicleDetails {display_name?:string|null;vehicle_color?:string|null;vehicle_plate?:string|null;category?:string}
export interface CloudDriver {user_id:string;region:number;category:string;approved:boolean;online:boolean;last_seen_at:string|null}
export interface RidePreview {ride_id:string;region:number;category:string;created_at:string;pickup_lat_approx:number;pickup_lng_approx:number;estimated_fare?:number|null;remaining_ms?:number;expiresOnDevice?:number}
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
async function call<T>(path:string,method:'GET'|'POST'|'PUT'|'PATCH',token?:string,body?:unknown):Promise<T>{
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),12000);
  try{
    if(token&&sessionReader&&token!==sessionReader())throw new CloudError(401,'login_required');
    const activeToken=token&&tokenResolver?await cloudCurrentToken():token;
    const response=await fetch(API_ROOT+path,{method,headers:headers(activeToken),body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,credentials:'omit'});
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
const rideColumns='id,passenger_id,driver_id,pickup,destination,pickup_lat,pickup_lng,destination_lat,destination_lng,category,region,estimated_fare,status,created_at,updated_at,search_expired_at';
export const rideSearchLimitMs=180000;
export const cloudDriverDispatchPing=(token:string,point:{latitude:number;longitude:number;time:number})=>rpc<boolean>('driver_dispatch_ping',token,{
 p_lat:point.latitude,p_lng:point.longitude,p_measured_at:new Date(point.time).toISOString(),
});
export const cloudReportRouteProblem=(token:string,code:string)=>rpc<void>('report_route_problem',token,{p_code:
 ['network','no_route','not_enabled','not_configured','busy'].includes(code)?code:'other',
});
export interface DispatchOverview {
 route_errors_24h:number;
 rides:{id:string;status:CloudRide['status'];category:string;created_at:string;search_expired_at:string|null;started_at:string|null;matrix_state:string|null;first_offer_at:string|null;accepted_at:string|null}[];
}
export const cloudAdminServiceUsage=(token:string)=>rpc<AdminServiceUsage>('admin_service_usage',token);
export const cloudAdminDispatchOverview=(token:string)=>rpc<DispatchOverview>('admin_dispatch_overview',token);
export async function cloudMyRides(token:string):Promise<CloudRide[]>{
  requireToken(token);
  const owner=readRideState().owner;
  const fetchRides=()=>call<CloudRide[]>('/rest/v1/rides?select='+rideColumns+'&order=created_at.desc&limit=30','GET',token);
  let rides=await fetchRides();
  if(rides.some(ride=>ride.status==='requested'&&Date.parse(ride.updated_at)<=Date.now()-rideSearchLimitMs)){
   const closed=await rpc<number>('close_my_expired_searches',token).catch(()=>0);
   if(closed>0)rides=await fetchRides();
  }
  receiveRideState(owner,rides);return rides;
}
export type DriverHistoryKind='completed'|'cancelled'|'released';
export type DriverHistoryEntry={id:string|number;ride_id?:string;region:number;category:string;pickup?:string;pickup_lat?:number;pickup_lng?:number;destination?:string;updated_at?:string;released_at?:string};
export const driverHistoryPageSize=20;
export function cloudDriverHistory(token:string,owner:string,kind:DriverHistoryKind,offset:number){
 requireToken(token);
 const page='&driver_id=eq.'+encodeURIComponent(owner)+'&limit='+driverHistoryPageSize+'&offset='+offset;
 const path=kind==='released'
  ? '/rest/v1/driver_ride_releases?select=id,ride_id,region,category,released_at&order=released_at.desc,id.desc'
  : '/rest/v1/rides?select=id,region,category,pickup,pickup_lat,pickup_lng,destination,updated_at&status=eq.'+kind+'&order=updated_at.desc,id.desc';
 return call<DriverHistoryEntry[]>(path+page,'GET',token);
}
export async function cloudMyDriver(token:string):Promise<CloudDriver|null>{
  requireToken(token);
  const accounts=await call<CloudDriver[]>('/rest/v1/driver_accounts?select=user_id,region,category,approved,online,last_seen_at&limit=1','GET',token);
  return accounts[0]??null;
}
export async function cloudMyDriverVehicleDetails(token:string){
 requireToken(token);
 const rows=await call<DriverVehicleDetails[]>('/rest/v1/driver_accounts?select=display_name,vehicle_color,vehicle_plate&approved=eq.true&limit=1','GET',token);
 return rows[0]??null;
}
export const cloudSaveDriverVehicleDetails=(token:string,details:DriverVehicleDetails)=>rpc<boolean>('save_driver_vehicle_details',token,{
 p_name:details.display_name?.trim()||null,p_color:details.vehicle_color?.trim()||null,p_plate:details.vehicle_plate?.trim()||null,
});
export async function cloudRideDriverVehicleDetails(token:string,rideId:string){
 const rows=await rpc<DriverVehicleDetails[]>('ride_driver_vehicle_details',token,{p_ride:rideId});
 return rows[0]??null;
}
export async function cloudRideOperation(token:string,kind:'request'|'accept'|'cancel',id:string,owner:string):Promise<CloudRide|null>{
  requireToken(token);
  const column=kind==='request'?'client_request_id':'id';
  const participant=kind==='accept'?'driver_id':'passenger_id';
  const rows=await call<CloudRide[]>('/rest/v1/rides?select='+rideColumns+'&'+column+'=eq.'+encodeURIComponent(id)+'&'+participant+'=eq.'+encodeURIComponent(owner)+'&limit=1','GET',token);
  if(!Array.isArray(rows))throw new CloudError(500,'bad_response');
  return rows[0]??null;
}
export function cloudMutationUncertain(error:unknown):boolean{
  return !(error instanceof CloudError)||error.status===0||error.status===408||error.status>=500||error.kind==='bad_response';
}
export async function cloudRequestRide(token:string,draft:TripDraft,requestId:string,quoteId?:string):Promise<string>{
  if(!isCoordinate(draft.pickupPoint)||!isCoordinate(draft.destinationPoint)||!draft.pickup.trim()||!draft.destination.trim())
    throw new CloudError(400,'select_map_points');
  const id=await rpc<string>(quoteId?'request_ride_with_fare':'request_ride_once',token,{
    ...(quoteId?{p_quote_id:quoteId}:{}),
    p_request_id:requestId,
    p_pickup:draft.pickup.trim(),p_destination:draft.destination.trim(),
    p_pickup_lat:draft.pickupPoint.latitude,p_pickup_lng:draft.pickupPoint.longitude,
    p_destination_lat:draft.destinationPoint.latitude,p_destination_lng:draft.destinationPoint.longitude,
    p_region:pickupRegion(draft.pickupPoint),p_category:draft.category
  });
  if(typeof id!=='string'||!id)throw new CloudError(500,'bad_response');
  return id;
}
export async function cloudCancelRideWithReason(token:string,id:string,owner:string,actor:CancellationActor,reason:CancellationReason){
 try{
  const confirmed=await rpc<boolean>('cancel_ride_with_reason',token,{p_ride_id:id,p_actor:actor,p_reason:reason});
  if(typeof confirmed!=='boolean')throw new CloudError(500,'bad_response');
  return confirmed;
 }catch(error){
  if(!cloudMutationUncertain(error))throw error;
  const ride=await cloudRideOperation(token,actor==='driver'?'accept':'cancel',id,owner).catch(()=>null);
  if(ride?.status==='cancelled')return true;
  throw error;
 }
}
export const cloudCancelRide=(token:string,id:string)=>rpc<boolean>('cancel_ride',token,{p_ride_id:id});
export const cloudReleaseRide=(token:string,id:string)=>rpc<boolean>('release_ride',token,{p_ride_id:id});
export const cloudRegisterDriver=(token:string,region:number,category:string)=>rpc<boolean>('register_driver',token,{p_region:region,p_category:category});
export const cloudSetDriverOnline=(token:string,online:boolean)=>rpc<boolean>('set_driver_online',token,{p_online:online});
export const cloudHeartbeat=(token:string)=>rpc<boolean>('driver_heartbeat',token);
export const cloudDeclineDriverOffer=(token:string,id:string)=>rpc<null>('decline_driver_offer',token,{p_ride_id:id});
export async function cloudOpenRides(token:string):Promise<RidePreview[]>{
 const started=performance.now();
 const offers=await rpc<RidePreview[]>('open_ride_timed_previews',token);
 // The server provides time remaining. Measure locally with a monotonic clock
 // and count the request transit time against the offer, even on skewed phones.
 return offers.map(offer=>({...offer,expiresOnDevice:started+Math.max(0,Math.min(rideSearchLimitMs,offer.remaining_ms??0))}));
}
export async function cloudAcceptRide(token:string,id:string):Promise<boolean>{
 const accepted=await rpc<boolean>('accept_ride',token,{p_ride_id:id});
 if(typeof accepted!=='boolean')throw new CloudError(500,'bad_response');
 return accepted;
}
export const cloudAdvanceRide=(token:string,id:string,next:'arrived'|'riding'|'completed')=>rpc<string>('advance_ride',token,{p_ride_id:id,p_next:next,p_pin:null});

export type AdminRuleRevisionInfo={id:number;changed_section:string|null;summary:string;published_at:string};
export type AdminRuleRevision=AdminRuleRevisionInfo&{sections:Record<string,{title:string;body:string}>};
const ruleRevisionColumns='id,changed_section,summary,published_at';
export async function cloudAdminRuleRevision(token:string,id?:number):Promise<AdminRuleRevision|null>{
 requireToken(token);
 const filter=id===undefined?'order=id.desc&limit=1':'id=eq.'+id+'&limit=1';
 const rows=await call<AdminRuleRevision[]>('/rest/v1/admin_rule_revisions?select='+ruleRevisionColumns+',sections&'+filter,'GET',token);
 return rows[0]??null;
}
export function cloudAdminRuleHistory(token:string,offset:number){
 requireToken(token);
 return call<AdminRuleRevisionInfo[]>('/rest/v1/admin_rule_revisions?select='+ruleRevisionColumns+'&order=id.desc&limit=15&offset='+offset,'GET',token);
}
export function cloudReviseAdminRule(token:string,expectedId:number,section:string,body:string,summary:string){
 return rpc<number>('revise_admin_rules',token,{p_expected_id:expectedId,p_section:section,p_body:body,p_summary:summary});
}

export const cloudIsAdmin=(token:string)=>rpc<boolean>('is_staff_admin',token);
export const cloudStaffDrivers=(token:string)=>rpc<StaffDriver[]>('admin_pending_drivers',token);
export const cloudApproveDriver=(token:string,id:string,approved:boolean)=>rpc<boolean>('admin_review_driver',token,{p_driver_id:id,p_approved:approved});
export type DriverPhoneAction=
 |{action:'create';phone:string;password:string;name:string;region:number;category:RideType}
 |{action:'reset';phone:string;password:string};
export const cloudAdminPhoneCapabilities=(token:string)=>
 call<{mode:string}>('/functions/v1/driver-phone-account','POST',token,{action:'capabilities'});
export const cloudAdminPhoneDriver=(token:string,data:DriverPhoneAction)=>
 call<{phone:string}>('/functions/v1/driver-phone-account','POST',token,data);
// Admin adds only a verified existing Supabase Auth user, not credentials.
export function cloudAdminAddDriverByEmail(token:string,email:string,region=0,category='classic'):Promise<boolean>{
 const clean=email.trim().toLowerCase();
 if(!clean.includes('@')||clean.length>200)throw new CloudError(400,'invalid_driver_data');
 return rpc<boolean>('admin_add_driver_by_email',token,{p_email:clean,p_region:region,p_category:category});
}

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

export async function cloudFareSettings(token:string):Promise<Tariff>{
 requireToken(token);
 const rows=await call<{base:number;per_km:number;per_minute:number;peak_multiplier:number;updated_at:string}[]>('/rest/v1/fare_settings?id=eq.true&select=base,per_km,per_minute,peak_multiplier,updated_at','GET',token);
 const row=rows[0];const tariff=row?{base:Number(row.base),perKm:Number(row.per_km),perMinute:Number(row.per_minute),peakMultiplier:Number(row.peak_multiplier),updatedAt:row.updated_at}:null;
 if(!validTariff(tariff))throw new CloudError(500,'bad_response');return tariff;
}
export async function cloudUpdateFareSettings(token:string,tariff:Tariff):Promise<void>{
 requireToken(token);if(!validTariff(tariff))throw new CloudError(400,'invalid_tariff');
 if(!await cloudIsAdmin(token))throw new CloudError(403,'not_admin');
 await call('/rest/v1/fare_settings?id=eq.true','PATCH',token,{base:tariff.base,per_km:tariff.perKm,per_minute:tariff.perMinute,peak_multiplier:tariff.peakMultiplier??1,updated_at:new Date().toISOString()});
 const actual=await cloudFareSettings(token);
 if(['base','perKm','perMinute','peakMultiplier'].some(key=>actual[key as keyof Tariff]!==tariff[key as keyof Tariff]))throw new CloudError(500,'bad_response');
}

// Renew availability before querying: a persisted online flag is not a fresh heartbeat.
export async function cloudDriverInbox(token:string):Promise<{driver:CloudDriver|null;offers:RidePreview[]}>{
 const driver=await cloudMyDriver(token);
 if(!driver?.approved||!driver.online)return {driver,offers:[]};
 if(!await cloudHeartbeat(token))throw new CloudError(409,'driver_not_approved');
 return {driver,offers:await cloudOpenRides(token)};
}

export interface DriverRidePreview {ride_id:string;pickup_lat:number;pickup_lng:number;destination_lat:number;destination_lng:number}
export async function cloudDriverRidePreview(token:string,id:string):Promise<DriverRidePreview>{
 const rows=await rpc<DriverRidePreview[]>('driver_ride_preview',token,{p_ride_id:id});
 const row=rows?.[0];
 if(!row||row.ride_id!==id||!isCoordinate({latitude:row.pickup_lat,longitude:row.pickup_lng})||!isCoordinate({latitude:row.destination_lat,longitude:row.destination_lng}))throw new CloudError(404,'ride_unavailable');
 return row;
}
