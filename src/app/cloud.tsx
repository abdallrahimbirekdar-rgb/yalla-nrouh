import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {authErrorMessage} from '../auth-errors';
import {cloudCurrentToken,cloudMutationUncertain,cloudMyRides,cloudDriverInbox,cloudOpenRides,cloudDeclineDriverOffer,cloudAcceptRide,cloudAdvanceRide,cloudReleaseRide,cloudCancelRide,cloudConfirmPickup,cloudRegisterDriver,cloudSetDriverOnline,type CloudRide,type CloudDriver,type DriverHistoryKind,type RidePreview} from '../cloud-api';
import {categories,regions} from '../domain';
import DriverOffer from '../driver-offer';
import type {RoutePlan} from '../routing';
import DriverNavigation from '../driver-navigation';
import {DriverQueueEmpty,DriverQueueHeader,DriverShift} from '../driver-dashboard';
import {DriverHistory,DriverHistoryBar} from '../driver-history';
import {useCurrentPosition} from '../use-current-position';
import {PassengerTaxiMap,RideSearchTimer,useShareTaxiPosition} from '../taxi-tracking';
import {useRideRecovery} from '../use-ride-recovery';
import {createRefreshQueue} from '../refresh-queue';
import {Button,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
const live=(r:CloudRide)=>!['completed','cancelled'].includes(r.status);
export default function Rides(){
 const auth=useAuth();const userId=auth.session?.user.id;const {state,draft,foreground}=useApp();const t=useText();const {colors}=useTheme();const params=useLocalSearchParams<{mode?:string}>();const driverMode=auth.driver||params.mode==='driver';
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
 const gps=useCurrentPosition(driverMode&&Boolean(currentDriverRide||driver?.approved&&driver.online)&&state.preferences.permissionsIntroSeen);
 const recovery=useRideRecovery('accept',driverMode?userId:undefined,foreground,busy,ride=>{
  historyRead.current++;
  setRides(previous=>[ride,...previous.filter(item=>item.id!==ride.id)]);
  setNotice(t('تم تأكيد قبول الطلب.','Request acceptance confirmed.'));
  void refresh().catch(()=>{});
 });
 const approachingRide=currentDriverRide?.status==='accepted'?currentDriverRide:undefined;
 useShareTaxiPosition(approachingRide?.id,foreground);
 const activeRide=rides.some(live);const shouldPoll=foreground&&(activeRide||driverMode&&(!driver||driver.approved&&driver.online));
 useEffect(()=>{
  if(!userId||!shouldPoll)return;
  const tick=()=>{if(AppState.currentState!=='background')void refresh().catch(()=>{if(alive.current)setNotice(state.language==='ar'?'تعذر تحديث الطلبات. تحقق من الاتصال واضغط تحديث الرحلات.':'Could not update requests. Check internet and refresh.')})};
  const interval=driverMode?(state.preferences.dataSaver?30000:15000):(state.preferences.dataSaver?6000:4000);
  const timer=setInterval(tick,interval);return()=>clearInterval(timer);
 },[refresh,shouldPoll,userId,driverMode,state.preferences.dataSaver,state.language]);
 useEffect(()=>{
  if(!userId||!driverMode||!driver?.approved||!driver.online||!foreground||currentDriverRide?.id)return;
  let active=true,running=false;const owner=userId;
  const tick=async()=>{
   if(running||document.visibilityState==='hidden'||AppState.currentState==='background')return;
   running=true;const ticket=++offerRead.current;
   try{const next=await cloudOpenRides(await cloudCurrentToken());if(active&&identity.current===owner&&mode.current&&ticket===offerRead.current){setOffers(next);setInboxProblem(false)}}
   catch{if(active&&identity.current===owner&&ticket===offerRead.current)setInboxProblem(true)}
   finally{running=false}
  };
  const timer=setInterval(()=>void tick(),state.preferences.dataSaver?8000:5000);
  return()=>{active=false;clearInterval(timer)};
 },[userId,driverMode,driver?.approved,driver?.online,foreground,currentDriverRide?.id,state.preferences.dataSaver]);
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
 const hiddenOffers=declined?.owner===userId?declined?.ids:undefined;
 const availableOffers=offers.filter(offer=>(offer.expiresOnDevice??0)>offerClock&&!hiddenOffers?.includes(offer.ride_id));
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
  setWorkTarget(online);
  try{
   await run(async token=>{if(!await cloudSetDriverOnline(token,online))throw Error('not_allowed')});
  }finally{setWorkTarget(null)}
 }
 const renderRide=(ride:CloudRide)=><Panel key={ride.id}>
   <View style={{alignSelf:'flex-start',borderRadius:20,paddingHorizontal:12,paddingVertical:4,backgroundColor:colors.selected}}><Label muted>{ride.search_expired_at?t('انتهى البحث بدون سائق','Search expired without a driver'):status(ride.status)}</Label></View>
   {ride.status==='requested'&&<RideSearchTimer startedAt={ride.updated_at??ride.created_at} onExpired={()=>void refresh().catch(()=>{})}/>}
   {ride.status==='accepted'&&<PassengerTaxiMap key={ride.driver_id} rideId={ride.id} pickup={{latitude:ride.pickup_lat,longitude:ride.pickup_lng}}/>}
   <Label>{ride.pickup}</Label><Icon name="arrow-down-outline" size={18}/><Label>{ride.destination}</Label><Label muted>{new Date(ride.created_at).toLocaleString(state.language==='ar'?'ar':'en')}</Label>
   {live(ride)&&<>
    {ride.status==='arrived'&&!ride.pickup_confirmed_at&&<>
     <Label muted>{t('تأكد من السائق والسيارة أولًا، ثم أكّد الركوب من حسابك. لا يلزم إعطاء أي رمز.','Check the driver and car first, then confirm pickup in your account. No code needed.')}</Label>
     <Button title={t('تأكيد ركوب السيارة','Confirm pickup')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudConfirmPickup(token,ride.id))throw Error('not_allowed')},t('تم تأكيد الركوب. يمكن للسائق بدء الرحلة الآن.','Pickup confirmed. The driver can start the ride.'))}/>
    </>}
    {ride.status==='arrived'&&ride.pickup_confirmed_at&&<Label muted>{t('تم تأكيد الركوب. بانتظار بدء الرحلة من السائق.','Pickup confirmed. Waiting for driver to start the ride.')}</Label>}
    {ride.status!=='riding'&&<Button secondary title={t('إلغاء الطلب','Cancel request')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudCancelRide(token,ride.id))throw Error('not_allowed')},t('تم إلغاء الطلب.','Request cancelled.'))}/>}
   </>}
  </Panel>;
 function renderDriverRide(ride:CloudRide){
  const pickingUp=ride.status==='accepted';
  const atPickup=ride.status==='arrived';
  const action=atPickup
   ? <Button prominent title={ride.pickup_confirmed_at?t('بدء الرحلة','Start ride'):t('بانتظار تأكيد الزبون','Waiting for passenger')} disabled={busy||!ride.pickup_confirmed_at} onPress={()=>void run(async token=>{const result=await cloudAdvanceRide(token,ride.id,'riding');if(result!=='riding')throw Error(result)})}/>
   : pickingUp
    ? <Button prominent icon="location-outline" title={t('وصلت إلى الزبون','I arrived at pickup')} disabled={busy} onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'arrived')!=='arrived')throw Error('not_allowed')})}/>
    : <Button prominent icon="checkmark-circle-outline" title={t('إنهاء الرحلة','Finish ride')} disabled={busy} onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'completed')!=='completed')throw Error('not_allowed')})}/>;
  return <View key={ride.id} style={{gap:12}}>
   {atPickup
    ? <Panel><Label display>{t('عند الزبون','At pickup')}</Label>{action}<Label>{ride.pickup}</Label></Panel>
    : <DriverNavigation key={ride.id+'-'+ride.status}
       title={pickingUp?t('إلى الزبون','To pickup'):t('إلى الوجهة','To destination')}
       targetLabel={pickingUp?ride.pickup:ride.destination}
       action={action}
       devicePosition={gps.camera?.point} deviceRevision={gps.camera?.revision}
       initialPlan={acceptedPlans?.rideId===ride.id?(pickingUp?acceptedPlans.pickup:acceptedPlans.trip):null}
       to={pickingUp?{latitude:ride.pickup_lat,longitude:ride.pickup_lng}:{latitude:ride.destination_lat,longitude:ride.destination_lng}}/>}
   {ride.status!=='riding'&&<Button secondary title={t('إعادة الطلب للبحث عن سائق','Release request to other drivers')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudReleaseRide(token,ride.id))throw Error('not_allowed')})}/>}
  </View>;
 }
 if(!auth.ready||auth.session&&!auth.rolesReady)return <Page title={t('رحلاتي','My rides')}><Label>{t('جارٍ تحميل الحساب…','Loading account…')}</Label>{auth.problem&&<Button title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/>}</Page>;
 if(!auth.session)return <Page title={driverMode?t('وضع السائق','Driver mode'):t('رحلاتي','My rides')}><Panel><Icon name="person-circle-outline" size={42}/><Label>{t('سجّل الدخول لعرض رحلاتك أو العمل كسائق.','Sign in to view your rides or use driver mode.')}</Label><Button title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push('/account')}/></Panel></Page>;
 return <Page title={driverMode?t('وضع السائق','Driver mode'):t('رحلاتي','My rides')} compact={driverMode} footer={driverMode&&userId?<DriverHistoryBar onOpen={setHistoryKind}/>:undefined}>
  {driverMode&&historyKind&&userId&&<DriverHistory key={userId+historyKind} kind={historyKind} owner={userId} onClose={closeHistory}/>}
  {driverMode&&driver?.approved&&!currentDriverRide&&<DriverShift
   online={driver.online} region={driver.region} category={driver.category} target={workTarget}
   disabled={busy||workTarget!==null||recovery.checking} onToggle={()=>void toggleWork()}/>}
  {currentDriverRide&&renderDriverRide(currentDriverRide)}
  {driverMode&&recovery.id&&!currentDriverRide&&<Panel>
   <Label>{busy||recovery.checking?t('جارٍ التحقق من قبول الطلب…','Checking request acceptance…'):t('لم يتأكد قبول الطلب. يمكنك المحاولة مجددًا إذا ظل متاحًا.','Acceptance is unconfirmed. You can retry if the request is still available.')}</Label>
   {!busy&&!recovery.checking&&<Button secondary title={t('العودة للطلبات المتاحة','Back to available requests')} onPress={()=>{recovery.clear();void refresh().catch(()=>{})}}/>}
  </Panel>}
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
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
       :<><Label>{t('التسجيل كسائق','Register as a driver')}</Label><Label muted>{t('منطقة العمل ونوع السيارة','Work region and car')} · {regions[draft.region]?.[state.language==='ar'?0:1]} · {categories.find(c=>c.id===draft.category)?.[state.language]}</Label><Button secondary title={t('تعديل المنطقة ونوع السيارة','Change region and car')} onPress={()=>router.replace('/')}/><Button title={t('إرسال طلب اعتماد سائق','Apply for driver approval')} disabled={busy} onPress={()=>void run(async token=>{await cloudRegisterDriver(token,draft.region,draft.category)},t('تم إرسال الطلب إلى الإدارة.','Application sent to admin.'))}/></>}
     </Panel>)}
   {(currentDriverRide||!driver?.approved||!driver.online&&!!notice)&&<Button secondary icon="refresh-outline" title={t('تحديث الحالة','Refresh status')} disabled={busy} onPress={()=>void run(async()=>{})}/>}
  </>:<>
   <Button secondary icon="refresh-outline" title={loading?t('جارٍ تحميل الرحلات…','Loading rides…'):t('تحديث الرحلات','Refresh rides')} disabled={busy} onPress={()=>void run(async()=>{})}/>
   <Button icon="car-outline" title={t('حجز رحلة جديدة','Book a new ride')} onPress={()=>router.replace('/')}/>
   {!loading&&mine.length===0&&<Panel><Icon name="time-outline" size={36}/><Label>{t('لا توجد رحلات بعد','No rides yet')}</Label></Panel>}
   {mine.map(renderRide)}
  </>}
  {!driverMode&&<Label muted>{t('نسخة اختبار. لا تتوفر خدمة نقل تجارية مضمونة حتى اكتمال التشغيل واعتماد السائقين.','Test version. A transport service is not guaranteed until setup and driver checks are complete.')}</Label>}
 </Page>;
}
