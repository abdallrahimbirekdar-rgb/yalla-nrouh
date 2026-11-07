import {newMeter,pauseMeter,recordFix,validMeter,validTariff,suggestedNewSypTariff,type Fix,type Meter,type Tariff} from './meter.ts';
import {isCoordinate,sameCoordinate,type Coordinate} from './geo.ts';
export type Language = 'ar' | 'de' | 'en';
export type RideType = 'classic' | 'comfort' | 'yellow' | 'vip' | 'ladies-classic' | 'ladies-comfort';
export type TripStatus = 'requested' | 'accepted' | 'arrived' | 'riding' | 'completed' | 'cancelled';
export const categories: {id: RideType; ar: string; en: string; de: string; description: [string, string]; verified: boolean}[] = [
  {id:'classic',ar:'كلاسيك فوري',en:'Classic · Now',de:'Classic · Sofort',description:['خيار اقتصادي للمشاوير اليومية','A low-cost choice for daily rides'],verified:true},
  {id:'comfort',ar:'كومفورت مكيفة فوري',en:'Comfort AC · Now',de:'Comfort mit Klimaanlage · Sofort',description:['سيارات حديثة ومكيفة','Modern cars with air conditioning'],verified:true},
  {id:'yellow',ar:'تكسي عمومي أصفر',en:'Yellow taxi',de:'Gelbes Taxi',description:['تكسي عمومي للتنقل داخل المدينة','Public taxis for city trips'],verified:true},
  {id:'vip',ar:'قمة الرفاهية',en:'VIP',de:'VIP',description:['سيارات فاخرة للأعمال والمناسبات','Luxury cars for work and special events'],verified:true},
  {id:'ladies-classic',ar:'يالله سيدات كلاسيك',en:'Yalla Ladies Classic',de:'Yalla Ladies Classic',description:['تفاصيل الفئة قيد التحقق','Category details are being checked'],verified:false},
  {id:'ladies-comfort',ar:'يالله سيدات كومفورت',en:'Yalla Ladies Comfort',de:'Yalla Ladies Comfort',description:['تفاصيل الفئة قيد التحقق','Category details are being checked'],verified:false},
];
export const regions = [
  ['دمشق','Damascus'],['ريف دمشق','Rif Dimashq'],['حلب','Aleppo'],['حمص','Homs'],['حماة','Hama'],['اللاذقية','Latakia'],['طرطوس','Tartus'],['إدلب','Idlib'],['درعا','Daraa'],['السويداء','As-Suwayda'],['القنيطرة','Quneitra'],['دير الزور','Deir ez-Zor'],['الرقة','Raqqa'],['الحسكة','Al-Hasakah'],
];
export interface TripDraft {pickup:string;destination:string;region:number;intercity:boolean;category:RideType;pickupPoint?:Coordinate;pickupMode?:'current'|'manual';destinationPoint?:Coordinate}
export interface Trip extends TripDraft {id:string;createdAt:string;status:TripStatus;fare:null;pin:string;rating?:number;feedback?:string;cancelReason?:'passenger'|'driver';updatedAt:string;meter?:Meter}
export interface Preferences {theme:'system'|'light'|'dark';dataSaver:boolean;notifications:boolean;smsNumber:string;permissionsIntroSeen:boolean}
export const defaultPreferences:Preferences={theme:'system',dataSaver:true,notifications:false,smsNumber:'',permissionsIntroSeen:false};
export interface AppState {preferences:Preferences;tariff:Tariff|null;version:1;language:Language;trips:Trip[];driver:{approved:boolean;online:boolean};activeTripId:string|null}
export const initialState:AppState={preferences:defaultPreferences,tariff:{...suggestedNewSypTariff},version:1,language:'ar',trips:[],driver:{approved:false,online:false},activeTripId:null};
export const isActive=(trip:Trip)=>!['completed','cancelled'].includes(trip.status);
export function validateDraft(draft:TripDraft):string|null {
  if(!draft.pickup.trim()||!draft.destination.trim())return 'addresses';
  if(draft.pickup.trim().toLocaleLowerCase()===draft.destination.trim().toLocaleLowerCase())return 'same';
  if(draft.pickup.length>200||draft.destination.length>200)return 'length';
  if(!categories.some(c=>c.id===draft.category)||!Number.isInteger(draft.region)||!regions[draft.region]||typeof draft.intercity!=='boolean')return 'invalid';
  if(draft.pickupPoint!==undefined&&!isCoordinate(draft.pickupPoint)||draft.destinationPoint!==undefined&&!isCoordinate(draft.destinationPoint))return 'coordinates';
  if(draft.pickupPoint&&draft.destinationPoint&&sameCoordinate(draft.pickupPoint,draft.destinationPoint))return 'same';
  return null;
}
export type Action = {type:'preferences';preferences:Partial<Preferences>}|{type:'tariff';tariff:Tariff}|{type:'fix';id:string;fix:Fix;now:number}|{type:'pauseTracking';id:string}|{type:'language';language:Language}|{type:'approve';approved:boolean}|{type:'online'}|{type:'create';draft:TripDraft;id:string;now:string;pin:string}|{type:'transition';id:string;to:TripStatus;actor:'passenger'|'driver';now:string;pin?:string}|{type:'rate';id:string;rating:number;feedback:string};
export function reduce(state:AppState,action:Action):AppState {
  if(action.type==='preferences'){const p={...state.preferences,...action.preferences};if(!['system','light','dark'].includes(p.theme)||typeof p.dataSaver!=='boolean'||typeof p.notifications!=='boolean'||typeof p.permissionsIntroSeen!=='boolean'||typeof p.smsNumber!=='string'||p.smsNumber!==''&&!/^\+?\d{7,15}$/.test(p.smsNumber))return state;return {...state,preferences:p};}
  if(action.type==='tariff')return validTariff(action.tariff)?{...state,tariff:{...action.tariff}}:state;
  if(action.type==='language')return {...state,language:action.language};
  if(action.type==='approve')return {...state,driver:{approved:action.approved,online:action.approved&&state.driver.online}};
  if(action.type==='online')return state.driver.approved?{...state,driver:{...state.driver,online:!state.driver.online}}:state;
  if(action.type==='create') {
    if(validateDraft(action.draft)||!/^\d{4}$/.test(action.pin)||state.trips.some(t=>isActive(t)||t.id===action.id))return state;
    const trip:Trip={...action.draft,pickupPoint:action.draft.pickupPoint?{...action.draft.pickupPoint}:undefined,destinationPoint:action.draft.destinationPoint?{...action.draft.destinationPoint}:undefined,pickup:action.draft.pickup.trim(),destination:action.draft.destination.trim(),id:action.id,createdAt:action.now,updatedAt:action.now,status:'requested',fare:null,pin:action.pin};
    return {...state,trips:[trip,...state.trips],activeTripId:trip.id};
  }
  const trip=state.trips.find(t=>t.id===action.id);if(!trip)return state;
  if(action.type==='fix'||action.type==='pauseTracking'){if(trip.status!=='riding'||!trip.meter)return state;const meter=action.type==='fix'?recordFix(trip.meter,action.fix,action.now):pauseMeter(trip.meter);return meter===trip.meter?state:{...state,trips:state.trips.map(t=>t.id===trip.id?{...t,meter}:t)};}
  if(action.type==='rate') {
    if(trip.status!=='completed'||trip.rating!==undefined||!Number.isInteger(action.rating)||action.rating<1||action.rating>5)return state;
    return {...state,trips:state.trips.map(t=>t.id===trip.id?{...t,rating:action.rating,feedback:action.feedback.trim().slice(0,500)}:t)};
  }
  const transitions:Partial<Record<TripStatus,TripStatus>>={requested:'accepted',accepted:'arrived',arrived:'riding',riding:'completed'};
  const cancel=action.to==='cancelled'&&['requested','accepted','arrived'].includes(trip.status)&&(action.actor==='passenger'||(action.actor==='driver'&&state.driver.approved&&state.driver.online&&trip.status==='requested'));
  const advance=action.actor==='driver'&&state.driver.approved&&transitions[trip.status]===action.to&&(trip.status!=='requested'||state.driver.online)&&(action.to!=='riding'||action.pin===trip.pin);
  if(!cancel&&!advance||!Number.isFinite(Date.parse(action.now)))return state;
  const meter=action.to==='riding'?newMeter(Date.parse(action.now),state.tariff):action.to==='completed'&&trip.meter?{...trip.meter,endedAt:Math.max(trip.meter.startedAt,Date.parse(action.now)),incomplete:trip.meter.incomplete||!trip.meter.lastFix||Date.parse(action.now)-trip.meter.lastFix.time>45000}:trip.meter;
  return {...state,trips:state.trips.map(t=>t.id===trip.id?{...t,status:action.to,updatedAt:action.now,...(meter?{meter}:{}),...(cancel?{cancelReason:action.actor}:{})}:t),activeTripId:['completed','cancelled'].includes(action.to)?null:trip.id};
}
export function restoreState(raw:unknown):AppState|null {
  if(typeof raw!=='object'||raw===null)return null;
  const s=raw as AppState;
  if(s.version!==1||!['ar','de','en'].includes(s.language)||!Array.isArray(s.trips)||typeof s.driver?.approved!=='boolean')return null;
  const statuses=['requested','accepted','arrived','riding','completed','cancelled'];
  const seen=new Set<string>();
  for(const trip of s.trips){
    if(!trip||typeof trip.pickup!=='string'||typeof trip.destination!=='string'||validateDraft(trip)||typeof trip.id!=='string'||!trip.id||seen.has(trip.id)||!statuses.includes(trip.status)||trip.fare!==null||typeof trip.pin!=='string'||!/^\d{4}$/.test(trip.pin)||!Number.isFinite(Date.parse(trip.createdAt))||!Number.isFinite(Date.parse(trip.updatedAt)))return null;
    if(trip.rating!==undefined&&(trip.status!=='completed'||!Number.isInteger(trip.rating)||trip.rating<1||trip.rating>5))return null;
    if(trip.feedback!==undefined&&(typeof trip.feedback!=='string'||trip.feedback.length>500))return null;
    if(trip.meter!==undefined&&!validMeter(trip.meter))return null;
    seen.add(trip.id);
  }
  const active=s.trips.filter(isActive);if(active.length>1)return null;
  const preferences={...defaultPreferences,...s.preferences};
  if(!['system','light','dark'].includes(preferences.theme)||typeof preferences.dataSaver!=='boolean'||typeof preferences.notifications!=='boolean'||typeof preferences.permissionsIntroSeen!=='boolean'||typeof preferences.smsNumber!=='string'||preferences.smsNumber!==''&&!/^\+?\d{7,15}$/.test(preferences.smsNumber)||s.tariff!==undefined&&s.tariff!==null&&!validTariff(s.tariff))return null;
  return {...s,preferences,tariff:s.tariff??{...suggestedNewSypTariff},trips:s.trips.map(t=>t.status==='riding'&&t.meter?{...t,meter:pauseMeter(t.meter)}:t),driver:{approved:s.driver.approved,online:false},activeTripId:active[0]?.id??null};
}
