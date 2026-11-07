import {isValhallaPilotDriver} from '../valhalla-route';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Pressable,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {authErrorMessage} from '../auth-errors';
import {cloudCurrentToken,cloudDriverDispatchPing,cloudMutationUncertain,cloudMyRides,cloudDriverInbox,cloudOpenRides,cloudDeclineDriverOffer,cloudAcceptRide,cloudAdvanceRide,cloudReleaseRide,cloudCancelRide,cloudConfirmPickup,cloudRegisterDriver,cloudSetDriverOnline,type CloudRide,type CloudDriver,type DriverHistoryKind,type RidePreview} from '../cloud-api';
import {navigationPosition} from '../navigation-position';
import MapCanvas from '../map/MapCanvas';
import RideOptions from '../ride-options';
import {isCoordinate} from '../geo';
import {PassengerFare,PassengerStops,RideFooter} from '../passenger-trip-summary';
import DriverOffer from '../driver-offer';
import type {RoutePlan} from '../routing';
import DriverNavigation from '../driver-navigation';
import {DriverQueueEmpty,DriverQueueHeader,DriverShift} from '../driver-dashboard';
import {DriverHistory,DriverHistoryBar} from '../driver-history';
import {useDriverOfferSound} from '../use-driver-offer-sound';
import {useCurrentPosition} from '../use-current-position';
import {PassengerTaxiMap,RideSearchTimer,useShareTaxiPosition} from '../taxi-tracking';
import {CustomerTracking,MapsMeHelp,openRideMaps,pickupChange,useRideRow,useRideSharing,type NavigationProvider} from '../ride-live-sharing';
import {authClient} from '../auth-client';
import {useRideRecovery} from '../use-ride-recovery';
import {claimDriverSharingAttempt,readDriverSharingConsent,saveDriverSharingConsent} from '../driver-sharing-consent';
import {createRefreshQueue} from '../refresh-queue';
import {Button,HelpTip,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
const live=(r:CloudRide)=>!['completed','cancelled'].includes(r.status);
export default function Rides(){
 const auth=useAuth();const userId=auth.session?.user.id;const {state,draft,setDraft,foreground,connection}=useApp();const t=useText();const {colors}=useTheme();const params=useLocalSearchParams<{mode?:string;ride?:string}>();const driverMode=auth.driver||params.mode==='driver';const historyMode=!driverMode&&params.mode==='history';
 const passengerTitle=historyMode?t('الرحلات السابقة','Past rides'):t('رحلتي الحالية','Current ride');
 const [pilotOwner,setPilotOwner]=useState<string|null>(null);
 const [pilotRide,setPilotRide]=useState<string|null>(null);
 const [offerLimit,setOfferLimit]=useState(3);
 const [workTarget,setWorkTarget]=useState<boolean|null>(null);
 const [focusedOffer,setFocusedOffer]=useState<string|null>(null);
 const [historyKind,setHistoryKind]=useState<DriverHistoryKind|null>(null);
 const [declined,setDeclined]=useState<{owner:string;ids:string[]}|null>(null);
 const closeHistory=useCallback(()=>setHistoryKind(null),[]);
 useEffect(()=>{
  setHistoryKind(null);setFocusedOffer(null);setOfferLimit(3);
  setDeclined(null);
 },[userId]);
 const [acceptedPlans,setAcceptedPlans]=useState<{rideId:string;trip:RoutePlan|null;pickup:RoutePlan|null}|null>(null);
 const [rides,setRides]=useState<CloudRide[]>([]),[driver,setDriver]=useState<CloudDriver|null>(null),[offers,setOffers]=useState<RidePreview[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[inboxProblem,setInboxProblem]=useState(false);
 const [offerClock,setOfferClock]=useState(()=>performance.now());
 useEffect(()=>{
  if(!driverMode||offers.length===0)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  function tick(){
   const now=performance.now();
   setOfferClock(now);
   const next=offers.reduce((nearest,offer)=>{
    const remaining=(offer.expiresOnDevice??0)-now;
    return remaining>0?Math.min(nearest,remaining):nearest;
   },Infinity);
   if(Number.isFinite(next))timer=setTimeout(tick,Math.min(1000,Math.ceil(next)));
  }
  tick();
  return()=>clearTimeout(timer);
 },[driverMode,offers]);
 const offerRead=useRef(0),historyRead=useRef(0);
 const alive=useRef(true),queue=useRef(createRefreshQueue()).current,identity=useRef(auth.session?.user.id),mode=useRef(driverMode);identity.current=auth.session?.user.id;mode.current=driverMode;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const refresh=useCallback(async()=>{
  if(!userId)return;
  const isCurrent=()=>alive.current&&identity.current===userId&&mode.current===driverMode;
  return queue.run(async()=>{
   if(!isCurrent())return;
   const token=await cloudCurrentToken();
   const ticket=++offerRead.current,historyTicket=++historyRead.current;
   const readInbox=driverMode?cloudDriverInbox(token):Promise.resolve({driver:null,offers:[] as RidePreview[]});
   const [history,inbox]=await Promise.allSettled([
    cloudMyRides(token).then(next=>{if(isCurrent()&&historyTicket===historyRead.current)setRides(next)}),
    readInbox.then(next=>{
     if(!isCurrent())return;
     setDriver(next.driver);
     if(ticket===offerRead.current){setOffers(next.offers);setInboxProblem(false)}
    })
   ]);
   if(!isCurrent())return;
   setLoading(false);
   if(inbox.status==='rejected'){
    if(ticket===offerRead.current)setInboxProblem(true);
    throw inbox.reason;
   }
   if(history.status==='rejected')throw history.reason;
  });
 },[userId,driverMode,queue]);
 useEffect(()=>{setRides([]);setOffers([]);setDriver(null);setInboxProblem(false);setLoading(true);if(!userId){setLoading(false);return}let active=true;void refresh().catch(()=>{if(active){setNotice(state.language==='ar'?'تعذر تحميل الرحلات. تحقق من الاتصال وأعد المحاولة.':'Could not load rides. Check internet and retry.');setLoading(false)}});return()=>{active=false}},[refresh,userId,state.language]);
 const currentDriverRide=driverMode?rides.find(r=>r.driver_id===userId&&live(r)):undefined;
 useEffect(()=>{
  let active=true;
  if(userId&&driverMode&&driver?.approved){
   void isValhallaPilotDriver(userId).then(allowed=>{if(active&&allowed)setPilotOwner(userId)}).catch(()=>{});
  }else setPilotOwner(null);
  return()=>{active=false};
 },[userId,driverMode,driver?.approved]);
 useEffect(()=>{if(pilotRide!==currentDriverRide?.id)setPilotRide(null)},[pilotRide,currentDriverRide?.id]);
 const gps=useCurrentPosition(driverMode&&Boolean(currentDriverRide||driver?.approved&&driver.online)&&state.preferences.permissionsIntroSeen);
 useEffect(()=>{
  if(!driverMode||!driver?.approved||!driver.online||currentDriverRide||!foreground||connection==='offline')return;
  const controller=new AbortController();
  let running=false;
  async function update(){
   if(running||controller.signal.aborted)return;
   running=true;
   try{
    const fix=await navigationPosition(false,controller.signal);
    const token=await cloudCurrentToken();
    if(!controller.signal.aborted)await cloudDriverDispatchPing(token,fix);
   }catch{/* The regional fallback covers a driver without a current fix. */}
   finally{running=false}
  }
  void update();
  const timer=setInterval(()=>void update(),35000);
  return()=>{controller.abort();clearInterval(timer)};
 },[userId,driverMode,driver?.approved,driver?.online,currentDriverRide,foreground,connection]);
 const recovery=useRideRecovery('accept',driverMode?userId:undefined,foreground,busy,ride=>{
  historyRead.current++;
  setRides(previous=>[ride,...previous.filter(item=>item.id!==ride.id)]);
  setNotice(t('تم تأكيد قبول الطلب.','Request acceptance confirmed.'));
  void refresh().catch(()=>{});
 });
 const approachingRide=currentDriverRide?.status==='accepted'?currentDriverRide:undefined;
 const sharing=useRideSharing(userId);
 const [consentChoice,setConsentChoice]=useState<{owner:string;allowed:boolean}|null>(null);
 const driverConsent=useMemo(()=>{
  if(!userId||typeof localStorage==='undefined')return false;
  if(consentChoice?.owner===userId)return consentChoice.allowed;
  return readDriverSharingConsent(localStorage,userId).allowed;
 },[userId,consentChoice]);
 const [consentError,setConsentError]=useState(false);
 const [trackingBackend,setTrackingBackend]=useState(false);
 const hasLiveRide=rides.some(live);
 const mayShare=hasLiveRide||driverMode&&driver?.approved===true;
 useEffect(()=>{
  if(!userId||!foreground||!mayShare||connection==='offline')return;
  const controller=new AbortController();
  void authClient().from('ride_pickup_changes').select('ride_id',{head:true}).limit(1).abortSignal(controller.signal)
   .then(({error})=>{if(!controller.signal.aborted&&!error)setTrackingBackend(true)});
  return()=>controller.abort();
 },[userId,foreground,mayShare,connection]);
 const driverRideId=currentDriverRide?.id;
 const {capability:sharingCapability,activeRide:sharingRide,busy:sharingBusy,start:startSharing}=sharing;
 const automaticStart=useRef<{rideId:string;task:Promise<boolean>}|null>(null);
 const startDriverSharing=useCallback((rideId:string,manual=false)=>{
  if(!userId||typeof localStorage==='undefined'||!driverConsent||!sharingCapability||
     !trackingBackend||!foreground||connection==='offline'||sharingRide||sharingBusy)return;
  if(automaticStart.current||!claimDriverSharingAttempt(localStorage,userId,rideId)&&!manual)return;
  const task=startSharing(rideId,'driver');
  automaticStart.current={rideId,task};
  void task.finally(()=>{if(automaticStart.current?.task===task)automaticStart.current=null});
 },[userId,driverConsent,sharingCapability,trackingBackend,foreground,connection,sharingRide,sharingBusy,startSharing]);
 useEffect(()=>{
  if(driverRideId)startDriverSharing(driverRideId);
 },[driverRideId,startDriverSharing]);
 useShareTaxiPosition(driverConsent&&(sharingCapability===false||!trackingBackend)?approachingRide?.id:undefined,foreground);

 function setDriverSharingConsent(allowed:boolean){
  if(!userId||typeof localStorage==='undefined')return;
  const saved=saveDriverSharingConsent(localStorage,userId,{allowed});
  setConsentError(!saved);
  if(saved||!allowed)setConsentChoice({owner:userId,allowed});
  if(!allowed&&sharingRide&&sharingRide===driverRideId)void sharing.stop(sharingRide);
 }
 const [compactRide,setCompactRide]=useState<string|null>(()=>{
  try{return localStorage.getItem('yn-driver-split-ride')}catch{return null}
 });
 function setSplitRide(rideId:string|null){
  setCompactRide(rideId);
  try{if(rideId)localStorage.setItem('yn-driver-split-ride',rideId);else localStorage.removeItem('yn-driver-split-ride')}catch{/* The view still switches. */}
 }
 const [navigationProvider,setNavigationProvider]=useState<NavigationProvider>(()=>{
  try{
   const saved=localStorage.getItem('yn-driver-navigation');
   return saved==='mapsme'?saved:'google';
  }catch{return 'google'}
 });
 const [proposing,setProposing]=useState(false);
 const [proposed,setProposed]=useState<string|null>(null);
 const activeRide=rides.some(live);const shouldPoll=foreground&&connection!=='offline'&&(activeRide||driverMode&&(!driver||driver.approved&&driver.online));
 useEffect(()=>{
  if(!userId||!shouldPoll)return;
  const tick=()=>{if(AppState.currentState!=='background')void refresh().catch(()=>{if(alive.current)setNotice(state.language==='ar'?'تعذر تحديث الطلبات. تحقق من الاتصال واضغط تحديث الرحلات.':'Could not update requests. Check internet and refresh.')})};
  const interval=driverMode?(state.preferences.dataSaver?30000:15000):(state.preferences.dataSaver?6000:4000);
  const timer=setInterval(tick,interval);return()=>clearInterval(timer);
 },[refresh,shouldPoll,userId,driverMode,state.preferences.dataSaver,state.language]);
 useEffect(()=>{
  if(!userId||!driverMode||!driver?.approved||!driver.online||!foreground||connection==='offline'||currentDriverRide?.id)return;
  let active=true,running=false;const owner=userId;
  const tick=async()=>{
   if(running||document.visibilityState==='hidden'||AppState.currentState==='background')return;
   running=true;const ticket=++offerRead.current;
   try{const next=await cloudOpenRides(await cloudCurrentToken());if(active&&identity.current===owner&&mode.current&&ticket===offerRead.current){setOffers(next);setInboxProblem(false)}}
   catch{if(active&&identity.current===owner&&ticket===offerRead.current)setInboxProblem(true)}
   finally{running=false}
  };
  void tick();
  const timer=setInterval(()=>void tick(),state.preferences.dataSaver?4000:3000);
  return()=>{active=false;clearInterval(timer)};
 },[userId,driverMode,driver?.approved,driver?.online,foreground,connection,currentDriverRide?.id,state.preferences.dataSaver]);
 useEffect(()=>{if(!userId)return;const resume=()=>{if(document.visibilityState!=='hidden')void refresh().catch(()=>{if(alive.current)setNotice(state.language==='ar'?'تعذر تحديث الطلبات. تحقق من الاتصال واضغط تحديث الرحلات.':'Could not update requests. Check internet and refresh.')})};const native=(event:Event)=>{if((event as CustomEvent).detail?.active===true)resume()};window.addEventListener('online',resume);window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('yalla:native-visibility',native);return()=>{window.removeEventListener('online',resume);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('yalla:native-visibility',native)}},[userId,refresh,state.language]);
 async function run(work:(token:string)=>Promise<void>,success?:string){if(busy)return;setBusy(true);setNotice('');try{await work(await cloudCurrentToken());await refresh();if(success)setNotice(success)}catch(e){const kind=(e as {kind?:string})?.kind??(e as Error)?.message;setNotice(kind==='waiting_passenger_confirmation'?t('بانتظار تأكيد الراكب ركوب السيارة.','Waiting for passenger pickup confirmation.'):kind==='driver_not_approved'?t('حساب السائق بانتظار الاعتماد.','Driver account is waiting for approval.'):authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}}
 async function accept(offer:RidePreview,routes:{trip:RoutePlan|null;pickup:RoutePlan|null}){
  if(busy||!userId||currentDriverRide||recovery.checking||recovery.id&&recovery.id!==offer.ride_id)return;
  if((offer.expiresOnDevice??0)<=performance.now()){
   setNotice(t('انتهت مهلة هذا الطلب.','This request has expired.'));
   return;
  }
  setBusy(true);setNotice('');
  let submitted=false;
  try{
   const token=await cloudCurrentToken();
   if(identity.current!==userId||!mode.current)return;
   recovery.remember(offer.ride_id);submitted=true;
   setAcceptedPlans({rideId:offer.ride_id,...routes});
   const accepted=await cloudAcceptRide(token,offer.ride_id);
   if(identity.current!==userId||!mode.current)return;
   if(!accepted&&!recovery.id){
    recovery.clear();
    setNotice(t('هذا الطلب لم يعد متاحًا للقبول.','This request is no longer available to accept.'));
   }
   // Keep the operation until a read confirms the assignment.
   void refresh().catch(()=>{});
  }catch(error){
   if(identity.current!==userId||!mode.current)return;
   if(submitted&&cloudMutationUncertain(error))return;
   if(submitted&&!recovery.id)recovery.clear();
   setNotice(authErrorMessage(error,state.language==='ar'));
  }finally{setBusy(false)}
 }
 const status=(value:string)=>({requested:t('بانتظار السائق','Waiting for driver'),accepted:t('السائق في الطريق','Driver is on the way'),arrived:t('وصل السائق','Driver arrived'),riding:t('الرحلة جارية','Ride in progress'),completed:t('مكتملة','Completed'),cancelled:t('ملغاة','Cancelled')} as Record<string,string>)[value]??value;
 const mine=rides.filter(r=>r.passenger_id===userId);
 const currentPassengerRide=mine.find(live);
 const proposalRide=approachingRide?.id??(!driverMode&&currentPassengerRide?.status==='accepted'?currentPassengerRide.id:undefined);
 const proposal=pickupChange(useRideRow('ride_pickup_changes',proposalRide,foreground));
 const driverSharingControl=(ride?:CloudRide)=><View style={{gap:6}}>
  <Label muted>{t('اسمح مرة واحدة على هذا الجهاز. يشارك التطبيق موقعك تلقائيًا مع زبون الرحلة المعيّنة لك، ويتوقف عند انتهاء الرحلة أو إلغائها.','Allow once on this device. Your location is shared automatically with the customer assigned to your ride and stops when the ride ends or is cancelled.')}</Label>
  <Button secondary icon="locate-outline" title={driverConsent
   ?t('إيقاف المشاركة التلقائية','Turn off automatic sharing')
   :t('السماح بالمشاركة التلقائية','Allow automatic sharing')}
   disabled={sharing.busy} onPress={()=>setDriverSharingConsent(!driverConsent)}/>
  {ride&&sharing.capability&&(sharing.activeRide===ride.id||trackingBackend&&driverConsent)&&<Button secondary
   title={sharing.activeRide===ride.id?t('إيقاف المشاركة لهذه الرحلة','Stop sharing for this ride'):t('بدء المشاركة لهذه الرحلة','Start sharing for this ride')}
   disabled={sharing.busy} onPress={()=>sharing.activeRide===ride.id?void sharing.stop(ride.id):startDriverSharing(ride.id,true)}/>}
  {driverConsent&&sharing.capability&&<Label muted>{t('على أندرويد تستمر المشاركة أثناء الملاحة وتقدر توقفها من الإشعار.','On Android, sharing continues during navigation. You can stop it from the notification.')}</Label>}
  {consentError&&<Label muted>{t('تعذّر حفظ اختيارك على هذا الجهاز.','Could not save your choice on this device.')}</Label>}
  {ride&&sharing.problem&&<Label muted>{t('تعذّرت المشاركة. تحقق من الاتصال وإذن الموقع الدقيق والإشعارات، ثم حاول مجددًا.','Could not share. Check your connection, precise location and notification permissions, then try again.')}</Label>}
 </View>;
 const sharePassenger=(ride:CloudRide)=>sharing.capability&&trackingBackend&&<View style={{gap:6}}>
  <Label muted>{t('بموافقتك يرى السائق المعيّن موقعك أثناء انتظار السيارة، حتى لو كان التطبيق في الخلفية.','With your consent, the assigned driver can see your location while you wait, including in the background.')}</Label>
  <Button secondary icon="locate-outline" title={sharing.activeRide===ride.id?t('إيقاف مشاركة موقعي','Stop sharing my location'):t('أوافق على مشاركة موقعي','I agree to share my location')}
   disabled={sharing.busy} onPress={()=>sharing.activeRide===ride.id?void sharing.stop(ride.id):void sharing.start(ride.id,'passenger')}/>
  <HelpTip title={t('متى تُشارك إحداثياتي؟','When is my location shared?')}>
   <Label>{t('يمكنك إيقاف المشاركة من هنا أو من إشعار أندرويد. تتوقف تلقائيًا عند انتهاء المرحلة التي تحتاج إلى موقعك.','You can stop sharing here or from the Android notification. Sharing stops automatically when your location is no longer needed for that part of the ride.')}</Label>
  </HelpTip>
  {sharing.problem&&<Label muted>{t('تعذّر تغيير المشاركة. تحقق من الاتصال وإذن الموقع الدقيق والإشعارات.','Could not change sharing. Check your connection, precise location and notification permissions.')}</Label>}
 </View>;
 async function proposePickup(ride:CloudRide){
  if(proposing)return;
  setProposing(true);setNotice('');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
   const fix=await navigationPosition(true,controller.signal);
   const {data,error}=await authClient().rpc('change_pickup',{p_ride:ride.id,p_proposal:null,p_lat:fix.latitude,p_lng:fix.longitude});
   if(error||!data)throw Error('proposal');
   setProposed(ride.id);
  }catch{setNotice(t('تعذّر اقتراح موقعك الحالي. تحقق من GPS والاتصال.','Could not propose your current location. Check GPS and internet.'))}
  finally{clearTimeout(timer);setProposing(false)}
 }
 const providers={google:'Google Maps',mapsme:'MAPS.ME'} as const;
 const navigationOptions=<View style={{gap:4}}>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
  {(['google','mapsme'] as const).map(provider=><View key={provider} style={{flexGrow:1}}>
   <Button secondary={navigationProvider!==provider} title={providers[provider]} onPress={()=>{
    setNavigationProvider(provider);
    try{localStorage.setItem('yn-driver-navigation',provider)}catch{/* Use the selection for this session. */}
   }}/>
  </View>)}
 </View>
 <MapsMeHelp/>
 <HelpTip title={t('كيف يعمل تقسيم الشاشة؟','How does split screen work?')}>
  <Label>{t('إذا فتحت الملاحة وحدها، افتح «التطبيقات الأخيرة»، اضغط أيقونة «يلّا نروح» واختر «فتح في عرض تقسيم الشاشة»، ثم اختر تطبيق الملاحة. إذا لم يظهر الخيار، استخدم الوضع العادي.','If navigation opens on its own, open Recents, tap the Yalla Nrouh icon, choose split screen and select your navigation app. If the option is missing, use normal mode.')}</Label>
 </HelpTip>
 </View>;
 function showExternal(ride:CloudRide,point:{latitude:number;longitude:number},adjacent:boolean){
  setSplitRide(adjacent?ride.id:null);
  setNotice('');
  const open=async()=>{
   startDriverSharing(ride.id);
   const pending=automaticStart.current;
   if(pending?.rideId===ride.id){
    // Give the native sharing service a chance to start before Android
    // backgrounds the app. A slow network must not block navigation.
    let timer:ReturnType<typeof setTimeout>|undefined;
    await Promise.race([pending.task,new Promise<void>(resolve=>{timer=setTimeout(resolve,4000)})]);
    clearTimeout(timer);
   }
   if(!alive.current||identity.current!==userId||!mode.current)return;
   const result=await openRideMaps(point,adjacent,sharing.capability===true,navigationProvider);
   if(!alive.current||identity.current!==userId||result==='opened')return;
   if(result==='update-required')setNotice(t('لفتح MAPS.ME من الرحلة، ثبّت أحدث نسخة أندرويد من يلّا نروح.','To open MAPS.ME from a ride, install the latest Yalla Nrouh Android app.'));
   else if(result==='pin')setNotice(t('فتحت نقطة الوجهة في MAPS.ME. اضغط عليها واختر «الطريق إلى هنا».','The destination opened in MAPS.ME. Tap it and choose Route To.'));
   else setNotice(navigationProvider==='google'
    ?t('تعذّر فتح خرائط Google. يمكنك إعادة المحاولة من شاشة الرحلة.','Could not open Google Maps. You can retry from the ride screen.')
    :t('تعذّر فتح MAPS.ME. تأكد من تثبيته على هاتف السائق.','Could not open MAPS.ME. Make sure it is installed on the driver’s phone.'));
  };
  void open();
 }

 function startDriverRide(ride:CloudRide){
  const adjacent=compactRide===ride.id;
  void run(async token=>{
   const result=await cloudAdvanceRide(token,ride.id,'riding');
   if(result!=='riding')throw Error(result);
   if(alive.current&&identity.current===userId&&mode.current){
    showExternal(ride,{latitude:ride.destination_lat,longitude:ride.destination_lng},adjacent);
   }
  });
 }
 function driverRideAction(ride:CloudRide){
  if(ride.status==='accepted')return <Button prominent icon="location-outline" title={t('وصلت إلى الزبون','I arrived at pickup')} disabled={busy}
   onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'arrived')!=='arrived')throw Error('not_allowed')})}/>;
  if(ride.status==='arrived')return <Button prominent title={ride.pickup_confirmed_at?t('بدء الرحلة وفتح الملاحة','Start ride and open navigation'):t('بانتظار تأكيد الزبون','Waiting for passenger')}
   disabled={busy||!ride.pickup_confirmed_at} onPress={()=>startDriverRide(ride)}/>;
  return <Button prominent icon="checkmark-circle-outline" title={t('إنهاء الرحلة','Finish ride')} disabled={busy}
   onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'completed')!=='completed')throw Error('not_allowed')})}/>;
 }

 const passengerRides=mine.filter(ride=>historyMode?!live(ride):ride.id===(currentPassengerRide?.id??params.ride));
 const searchingRide=!driverMode&&!historyMode&&currentPassengerRide?.status==='requested'?currentPassengerRide:undefined;
 function cancelRequest(ride:CloudRide){
  void run(async token=>{if(!await cloudCancelRide(token,ride.id))throw Error('not_allowed')},t('تم إلغاء الطلب.','Request cancelled.'));
 }
 function reuseDestination(ride:CloudRide){
  if(currentPassengerRide){router.replace('/cloud');return}
  const destinationPoint={latitude:ride.destination_lat,longitude:ride.destination_lng};
  if(!isCoordinate(destinationPoint))return;
  setDraft(previous=>({...previous,destination:ride.destination,destinationPoint}));
  router.replace({pathname:'/location',params:{target:'pickup'}});
 }
 const hiddenOffers=declined?.owner===userId?declined?.ids:undefined;
 const audibleOffers=useMemo(()=>offers.filter(offer=>!hiddenOffers?.includes(offer.ride_id)),[offers,hiddenOffers]);
 const sound=useDriverOfferSound(userId,Boolean(driverMode&&auth.rolesReady&&driver?.approved&&driver.online&&foreground&&!loading&&!busy&&!currentDriverRide&&!recovery.checking),audibleOffers);
 const availableOffers=audibleOffers.filter(offer=>(offer.expiresOnDevice??0)>offerClock);
 const visibleOffers=availableOffers.slice(0,offerLimit);
 const selectedOffer=visibleOffers.some(offer=>offer.ride_id===focusedOffer)?focusedOffer:visibleOffers[0]?.ride_id;
 function decline(id:string){
  if(!userId||busy||hiddenOffers?.includes(id))return;
  setDeclined(previous=>({owner:userId,ids:[id,...(previous?.owner===userId?previous.ids:[])]}));
  if(recovery.id===id)recovery.clear();
  void cloudCurrentToken().then(token=>{
   if(identity.current!==userId||!mode.current)return;
   return cloudDeclineDriverOffer(token,id);
  }).catch(()=>{
   if(!alive.current||identity.current!==userId||!mode.current)return;
   setDeclined(previous=>previous?.owner===userId?{owner:userId,ids:previous.ids.filter(item=>item!==id)}:previous);
   setNotice(t('تعذر حفظ رفض الطلب. جرّب مرة ثانية.','Could not save the decline. Try again.'));
  });
 }
 async function toggleWork(){
  if(!driver?.approved||busy||workTarget!==null||recovery.checking)return;
  const online=!driver.online;
  if(online)void sound.unlock();
  setWorkTarget(online);
  try{
   await run(async token=>{if(!await cloudSetDriverOnline(token,online))throw Error('not_allowed')});
  }finally{setWorkTarget(null)}
 }
 const renderRide=(ride:CloudRide)=><Panel key={ride.id}>
   {ride.id!==searchingRide?.id&&<View style={{alignSelf:'flex-start',borderRadius:20,paddingHorizontal:12,paddingVertical:4,backgroundColor:colors.selected}}><Label muted>{ride.search_expired_at?t('انتهى البحث بدون سائق','Search expired without a driver'):status(ride.status)}</Label></View>}
   {typeof ride.estimated_fare==='number'&&<PassengerFare fare={ride.estimated_fare}/>}
   <PassengerStops pickup={ride.pickup} destination={ride.destination} category={ride.category}/>
   {['requested','accepted','arrived'].includes(ride.status)&&!ride.pickup_confirmed_at&&sharePassenger(ride)}
   {trackingBackend&&ride.status==='accepted'&&<>
    {proposal?.approved?<Label>{t('وافق السائق على نقطة الالتقاء الجديدة.','The driver approved the new meeting point.')}</Label>
     :<Button secondary title={t('اقتراح موقعي الحالي كنقطة التقاء','Suggest my current location as the meeting point')} disabled={proposing} onPress={()=>void proposePickup(ride)}/>}
    {(proposed===ride.id||proposal)&&!proposal?.approved&&<Label muted>{t('الاقتراح بانتظار موافقة السائق.','The proposal is waiting for the driver’s approval.')}</Label>}
   </>}
   {ride.status==='accepted'&&<PassengerTaxiMap key={ride.driver_id} rideId={ride.id} pickup={{latitude:ride.pickup_lat,longitude:ride.pickup_lng}}/>}
   {historyMode&&<>
    <Label muted>{new Date(ride.created_at).toLocaleString(state.language==='ar'?'ar':'en')}</Label>
    <Button secondary icon="repeat-outline" title={t('استخدام الوجهة مرة أخرى','Use this destination again')} onPress={()=>reuseDestination(ride)} disabled={!!currentPassengerRide}/>
   </>}
   {live(ride)&&<>
    {ride.status==='arrived'&&!ride.pickup_confirmed_at&&<>
     <Label muted>{t('تأكد من السائق والسيارة أولًا، ثم أكّد الركوب من حسابك. لا يلزم إعطاء أي رمز.','Check the driver and car first, then confirm pickup in your account. No code needed.')}</Label>
     <Button title={t('تأكيد ركوب السيارة','Confirm pickup')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudConfirmPickup(token,ride.id))throw Error('not_allowed')},t('تم تأكيد الركوب. يمكن للسائق بدء الرحلة الآن.','Pickup confirmed. The driver can start the ride.'))}/>
    </>}
    {ride.status==='arrived'&&ride.pickup_confirmed_at&&<Label muted>{t('تم تأكيد الركوب. بانتظار بدء الرحلة من السائق.','Pickup confirmed. Waiting for driver to start the ride.')}</Label>}
    {ride.status!=='riding'&&ride.id!==searchingRide?.id&&<Button secondary title={t('إلغاء الطلب','Cancel request')} disabled={busy} onPress={()=>cancelRequest(ride)}/>}
   </>}
  </Panel>;
 function renderDriverRide(ride:CloudRide,split:boolean){
  const pickingUp=ride.status==='accepted';
  const atPickup=ride.status==='arrived';
  const pickup={latitude:ride.pickup_lat,longitude:ride.pickup_lng};
  const destination=pickingUp?(proposal?.approved?proposal.point:pickup):{latitude:ride.destination_lat,longitude:ride.destination_lng};
  const tracking=pickingUp||atPickup&&!ride.pickup_confirmed_at;
  const stage=pickingUp?t('إلى الزبون','To pickup'):atPickup?t('عند الزبون','At pickup'):t('إلى الوجهة','To destination');
  const address=pickingUp&&proposal?.approved?t('نقطة الالتقاء الجديدة المعتمدة','Approved meeting point'):pickingUp||atPickup?ride.pickup:ride.destination;
  const navButton=(adjacent:boolean,title:string)=><Button secondary icon={adjacent?'map-outline':'navigate-outline'}
   title={title} onPress={()=>atPickup?setSplitRide(ride.id):showExternal(ride,destination,adjacent)}/>;
  const fullScreen=navButton(false,t('ملاحة بملء الشاشة','Full-screen navigation'));
  return <View key={ride.id} style={{gap:split?8:12}}>
   <View style={{gap:2}}>
    {split?<Label>{stage}</Label>:<Label large>{stage}</Label>}
    {(!split||!tracking)&&<Label>{address}</Label>}
    {atPickup&&<Label muted>{ride.pickup_confirmed_at
     ?t('أكد الزبون الركوب. يمكنك بدء الرحلة الآن.','The customer confirmed pickup. You can start the ride.')
     :t('اطلب من الزبون تأكيد الركوب من هاتفه.','Ask the customer to confirm pickup on their phone.')}</Label>}
   </View>
   {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
   {tracking&&<CustomerTracking key={ride.id+':'+ride.driver_id} rideId={ride.id} pickup={pickup} foreground={foreground} compact={split}/>}
   {split&&tracking&&<Label muted>{address}</Label>}
   {pickingUp&&proposal&&!proposal.approved&&<Panel outlined>
    <Label>{t('الزبون اقترح نقطة التقاء جديدة.','The customer suggested a new meeting point.')}</Label>
    <View style={{height:155,overflow:'hidden',borderRadius:12}}><MapCanvas compact readOnly minMapHeight={155} point={proposal.point} onChange={()=>{}}/></View>
    <Button secondary title={t('اعتماد نقطة الالتقاء الجديدة','Approve the new meeting point')} disabled={busy} onPress={()=>void run(async()=>{
     const {data,error}=await authClient().rpc('change_pickup',{p_ride:ride.id,p_proposal:proposal.id,p_lat:null,p_lng:null});
     if(error||!data)throw Error('not_allowed');
    })}/>
   </Panel>}
   {pickingUp&&proposal?.approved&&<Label muted>{t('افتح الملاحة مجددًا للتوجّه إلى نقطة الالتقاء الجديدة.','Reopen navigation to go to the new meeting point.')}</Label>}
   {!atPickup&&<View style={{gap:6}}>
    <Label muted>{t('تطبيق الملاحة المختار','Selected navigation app')} · {providers[navigationProvider]}</Label>
    {split?navButton(true,t('فتح الملاحة بجانب الرحلة','Open navigation beside the ride')):<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>
     <View style={{flexGrow:1}}>{fullScreen}</View>
     <View style={{flexGrow:1}}>{navButton(true,t('ملاحة بتقسيم الشاشة','Split-screen navigation'))}</View>
    </View>}
   </View>}
   {!split&&atPickup&&navButton(true,t('عرض الرحلة بشكل مختصر','Show compact ride view'))}
   <HelpTip title={sharing.activeRide===ride.id
    ?t('موقعك قيد المشاركة','You are sharing your location')
    :t('مشاركة موقعي مع الزبون','Share my location with the customer')}>
    {driverSharingControl(ride)}
   </HelpTip>
   <HelpTip title={t('تغيير تطبيق الملاحة وخيارات الرحلة','Change navigation app and ride options')}>
    {navigationOptions}
    {split&&!atPickup&&fullScreen}
    {ride.status!=='riding'&&<Button secondary title={t('إعادة الطلب للبحث عن سائق','Release request to other drivers')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudReleaseRide(token,ride.id))throw Error('not_allowed')})}/>}
    <Button secondary icon="refresh-outline" title={t('تحديث حالة الرحلة','Refresh ride status')} disabled={busy} onPress={()=>void run(async()=>{})}/>
    {!split&&<DriverHistoryBar onOpen={setHistoryKind}/>}
   </HelpTip>
   {!split&&!atPickup&&<DriverNavigation key={ride.id+'-'+ride.status}
    title={t('الملاحة داخل يلّا نروح','Navigation in Yalla Nrouh')} targetLabel={address}
    action={driverRideAction(ride)} externalNavigation={fullScreen}
    pilotAvailable={pilotOwner===userId&&!!driver?.approved}
    pilotActive={pilotOwner===userId&&!!driver?.approved&&pilotRide===ride.id}
    onPilotToggle={()=>setPilotRide(pilotRide===ride.id?null:ride.id)}
    devicePosition={gps.camera?.point}
    routeOrigin={ride.status==='riding'?pickup:undefined}
    initialPlan={acceptedPlans?.rideId===ride.id&&!(pickingUp&&proposal?.approved)?(pickingUp?acceptedPlans.pickup:acceptedPlans.trip):null}
    to={destination}/>}
  </View>;
 }
 if(!auth.ready||auth.session&&!auth.rolesReady)return <Page title={t('رحلاتي','My rides')}><Label>{t('جارٍ تحميل الحساب…','Loading account…')}</Label>{auth.problem&&<Button title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/>}</Page>;
 if(!auth.session)return <Page title={driverMode?t('وضع السائق','Driver mode'):passengerTitle}><Panel><Icon name="person-circle-outline" size={42}/><Label>{t('سجّل الدخول لعرض رحلاتك أو العمل كسائق.','Sign in to view your rides or use driver mode.')}</Label><Button title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push(historyMode?{pathname:'/account',params:{next:'history'}}:'/account')}/></Panel></Page>;
 const split=!!currentDriverRide&&currentDriverRide.id===compactRide;
 const splitHeader=split?<View style={{flexDirection:state.language==='ar'?'row-reverse':'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',columnGap:8}}>
  <Label muted>{t('عرض مختصر للرحلة','Compact ride view')}</Label>
  <Pressable accessibilityRole="button" onPress={()=>setSplitRide(null)} style={{minHeight:44,justifyContent:'center',paddingHorizontal:8}}>
   <Label>{t('الوضع العادي','Normal view')}</Label>
  </Pressable>
 </View>:undefined;
 const footer=currentDriverRide?<RideFooter>{driverRideAction(currentDriverRide)}</RideFooter>
  :driverMode&&userId?<View style={{backgroundColor:colors.background,borderTopWidth:1,borderColor:colors.line,paddingHorizontal:12,paddingVertical:7}}><DriverHistoryBar onOpen={setHistoryKind}/></View>:searchingRide?<RideFooter>
  <RideSearchTimer key={searchingRide.id} startedAt={searchingRide.updated_at??searchingRide.created_at} onExpired={()=>void refresh().catch(()=>{})}/>
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  <Button secondary title={t('إلغاء الطلب','Cancel request')} disabled={busy} onPress={()=>cancelRequest(searchingRide)}/>
 </RideFooter>:!driverMode&&!historyMode&&params.ride&&loading?<RideFooter>
  <Label>{t('جارٍ تحميل حالة الطلب…','Loading request status…')}</Label>
 </RideFooter>:undefined;
 return <Page title={driverMode?t('وضع السائق','Driver mode'):passengerTitle} compact={driverMode||!historyMode} showBrand={driverMode} header={splitHeader} footer={footer}>
  {driverMode&&historyKind&&userId&&<DriverHistory key={userId} kind={historyKind} owner={userId} onSelect={setHistoryKind} onClose={closeHistory}/>}
  {driverMode&&driver?.approved&&!currentDriverRide&&<DriverShift
   online={driver.online} region={driver.region} category={driver.category} target={workTarget}
   disabled={busy||workTarget!==null||recovery.checking} onToggle={()=>void toggleWork()}
   soundReady={sound.ready} soundProblem={sound.problem} onEnableSound={()=>void sound.unlock()}/>}
  {driverMode&&driver?.approved&&!currentDriverRide&&<HelpTip title={driverConsent?t('مشاركة الموقع التلقائية مفعّلة','Automatic location sharing is on'):t('مشاركة موقعي مع الزبون','Share my location with the customer')}>
   {driverSharingControl()}
  </HelpTip>}
  {currentDriverRide&&renderDriverRide(currentDriverRide,split)}
  {driverMode&&recovery.id&&!currentDriverRide&&<Panel>
   <Label>{busy||recovery.checking?t('جارٍ التحقق من قبول الطلب…','Checking request acceptance…'):t('لم يتأكد قبول الطلب. يمكنك المحاولة مجددًا إذا ظل متاحًا.','Acceptance is unconfirmed. You can retry if the request is still available.')}</Label>
   {!busy&&!recovery.checking&&<Button secondary title={t('العودة للطلبات المتاحة','Back to available requests')} onPress={()=>{recovery.clear();void refresh().catch(()=>{})}}/>}
  </Panel>}
  {!!notice&&!searchingRide&&!currentDriverRide&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {driverMode?<>
   {!currentDriverRide&&(driver?.approved
    ? driver.online
     ? <>
      <DriverQueueHeader count={availableOffers.length} disabled={busy} onRefresh={()=>void run(async()=>{})}/>
      {!recovery.checking&&<>
       {inboxProblem&&<Label muted>{t('تعذر تحديث الطلبات. حاول تحديث القائمة.','Could not update requests. Refresh the list to try again.')}</Label>}
       {!inboxProblem&&!visibleOffers.length&&<DriverQueueEmpty/>}
       {visibleOffers.map(offer=><DriverOffer key={offer.ride_id} remainingSeconds={Math.max(0,Math.ceil(((offer.expiresOnDevice??0)-offerClock)/1000))} offer={offer} position={gps.camera?.point} disabled={busy||!!recovery.id&&recovery.id!==offer.ride_id} expanded={selectedOffer===offer.ride_id} onExpand={()=>setFocusedOffer(offer.ride_id)} onDecline={()=>decline(offer.ride_id)} onAccept={routes=>void accept(offer,routes)}/>)}
       {availableOffers.length>offerLimit&&<Button secondary title={t('عرض طلبات أخرى','Show more requests')} onPress={()=>setOfferLimit(value=>value+3)}/>}
       {!gps.camera&&visibleOffers.length>0&&<Button secondary icon="locate" title={gps.busy?t('جارٍ تحديد الموقع…','Finding location…'):t('تحديد موقعي لحساب طريق الزبون','Find my location to calculate pickup route')} disabled={gps.busy} onPress={()=>void gps.locate()}/>}
      </>}
     </>
     : null
    : loading&&!driver
     ? <Panel><Label>{t('جارٍ تحميل حالة السائق…','Loading driver status…')}</Label></Panel>
     : <Panel>
      {driver?<><Label>{t('طلبك بانتظار مراجعة الإدارة','Your application is waiting for review')}</Label><Label muted>{t('يمكنك تحديث الصفحة بعد اعتماد الحساب.','Refresh after your account is approved.')}</Label></>
       :<><Label>{t('التسجيل كسائق','Register as a driver')}</Label><RideOptions driver/><Button title={t('إرسال طلب اعتماد سائق','Apply for driver approval')} disabled={busy} onPress={()=>void run(async token=>{await cloudRegisterDriver(token,draft.region,draft.category)},t('تم إرسال الطلب إلى الإدارة.','Application sent to admin.'))}/></>}
     </Panel>)}
   {driver?.approved&&!currentDriverRide&&<MapsMeHelp/>}
   {!currentDriverRide&&(!driver?.approved||!driver.online&&!!notice)&&<Button secondary icon="refresh-outline" title={t('تحديث الحالة','Refresh status')} disabled={busy} onPress={()=>void run(async()=>{})}/>}
  </>:<>
   {passengerRides.map(renderRide)}
   {loading&&<Label muted>{t('جارٍ تحميل الرحلات…','Loading rides…')}</Label>}
   {!loading&&!passengerRides.length&&<Panel><Icon name="time-outline" size={36}/><Label>{historyMode?t('لا توجد رحلات سابقة بعد','No past rides yet'):t('ما في رحلة حالية','No current ride')}</Label></Panel>}
   <Button secondary icon="refresh-outline" title={t('تحديث الرحلات','Refresh rides')} disabled={busy||loading} onPress={()=>void run(async()=>{})}/>
   {!currentPassengerRide&&<Button icon="car-outline" title={t('حجز رحلة جديدة','Book a new ride')} onPress={()=>router.replace('/')}/>}
   {historyMode&&currentPassengerRide&&<Button title={t('متابعة الرحلة الحالية','Continue current ride')} onPress={()=>router.replace('/cloud')}/>}
   {!historyMode&&<Button secondary icon="time-outline" title={t('الرحلات السابقة','Past rides')} onPress={()=>router.push({pathname:'/cloud',params:{mode:'history'}})}/>}
  </>}
  {!driverMode&&<Label muted>{t('نسخة اختبار. لا تتوفر خدمة نقل تجارية مضمونة حتى اكتمال التشغيل واعتماد السائقين.','Test version. A transport service is not guaranteed until setup and driver checks are complete.')}</Label>}
 </Page>;
}
