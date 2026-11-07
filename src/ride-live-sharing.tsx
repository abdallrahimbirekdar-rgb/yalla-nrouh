import {useEffect,useMemo,useRef,useState} from 'react';
import {Linking,Pressable,useWindowDimensions,View} from 'react-native';
import {cloudGetToken} from './cloud-api';
import {authClient} from './auth-client';
import {isCoordinate,type Coordinate} from './geo';
import {distanceMeters} from './navigation-progress';
import {googleDirections} from './google-links';
import MapCanvas from './map/MapCanvas';
import {Button,HelpTip,Icon,Label,useText,useTheme} from './ui';

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

const osmandPassengerSupported=()=>typeof window!=='undefined'&&
 (window as Window&{__YALLA_OSMAND_PASSENGER__?:boolean}).__YALLA_OSMAND_PASSENGER__===true;

export function stopOsmAndPassenger(){
 if(!osmandPassengerSupported())return;
 try{bridge()?.postMessage(JSON.stringify({type:'osmand-passenger-stop'}))}catch{/* The native service also checks ride eligibility. */}
}

const navigationMessage={google:'ride-maps',yandex:'ride-yandex',osmand:'ride-osmand'} as const;
export type NavigationProvider=keyof typeof navigationMessage;
export async function openRideMaps(point:Coordinate,adjacent:boolean,nativeAvailable:boolean,provider:NavigationProvider,waitingRideId?:string):Promise<boolean>{
 const accessToken=provider==='osmand'&&waitingRideId&&osmandPassengerSupported()?cloudGetToken():null;
 if(nativeAvailable)return (await nativeRequest(navigationMessage[provider],{
  ...point,adjacent,...(accessToken?{rideId:waitingRideId,accessToken}:{}),
 })).ok;
 if(provider!=='google')return false;
 try{await Linking.openURL(googleDirections(point,undefined,true));return true}catch{return false}
}

export function OsmAndHelp(){
 const t=useText();
 const [storeError,setStoreError]=useState(false);
 const [permissionHint,setPermissionHint]=useState(false);
 return <HelpTip title={t('إعداد OsmAnd وتنزيل خريطة سوريا','Set up OsmAnd and download Syria')}>
  <Label>{t('١. اضغط زر Google Play أدناه وثبّت تطبيق OsmAnd.','1. Open Google Play below and install OsmAnd.')}</Label>
  <Label>{t('٢. افتح OsmAnd ثم القائمة ← الخرائط والموارد ← التنزيلات. ابحث عن «سوريا» أو Syria ونزّل الخريطة القياسية.','2. In OsmAnd, go to Menu → Maps & Resources → Downloads. Search for Syria and download the standard map.')}</Label>
  <Label>{t('٣. ارجع إلى يلّا نروح واختر OsmAnd من خيارات الملاحة في الرحلة.','3. Return to Yalla Nrouh and choose OsmAnd in the ride’s navigation options.')}</Label>
  <Label muted>{t('بعد تنزيل الخريطة يمكنك الملاحة دون إنترنت ضمن المنطقة المحمّلة. استقبال الطلبات وتحديثات موقع الزبون يحتاجان اتصالًا.','After downloading the map, you can navigate offline in that area. Ride requests and customer location updates need a connection.')}</Label>
  <Button secondary icon="download-outline" title={t('تحميل OsmAnd من Google Play','Get OsmAnd on Google Play')}
   onPress={()=>{setStoreError(false);void Linking.openURL('https://play.google.com/store/apps/details?id=net.osmand').catch(()=>setStoreError(true));}}/>
  {storeError&&<Label muted>{t('تعذّر فتح المتجر. ابحث عن OsmAnd في Google Play.','Could not open the store. Search Google Play for OsmAnd.')}</Label>}
  {osmandPassengerSupported()&&<>
   <Label>{t('عند فتح ملاحة OsmAnd للذهاب إلى الزبون لأول مرة، تظهر نافذة الموافقة تلقائيًا في الإصدارات التي تدعمها. اضغط «سماح» مرة واحدة.','When you first open OsmAnd to drive to a customer, supported versions show a permission prompt automatically. Tap Allow once.')}</Label>
   <Button secondary icon="person-outline" title={t('إعادة طلب إذن عرض العلامة','Request marker permission again')}
    onPress={()=>{setPermissionHint(false);void nativeRequest('osmand-map-access').then(({ok})=>setPermissionHint(!ok));}}/>
   {permissionHint&&<Label muted>{t('تعذّر فتح نافذة الموافقة. إصدارات OsmAnd الأقدم تفتح الملاحة، لكن عرض العلامة قد لا يكون متاحًا فيها.','Could not open the permission prompt. Older OsmAnd versions still open navigation, but the marker may be unavailable.')}</Label>}
  </>}
 </HelpTip>;
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
 const {colors}=useTheme();
 const {height}=useWindowDimensions();
 const mapHeight=compact?Math.max(110,Math.min(165,Math.round(height*0.33))):235;
 const [showPickup,setShowPickup]=useState(false);
 const [cameraRevision,setCameraRevision]=useState(0);
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
 const passenger=isCoordinate(point)&&age<180?point:undefined;
 const distance=passenger?Math.round(distanceMeters(pickup,passenger)):null;
 const focus=showPickup||!passenger?pickup:passenger;
 const {latitude:focusLat,longitude:focusLng}=focus;
 const cameraTarget=useMemo(()=>({
  point:{latitude:focusLat,longitude:focusLng},revision:cameraRevision,isLocation:false,zoom:19,
 }),[focusLat,focusLng,cameraRevision]);
 useEffect(()=>{
  if(distance===null||age>=30)return;
  if(distance>=100)setAway(true);
  else if(distance<=65)setAway(false);
 },[distance,age]);
 const title=passenger&&!showPickup
  ?age<30?t('موقع الزبون الآن','Customer location now'):t('آخر موقع للزبون','Last customer location')
  :t('نقطة الالتقاء الأصلية','Original meeting point');
 const status=passenger
  ?age<30?t(`تحديث قبل ${age} ث`,`Updated ${age}s ago`):t('موقع الزبون قديم','Customer location is stale')
  :t('موقع الزبون غير متاح الآن','Customer location unavailable');
 const switchTitle=showPickup?t('عرض الزبون','Show customer'):t('عرض نقطة الالتقاء','Show meeting point');
 return <View style={{backgroundColor:colors.background,borderColor:colors.line,borderWidth:1,borderRadius:14,overflow:'hidden'}}>
  <View style={{paddingHorizontal:10,paddingVertical:5}}><Label>{title}</Label></View>
  <View style={{height:mapHeight,overflow:'hidden'}}>
   <MapCanvas compact readOnly minMapHeight={mapHeight} point={pickup} passengerPoint={passenger} cameraTarget={cameraTarget} onChange={()=>{}}/>
  </View>
  <View style={{paddingHorizontal:10,paddingVertical:5}}>
   <Label muted>{status}{distance!==null&&t(` · ${distance} م عن نقطة الالتقاء الأصلية`,` · ${distance} m from original meeting point`)}</Label>
   {passenger&&age<30&&away&&<Label>{t('الزبون ابتعد عن نقطة الالتقاء.','The customer moved away from the meeting point.')}</Label>}
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',columnGap:8}}>
    <Pressable accessibilityRole="button" onPress={()=>setCameraRevision(value=>value+1)} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:5}}>
     <Icon name="locate-outline" size={17} color={colors.purple}/><Label>{t('إعادة التوسيط','Recenter map')}</Label>
    </Pressable>
    {passenger&&<Pressable accessibilityRole="button" onPress={()=>{setShowPickup(value=>!value);setCameraRevision(value=>value+1)}} style={{minHeight:44,justifyContent:'center'}}>
     <Label>{switchTitle}</Label>
    </Pressable>}
   </View>
  </View>
 </View>;
}
