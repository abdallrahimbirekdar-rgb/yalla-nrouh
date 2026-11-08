import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Linking,Pressable,useWindowDimensions,View} from 'react-native';
import {authClient} from './auth-client';
import {isCoordinate,type Coordinate} from './geo';
import {useApp} from './context';
import {distanceMeters} from './navigation-progress';
import MapCanvas from './map/MapCanvas';
import {PassengerMapFrame,usePassengerMapHeight} from './passenger-trip-summary';
import {usePickupEta} from './use-pickup-eta';
import {driverApproachPath,liveDriverFix} from './driver-approach';
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

export function useRideSharing(owner:string|undefined){
 const [capability,setCapability]=useState(bridge()?null:false);
 const [activeRide,setActiveRide]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [problem,setProblem]=useState(false);
 const changing=useRef(false);
 const currentOwner=useRef(owner);currentOwner.current=owner;
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>setProblem(false),[owner]);
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
 const change=useCallback(async(rideId:string,role:SharingRole,stop:boolean)=>{
  if(changing.current||!capability||!owner)return false;
  const current=()=>mounted.current&&currentOwner.current===owner;
  changing.current=true;setBusy(true);setProblem(false);
  let secret:string|null=null;
  try{
   if(stop){
    if(!(await nativeRequest('ride-share-stop',{rideId})).ok)throw Error('stop');
    if(current())setActiveRide(previous=>previous===rideId?null:previous);
   }else{
    const lease=await authClient().rpc('start_live_share',{p_ride:rideId,p_role:role});
    if(lease.error||typeof lease.data!=='string')throw Error('lease');
    secret=lease.data;
    if(!current())throw Error('account');
    if(!(await nativeRequest('ride-share-start',{rideId,secret},65000)).ok)throw Error('start');
    if(!current()){
     if(currentOwner.current!==owner)await nativeRequest('ride-share-stop',{rideId});
     throw Error('account');
    }
    setActiveRide(rideId);
   }
   return true;
  }catch{
   if(secret)void authClient().rpc('live_update',{p_secret:secret,p_lat:null,p_lng:null,p_time:null,p_stop:true}).then(()=>{});
   if(current())setProblem(true);
   return false;
  }finally{changing.current=false;if(mounted.current)setBusy(false)}
 },[capability,owner]);
 const start=useCallback((rideId:string,role:SharingRole)=>change(rideId,role,false),[change]);
 const stop=useCallback((rideId:string)=>change(rideId,'driver',true),[change]);
 return {capability,activeRide,busy,problem,start,stop};
}

export const osmandNavigationSupported=()=>typeof window!=='undefined'&&
 (window as Window&{__YALLA_OSMAND_PASSENGER__?:boolean}).__YALLA_OSMAND_PASSENGER__===true;

export function stopOsmAndPassenger(){
 if(!osmandNavigationSupported())return;
 try{bridge()?.postMessage(JSON.stringify({type:'osmand-passenger-stop'}))}catch{/* The native service also checks ride eligibility. */}
}

export async function openOsmAnd(point:Coordinate,adjacent:boolean):Promise<boolean>{
 return (await nativeRequest('ride-osmand',{...point,adjacent})).ok;
}

export function OsmAndHelp(){
 const t=useText();
 const [storeError,setStoreError]=useState(false);
 return <HelpTip title={t('إعداد OsmAnd وتنزيل خريطة سوريا','Set up OsmAnd and download Syria')}>
  <Label>{t('١. اضغط زر Google Play أدناه وثبّت تطبيق OsmAnd.','1. Open Google Play below and install OsmAnd.')}</Label>
  <Label>{t('٢. افتح OsmAnd ثم القائمة ← الخرائط والموارد ← التنزيلات. ابحث عن «سوريا» أو Syria ونزّل الخريطة القياسية.','2. In OsmAnd, go to Menu → Maps & Resources → Downloads. Search for Syria and download the standard map.')}</Label>
  <Label>{t('٣. ارجع إلى يلّا نروح واضغط زر الملاحة في الرحلة. يبدأ OsmAnd مسار السيارة من موقعك الحالي بعد حساب الطريق.','3. Return to Yalla Nrouh and tap the ride’s navigation button. OsmAnd starts driving guidance from your current location after calculating the route.')}</Label>
  <Label muted>{t('بعد تنزيل الخريطة يمكنك الملاحة دون إنترنت ضمن المنطقة المحمّلة. استقبال الطلبات وتحديثات موقع الزبون يحتاجان اتصالًا.','After downloading the map, you can navigate offline in that area. Ride requests and customer location updates need a connection.')}</Label>
  <Button secondary icon="download-outline" title={t('تحميل OsmAnd من Google Play','Get OsmAnd on Google Play')}
   onPress={()=>{setStoreError(false);void Linking.openURL('https://play.google.com/store/apps/details?id=net.osmand').catch(()=>setStoreError(true));}}/>
  {storeError&&<Label muted>{t('تعذّر فتح المتجر. ابحث عن OsmAnd في Google Play.','Could not open the store. Search Google Play for OsmAnd.')}</Label>}
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

export function CustomerTracking({rideId,pickup,proposedPickup,foreground,compact,duringTrip=false,taxiFix=null}:{
 rideId:string;pickup:Coordinate;proposedPickup?:Coordinate;foreground:boolean;compact?:boolean;
 duringTrip?:boolean;taxiFix?:{point:Coordinate;time:number}|null;
}){
 const t=useText(),{state}=useApp(),{colors}=useTheme();
 const {height}=useWindowDimensions(),expandedHeight=usePassengerMapHeight();
 const mapHeight=compact?Math.max(110,Math.min(165,Math.round(height*0.33))):expandedHeight;
 const [showPickup,setShowPickup]=useState(false),[cameraRevision,setCameraRevision]=useState(0);
 const [pageVisible,setPageVisible]=useState(()=>typeof document!=='undefined'&&document.visibilityState==='visible');
 useEffect(()=>{
  if(!compact||typeof document==='undefined')return;
  const visibility=()=>setPageVisible(document.visibilityState==='visible');
  document.addEventListener('visibilitychange',visibility);
  return()=>document.removeEventListener('visibilitychange',visibility);
 },[compact]);
 const visible=compact?pageVisible:foreground;
 const row=useRideRow('ride_passenger_positions',rideId,visible);
 const [now,setNow]=useState(Date.now),[away,setAway]=useState(false);
 useEffect(()=>{
  if(!visible)return;
  setNow(Date.now());
  const timer=setInterval(()=>setNow(Date.now()),1000);
  return()=>clearInterval(timer);
 },[visible]);
 const point=useMemo(()=>({latitude:row?.latitude,longitude:row?.longitude}),[row?.latitude,row?.longitude]);
 const measured=typeof row?.measured_at==='string'?Date.parse(row.measured_at):NaN;
 const age=Math.max(0,Math.floor((now-measured)/1000));
 const passenger=isCoordinate(point)&&age<180?point:undefined;
 const distance=passenger&&!duringTrip?Math.round(distanceMeters(pickup,passenger)):null;
 const meetingPoint=proposedPickup??pickup;
 // The same street-route estimate used for the passenger's approach map.
 const taxi=liveDriverFix(taxiFix,now);
 const eta=usePickupEta(duringTrip?null:taxi,meetingPoint,!duringTrip&&!!taxi&&visible,state.language);
 const {path:approachRoute,fallback}=useMemo(
  ()=>driverApproachPath(duringTrip?null:taxi,meetingPoint,eta.route),
  [duringTrip,taxi?.point.latitude,taxi?.point.longitude,meetingPoint.latitude,meetingPoint.longitude,eta.route],
 );
 const overview=!duringTrip&&!!taxi&&!showPickup;
 const focus=duringTrip&&passenger?passenger:showPickup&&passenger?passenger:meetingPoint;
 const {latitude:focusLat,longitude:focusLng}=focus;
 const cameraTarget=useMemo(()=>({
  point:{latitude:focusLat,longitude:focusLng},revision:cameraRevision,isLocation:false,zoom:19,overview,
 }),[focusLat,focusLng,cameraRevision,overview]);
 useEffect(()=>{
  if(distance===null||age>=30)return;
  if(distance>=100)setAway(true);else if(distance<=65)setAway(false);
 },[distance,age]);
 const title=duringTrip
  ?t('موقع الزبون','Customer location')
  :t('الطريق إلى نقطة ركوب الزبون','Route to customer pickup');
 const status=passenger
  ?age<30?t('تحديث موقع الزبون قبل '+age+' ثانية','Customer location updated '+age+' s ago')
    :t('آخر موقع للزبون غير حديث','Customer location is not current')
  :t('موقع الزبون غير متاح الآن','Customer location unavailable');
 const remaining=taxi?(eta.meters??Math.round(distanceMeters(taxi.point,meetingPoint))):null;
 const distanceText=remaining===null?null:remaining>=1000
  ?(remaining/1000).toLocaleString(state.language,{maximumFractionDigits:1})+' '+t('كم','km')
  :remaining.toLocaleString(state.language)+' '+t('م','m');
 if(duringTrip&&!passenger)return null;
 return <View style={{backgroundColor:colors.background,borderColor:colors.line,borderWidth:1,borderRadius:16,overflow:'hidden',gap:5}}>
  <View style={{paddingHorizontal:10,paddingTop:9,paddingBottom:4}}><Label>{title}</Label></View>
  <View style={{height:mapHeight}}>
   <PassengerMapFrame>
    <View style={{height:mapHeight-8,overflow:'hidden',borderRadius:14}}>
     <MapCanvas compact readOnly minMapHeight={mapHeight-8} point={duringTrip?null:meetingPoint}
      passengerPoint={passenger} taxiPoint={taxi?.point} route={approachRoute} cameraTarget={cameraTarget} onChange={()=>{}}/>
    </View>
   </PassengerMapFrame>
  </View>
  <View style={{paddingHorizontal:10,paddingBottom:9,gap:6}}>
   {!duringTrip&&<View style={{gap:3}}>
    {taxi&&eta.minutes!==null
     ?<Label>{t('الوصول خلال نحو ','Arriving in about ')}{eta.minutes.toLocaleString(state.language)} {t('دقيقة','min')}</Label>
     :taxi?<Label muted>{eta.pending?t('جارٍ حساب وقت الوصول…','Estimating arrival time…'):t('وقت الوصول غير متاح بعد.','Arrival time not available yet.')}</Label>
      :<Label muted>{t('بانتظار تحديث موقع السيارة لعرض المسار.','Waiting for the taxi location to show the route.')}</Label>}
    {distanceText&&<Label>{eta.meters===null?t('المسافة المباشرة التقريبية: ','Approximate direct distance: '):t('المسافة المتبقية بالطريق: ','Remaining road distance: ')}{distanceText}</Label>}
    {fallback&&<Label muted>{t('الخط المباشر مؤقت حتى توفر مسار الشوارع.','The straight line is temporary until the road route is available.')}</Label>}
   </View>}
   <Label muted>{status}{distance!==null?t(' · ابتعد عن نقطة الالتقاء الأصلية '+distance+' م',' · '+distance+' m from original pickup'):''}</Label>
   {!duringTrip&&passenger&&age<30&&away&&<Label>{t('الزبون ابتعد عن نقطة الالتقاء.','The customer moved away from the pickup point.')}</Label>}
   <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',columnGap:8}}>
    <Pressable accessibilityRole="button" onPress={()=>setCameraRevision(value=>value+1)} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:5}}>
     <Icon name="locate-outline" size={17} color={colors.purple}/><Label>{t('إعادة التوسيط','Recenter map')}</Label>
    </Pressable>
    {!duringTrip&&passenger&&<Pressable accessibilityRole="button" onPress={()=>{setShowPickup(value=>!value);setCameraRevision(value=>value+1)}} style={{minHeight:44,justifyContent:'center'}}>
     <Label>{showPickup?t('عرض المسار إلى الزبون','Show route to pickup'):t('عرض الزبون','Show customer')}</Label>
    </Pressable>}
   </View>
  </View>
 </View>;
}
