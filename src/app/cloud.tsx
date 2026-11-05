import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {authErrorMessage} from '../auth-errors';
import {cloudCurrentToken,cloudMyRides,cloudMyDriver,cloudDriverInbox,cloudAcceptRide,cloudAdvanceRide,cloudReleaseRide,cloudCancelRide,cloudConfirmPickup,cloudRegisterDriver,cloudSetDriverOnline,type CloudRide,type CloudDriver,type RidePreview} from '../cloud-api';
import {categories,regions} from '../domain';
import RoutePanel from '../route-panel';
import MapCanvas from '../map/MapCanvas';
import {useCurrentPosition} from '../use-current-position';
import {createRefreshQueue} from '../refresh-queue';
import {Button,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
const live=(r:CloudRide)=>!['completed','cancelled'].includes(r.status);
export default function Rides(){
 const auth=useAuth();const userId=auth.session?.user.id;const {state,draft,foreground}=useApp();const t=useText();const {colors}=useTheme();const params=useLocalSearchParams<{mode?:string}>();const driverMode=auth.driver||params.mode==='driver';
 const gps=useCurrentPosition(driverMode&&state.preferences.permissionsIntroSeen);
 const [rides,setRides]=useState<CloudRide[]>([]),[driver,setDriver]=useState<CloudDriver|null>(null),[offers,setOffers]=useState<RidePreview[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 const alive=useRef(true),queue=useRef(createRefreshQueue()).current,identity=useRef(auth.session?.user.id),mode=useRef(driverMode);identity.current=auth.session?.user.id;mode.current=driverMode;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const refresh=useCallback(async()=>{
  if(!userId)return;const owner=userId;return queue.run(async()=>{if(!alive.current||identity.current!==owner||mode.current!==driverMode)return;
  const token=await cloudCurrentToken();const [next,inbox]=await Promise.all([cloudMyRides(token),driverMode?cloudDriverInbox(token):cloudMyDriver(token).then(driver=>({driver,offers:[] as RidePreview[]}))]);const myDriver=inbox.driver,available=inbox.offers;
   if(alive.current&&identity.current===owner&&mode.current===driverMode){setRides(next);setDriver(myDriver);setOffers(available);setLoading(false)}
  });
 },[userId,driverMode,queue]);
 useEffect(()=>{setRides([]);setOffers([]);setDriver(null);setLoading(true);if(!userId){setLoading(false);return}let active=true;void refresh().catch(()=>{if(active){setNotice(state.language==='ar'?'تعذر تحميل الرحلات. تحقق من الاتصال وأعد المحاولة.':'Could not load rides. Check internet and retry.');setLoading(false)}});return()=>{active=false}},[refresh,userId,state.language]);
 const activeRide=rides.some(live);const shouldPoll=foreground&&(activeRide||driverMode&&driver?.approved&&driver.online);
 useEffect(()=>{
  if(!userId||!shouldPoll)return;
  const tick=()=>{if(AppState.currentState!=='background')void refresh().catch(()=>{if(alive.current)setNotice(state.language==='ar'?'تعذر تحديث الطلبات. تحقق من الاتصال واضغط تحديث الرحلات.':'Could not update requests. Check internet and refresh.')})};
  const timer=setInterval(tick,state.preferences.dataSaver?30000:15000);return()=>clearInterval(timer);
 },[refresh,shouldPoll,userId,state.preferences.dataSaver,state.language]);
 useEffect(()=>{if(!userId)return;const resume=()=>{if(document.visibilityState!=='hidden')void refresh().catch(()=>{if(alive.current)setNotice(state.language==='ar'?'تعذر تحديث الطلبات. تحقق من الاتصال واضغط تحديث الرحلات.':'Could not update requests. Check internet and refresh.')})};const native=(event:Event)=>{if((event as CustomEvent).detail?.active===true)resume()};window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);window.addEventListener('yalla:native-visibility',native);return()=>{window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);window.removeEventListener('yalla:native-visibility',native)}},[userId,refresh,state.language]);
 async function run(work:(token:string)=>Promise<void>,success?:string){if(busy)return;setBusy(true);setNotice('');try{await work(await cloudCurrentToken());await refresh();if(success)setNotice(success)}catch(e){const kind=(e as {kind?:string})?.kind??(e as Error)?.message;setNotice(kind==='waiting_passenger_confirmation'?t('بانتظار تأكيد الراكب ركوب السيارة.','Waiting for passenger pickup confirmation.'):kind==='driver_not_approved'?t('حساب السائق بانتظار الاعتماد.','Driver account is waiting for approval.'):authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}}
 const status=(value:string)=>({requested:t('بانتظار السائق','Waiting for driver'),accepted:t('السائق في الطريق','Driver is on the way'),arrived:t('وصل السائق','Driver arrived'),riding:t('الرحلة جارية','Ride in progress'),completed:t('مكتملة','Completed'),cancelled:t('ملغاة','Cancelled')} as Record<string,string>)[value]??value;
 const mine=rides.filter(r=>driverMode?r.driver_id===auth.session?.user.id:r.passenger_id===auth.session?.user.id);
 if(!auth.ready||auth.session&&!auth.rolesReady)return <Page title={t('رحلاتي','My rides')}><Label>{t('جارٍ تحميل الحساب…','Loading account…')}</Label>{auth.problem&&<Button title={t('إعادة المحاولة','Try again')} onPress={()=>void auth.retry()}/>}</Page>;
 if(!auth.session)return <Page title={driverMode?t('وضع السائق','Driver mode'):t('رحلاتي','My rides')}><Panel><Icon name="person-circle-outline" size={42}/><Label>{t('سجّل الدخول لعرض رحلاتك أو العمل كسائق.','Sign in to view your rides or use driver mode.')}</Label><Button title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push('/account')}/></Panel></Page>;
 return <Page title={driverMode?t('وضع السائق','Driver mode'):t('رحلاتي','My rides')}>

  <Button secondary icon="refresh-outline" title={loading?t('جارٍ تحميل الرحلات…','Loading rides…'):t('تحديث الرحلات','Refresh rides')} disabled={busy} onPress={()=>void run(async()=>{})}/>
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {!driverMode&&<Button icon="car-outline" title={t('حجز رحلة جديدة','Book a new ride')} onPress={()=>router.replace('/')}/>}
  {driverMode&&<Panel><Label>{t('موقعي الحالي','My current location')}</Label><View style={{height:210,borderRadius:14,overflow:'hidden'}}><MapCanvas compact readOnly minMapHeight={180} point={gps.camera?.point??null} cameraTarget={gps.camera} onChange={()=>{}}/></View>{gps.failure&&<Label muted>{gps.failure==='permission'?t('اسمح بإذن الموقع من إعدادات التطبيق.','Allow location in app settings.'):gps.failure==='services'?t('فعّل خدمة الموقع في الهاتف.','Turn on phone location.'):gps.failure==='accuracy'?t('فعّل الموقع الدقيق من أذونات التطبيق.','Turn on precise location in app settings.'):t('تعذر تحديد موقعك. أعد المحاولة.','Could not find your location. Try again.')}</Label>}<Button secondary icon="locate" title={gps.busy?t('جارٍ تحديد الموقع…','Finding location…'):t('تحديث موقعي','Update my location')} disabled={gps.busy} onPress={()=>void gps.locate()}/></Panel>}
  {driverMode&&<Panel>
   {!driver?<><Label>{t('التسجيل كسائق','Register as a driver')}</Label><Label muted>{t('منطقة العمل ونوع السيارة: ','Work region and car: ')}{regions[draft.region]?.[state.language==='ar'?0:1]} · {categories.find(c=>c.id===draft.category)?.[state.language]}</Label><Button secondary title={t('تعديل المنطقة ونوع السيارة','Change region and car')} onPress={()=>router.replace('/')}/><Button title={t('إرسال طلب اعتماد سائق','Apply for driver approval')} disabled={busy} onPress={()=>void run(async token=>{await cloudRegisterDriver(token,draft.region,draft.category)},t('تم إرسال الطلب إلى الإدارة.','Application sent to admin.'))}/></>:!driver.approved?<><Label>{t('طلبك بانتظار مراجعة الإدارة','Your application is waiting for review')}</Label><Label muted>{t('يمكنك تحديث الصفحة بعد اعتماد الحساب.','Refresh after your account is approved.')}</Label></>:<><Label>{driver.online?t('متاح لاستقبال الطلبات','Available for requests'):t('استقبال الطلبات متوقف','Requests are off')}</Label><Button title={driver.online?t('إيقاف استقبال الطلبات','Go offline'):t('بدء استقبال الطلبات','Go online')} disabled={busy} onPress={()=>void run(async token=>{await cloudSetDriverOnline(token,!driver.online)})}/></>}
  </Panel>}
  {driverMode&&driver?.approved&&driver.online&&<Panel><Label large>{t('طلبات متاحة','Available requests')}</Label>{offers.length===0&&<Label muted>{t('لا توجد طلبات مناسبة الآن.','No matching requests now.')}</Label>}{offers.map(offer=><View key={offer.ride_id} style={{gap:8,paddingVertical:10}}><Label>{regions[offer.region]?.[state.language==='ar'?0:1]} · {offer.category}</Label><Label muted>{t('منطقة الانطلاق التقريبية: ','Pickup area: ')}{offer.pickup_lat_approx}, {offer.pickup_lng_approx}</Label><Button title={t('قبول الطلب','Accept request')} disabled={busy||mine.some(live)} onPress={()=>void run(async token=>{if(!await cloudAcceptRide(token,offer.ride_id))throw Error('not_allowed')},t('تم قبول الطلب.','Request accepted.'))}/></View>)}</Panel>}
  {!loading&&mine.length===0&&<Panel><Icon name="time-outline" size={36}/><Label>{t('لا توجد رحلات بعد','No rides yet')}</Label></Panel>}
  {mine.map(ride=><Panel key={ride.id}>
   <View style={{alignSelf:'flex-start',borderRadius:20,paddingHorizontal:12,paddingVertical:4,backgroundColor:colors.selected}}><Label muted>{status(ride.status)}</Label></View>
   <Label>{ride.pickup}</Label><Icon name="arrow-down-outline" size={18}/><Label>{ride.destination}</Label><Label muted>{new Date(ride.created_at).toLocaleString(state.language==='ar'?'ar':'en')}</Label>
   {!driverMode&&live(ride)&&<>
    {ride.status==='arrived'&&!ride.pickup_confirmed_at&&<>
     <Label muted>{t('تأكد من السائق والسيارة أولًا، ثم أكّد الركوب من حسابك. لا يلزم إعطاء أي رمز.','Check the driver and car first, then confirm pickup in your account. No code needed.')}</Label>
     <Button title={t('تأكيد ركوب السيارة','Confirm pickup')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudConfirmPickup(token,ride.id))throw Error('not_allowed')},t('تم تأكيد الركوب. يمكن للسائق بدء الرحلة الآن.','Pickup confirmed. The driver can start the ride.'))}/>
    </>}
    {ride.status==='arrived'&&ride.pickup_confirmed_at&&<Label muted>{t('تم تأكيد الركوب. بانتظار بدء الرحلة من السائق.','Pickup confirmed. Waiting for driver to start the ride.')}</Label>}
    {ride.status!=='riding'&&<Button secondary title={t('إلغاء الطلب','Cancel request')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudCancelRide(token,ride.id))throw Error('not_allowed')},t('تم إلغاء الطلب.','Request cancelled.'))}/>}
   </>}
   {driverMode&&['accepted','arrived','riding'].includes(ride.status)&&<>
    <RoutePanel currentLocation to={ride.status==='riding'?{latitude:ride.destination_lat,longitude:ride.destination_lng}:{latitude:ride.pickup_lat,longitude:ride.pickup_lng}} title={ride.status==='riding'?t('الطريق إلى وجهة الراكب','Route to destination'):t('الطريق إلى الراكب','Route to passenger')}/>
    {ride.status==='accepted'&&<Button title={t('وصلت إلى الراكب','I arrived at pickup')} disabled={busy} onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'arrived')!=='arrived')throw Error('not_allowed')})}/>}
    {ride.status==='arrived'&&<>
     {!ride.pickup_confirmed_at&&<Label muted>{t('بانتظار تأكيد الراكب للركوب من حسابه. اضغط تحديث الرحلات بعد التأكيد.','Waiting for passenger confirmation. Refresh rides after pickup is confirmed.')}</Label>}
     <Button title={ride.pickup_confirmed_at?t('بدء الرحلة','Start ride'):t('بانتظار تأكيد الراكب','Waiting for passenger')} disabled={busy||!ride.pickup_confirmed_at} onPress={()=>void run(async token=>{const result=await cloudAdvanceRide(token,ride.id,'riding');if(result!=='riding')throw Error(result)})}/>
    </>}
    {ride.status==='riding'?<Button title={t('إنهاء الرحلة','Finish ride')} disabled={busy} onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'completed')!=='completed')throw Error('not_allowed')})}/>:<Button secondary title={t('إعادة الطلب للبحث عن سائق','Release request to other drivers')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudReleaseRide(token,ride.id))throw Error('not_allowed')})}/>}
   </>}
  </Panel>)}
  <Label muted>{t('نسخة اختبار. لا تتوفر خدمة نقل تجارية مضمونة حتى اكتمال التشغيل واعتماد السائقين.','Test version. A transport service is not guaranteed until setup and driver checks are complete.')}</Label>
 </Page>;
}
