import {useEffect,useMemo,useRef,useState} from 'react';
import {Linking,View} from 'react-native';
import {authClient} from './auth-client';
import {isCoordinate,type Coordinate} from './geo';
import {distanceMeters} from './navigation-progress';
import {googleDirections} from './google-links';
import MapCanvas from './map/MapCanvas';
import {Label,Panel,useText} from './ui';

type Reply={ok:boolean;rideId?:string|null};
type SharingRole='driver'|'passenger';
type RideTable='ride_passenger_positions'|'ride_pickup_changes';
const bridge=()=>typeof window==='undefined'?undefined:(window as Window&{ReactNativeWebView?:{postMessage:(data:string)=>void}}).ReactNativeWebView;

function nativeRequest(type:string,body:object={},timeout=5000):Promise<Reply>{
 const host=bridge();
 if(!host)return Promise.resolve({ok:false});
 const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 return new Promise(resolve=>{
  const end=(value:Reply)=>{
   clearTimeout(timer);
   window.removeEventListener('yalla:native-result',receive);
   resolve(value);
  };
  const receive=(event:Event)=>{
   const value=(event as CustomEvent).detail;
   if(value?.id===id&&typeof value.ok==='boolean')end(value);
  };
  const timer=setTimeout(()=>end({ok:false}),timeout);
  window.addEventListener('yalla:native-result',receive);
  try{host.postMessage(JSON.stringify({type,id,...body}))}catch{end({ok:false})}
 });
}

export function useRideSharing(){
 const [capability,setCapability]=useState(bridge()?null:false);
 const [activeRide,setActiveRide]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [problem,setProblem]=useState(false);
 const changing=useRef(false);
 useEffect(()=>{
  if(!bridge())return;
  let active=true,revision=0;
  const refresh=()=>{
   const version=++revision;
   void nativeRequest('ride-share-status',{},2000).then(value=>{
    if(active&&revision===version){setCapability(value.ok);setActiveRide(value.rideId??null)}
   });
  };
  const update=(event:Event)=>{
   const {rideId,active:sharing}=(event as CustomEvent).detail??{};
   if(typeof rideId!=='string'||typeof sharing!=='boolean')return;
   revision++;
   setActiveRide(previous=>sharing?rideId:previous===rideId?null:previous);
  };
  const resume=(event:Event)=>{if((event as CustomEvent).detail?.active===true)refresh()};
  refresh();
  window.addEventListener('yalla:ride-sharing',update);
  window.addEventListener('yalla:native-visibility',resume);
  return()=>{
   active=false;
   window.removeEventListener('yalla:ride-sharing',update);
   window.removeEventListener('yalla:native-visibility',resume);
  };
 },[]);
 async function toggle(rideId:string,role:SharingRole){
  if(changing.current||!capability)return;
  changing.current=true;setBusy(true);setProblem(false);
  let secret:string|null=null;
  try{
   if(activeRide===rideId){
    if(!(await nativeRequest('ride-share-stop',{rideId})).ok)throw Error('stop');
    setActiveRide(null);
   }else{
    const lease=await authClient().rpc('start_live_share',{p_ride:rideId,p_role:role});
    if(lease.error||typeof lease.data!=='string')throw Error('lease');
    secret=lease.data;
    if(!(await nativeRequest('ride-share-start',{rideId,secret},65000)).ok)throw Error('start');
    setActiveRide(rideId);
   }
  }catch{
   if(secret)void authClient().rpc('live_update',{p_secret:secret,p_lat:null,p_lng:null,p_time:null,p_stop:true}).then(()=>{});
   setProblem(true);
  }finally{changing.current=false;setBusy(false)}
 }
 return {capability,activeRide,busy,problem,toggle};
}

const navigationMessage={google:'ride-maps',yandex:'ride-yandex',osmand:'ride-osmand'} as const;
export type NavigationProvider=keyof typeof navigationMessage;
export async function openRideMaps(point:Coordinate,adjacent:boolean,nativeAvailable:boolean,provider:NavigationProvider):Promise<boolean>{
 if(nativeAvailable)return (await nativeRequest(navigationMessage[provider],{...point,adjacent})).ok;
 if(provider!=='google')return false;
 try{await Linking.openURL(googleDirections(point,undefined,true));return true}catch{return false}
}

export function useRideRow(table:RideTable,rideId:string|undefined,foreground:boolean){
 const [value,setValue]=useState<{id:string;row:Record<string,unknown>|null}|null>(null);
 useEffect(()=>{
  if(!rideId||!foreground)return;
  const client=authClient(),controller=new AbortController();
  let revision=0,reading=false,subscribed=false;
  const receive=(row:unknown)=>{
   if(controller.signal.aborted||!row||typeof row!=='object'||(row as Record<string,unknown>).ride_id!==rideId)return;
   revision++;
   setValue({id:rideId,row:row as Record<string,unknown>});
  };
  const snapshot=async()=>{
   if(reading||controller.signal.aborted)return;
   reading=true;const before=revision;
   try{
    const {data,error}=await client.from(table).select('*').eq('ride_id',rideId).abortSignal(controller.signal).maybeSingle();
    if(!error&&!controller.signal.aborted&&before===revision){
     if(data)receive(data);else setValue({id:rideId,row:null});
    }
   }finally{reading=false}
  };
  const filter={schema:'public',table,filter:'ride_id=eq.'+rideId};
  const channel=client.channel(table+':'+rideId)
   .on('postgres_changes',{...filter,event:'INSERT'},event=>receive(event.new))
   .on('postgres_changes',{...filter,event:'UPDATE'},event=>receive(event.new))
   .subscribe(status=>{subscribed=status==='SUBSCRIBED';if(subscribed)void snapshot().catch(()=>{})});
  let ticks=0;
  const timer=setInterval(()=>{if(!subscribed||++ticks%2===0)void snapshot().catch(()=>{})},12000);
  void snapshot().catch(()=>{});
  return()=>{controller.abort();clearInterval(timer);void client.removeChannel(channel)};
 },[table,rideId,foreground]);
 return rideId&&value?.id===rideId?value.row:null;
}

export function pickupChange(row:Record<string,unknown>|null){
 if(!row||typeof row.proposal_id!=='string')return null;
 const point={latitude:row.latitude,longitude:row.longitude};
 return isCoordinate(point)?{point,id:row.proposal_id,approved:row.approved===true}:null;
}

export function CustomerTracking({rideId,pickup,foreground,compact}:{rideId:string;pickup:Coordinate;foreground:boolean;compact?:boolean}){
 const t=useText();
 const [pageVisible,setPageVisible]=useState(()=>typeof document!=='undefined'&&document.visibilityState==='visible');
 useEffect(()=>{
  if(!compact||typeof document==='undefined')return;
  const visibility=()=>setPageVisible(document.visibilityState==='visible');
  document.addEventListener('visibilitychange',visibility);
  return()=>document.removeEventListener('visibilitychange',visibility);
 },[compact]);
 // Older Android versions can pause the unfocused app while it is still visible in split screen.
 const visible=compact?pageVisible:foreground;
 const row=useRideRow('ride_passenger_positions',rideId,visible);
 const [now,setNow]=useState(Date.now);
 const [away,setAway]=useState(false);
 useEffect(()=>{
  if(!visible)return;
  setNow(Date.now());
  const timer=setInterval(()=>setNow(Date.now()),1000);
  return()=>clearInterval(timer);
 },[visible]);
 const latitude=row?.latitude,longitude=row?.longitude;
 const point=useMemo(()=>({latitude,longitude}),[latitude,longitude]);
 const measured=typeof row?.measured_at==='string'?Date.parse(row.measured_at):NaN;
 const age=Math.max(0,Math.floor((now-measured)/1000));
 const shown=isCoordinate(point)&&age<180;
 const distance=shown?Math.round(distanceMeters(pickup,point as Coordinate)):null;
 useEffect(()=>{
  if(distance===null||age>=30)return;
  if(distance>=100)setAway(true);
  else if(distance<=65)setAway(false);
 },[distance,age]);
 return <Panel>
  <Label large>{t('موقع الزبون ونقطة الالتقاء','Customer location and meeting point')}</Label>
  <View style={{height:compact?155:220,overflow:'hidden',borderRadius:12}}>
   <MapCanvas compact readOnly minMapHeight={compact?155:220} point={pickup} passengerPoint={shown?point as Coordinate:undefined} onChange={()=>{}}/>
  </View>
  <Label muted>{t('الأخضر: موقع الزبون · العلامة الأخرى: نقطة الالتقاء الأصلية','Green: customer · other pin: original meeting point')}</Label>
  <Label>{shown?t('آخر تحديث قبل '+age+' ثانية','Updated '+age+' seconds ago'):t('بانتظار مشاركة الزبون موقعه أو وصول تحديث جديد','Waiting for the customer to share or update their location')}</Label>
  {distance!==null&&<Label muted>{t('المسافة التقريبية عن نقطة الالتقاء الأصلية: '+distance+' متر','Approximate distance from original meeting point: '+distance+' m')}</Label>}
  {shown&&age>=30&&<Label muted>{t('موقع قديم · نعرض آخر موقع معروف','Location is stale · showing last known location')}</Label>}
  {shown&&age<30&&away&&<View accessibilityRole="alert"><Label>{t('الزبون بعيد عن نقطة الالتقاء الأصلية.','The customer is away from the original meeting point.')}</Label></View>}
  {compact&&<Label muted>{t('إذا فُتحت الملاحة بملء الشاشة، افتح التطبيقات الأخيرة واختر تقسيم الشاشة من أيقونة «يلّا نروح»، ثم اختر تطبيق الملاحة.','If Maps opens full screen, open Recents, tap the Yalla Nrouh app icon, choose split screen if available, then select the navigation app.')}</Label>}
 </Panel>;
}
