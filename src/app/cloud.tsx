import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {authErrorMessage} from '../auth-errors';
import {cloudCurrentToken,cloudMyRides,cloudMyDriver,cloudOpenRides,cloudAcceptRide,cloudAdvanceRide,cloudReleaseRide,cloudCancelRide,cloudPassengerPin,cloudRegisterDriver,cloudSetDriverOnline,cloudHeartbeat,type CloudRide,type CloudDriver,type RidePreview} from '../cloud-api';
import {categories,regions} from '../domain';
import RoutePanel from '../route-panel';
import {Button,Field,Icon,Label,Page,Panel,useText,useTheme} from '../ui';
const live=(r:CloudRide)=>!['completed','cancelled'].includes(r.status);
export default function Rides(){
 const auth=useAuth();const userId=auth.session?.user.id;const {state,draft,foreground}=useApp();const t=useText();const {colors}=useTheme();const params=useLocalSearchParams<{mode?:string}>();const driverMode=params.mode==='driver';
 const [rides,setRides]=useState<CloudRide[]>([]),[driver,setDriver]=useState<CloudDriver|null>(null),[offers,setOffers]=useState<RidePreview[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[pin,setPin]=useState(''),[passengerPins,setPassengerPins]=useState<Record<string,string>>({});
 const alive=useRef(true),running=useRef(false),identity=useRef(auth.session?.user.id);identity.current=auth.session?.user.id;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const refresh=useCallback(async()=>{
  if(!userId||running.current)return;const owner=userId;running.current=true;
  try{const token=await cloudCurrentToken();const [next,myDriver]=await Promise.all([cloudMyRides(token),cloudMyDriver(token)]);const available=driverMode&&myDriver?.approved&&myDriver.online?await cloudOpenRides(token):[];
   if(alive.current&&identity.current===owner){setRides(next);setDriver(myDriver);setOffers(available);setLoading(false)}
  }finally{running.current=false}
 },[userId,driverMode]);
 useEffect(()=>{setRides([]);setOffers([]);setDriver(null);setPassengerPins({});setLoading(true);if(!userId){setLoading(false);return}let active=true;void refresh().catch(()=>{if(active){setNotice(state.language==='ar'?'تعذر تحميل الرحلات. تحقق من الاتصال وأعد المحاولة.':'Could not load rides. Check internet and retry.');setLoading(false)}});return()=>{active=false}},[refresh,userId,state.language]);
 const activeRide=rides.some(live);const shouldPoll=foreground&&(activeRide||driverMode&&driver?.approved&&driver.online);
 useEffect(()=>{
  if(!userId||!shouldPoll)return;
  const tick=()=>{if(AppState.currentState!=='background')void refresh().catch(()=>{})};
  const timer=setInterval(tick,state.preferences.dataSaver?30000:15000);return()=>clearInterval(timer);
 },[refresh,shouldPoll,userId,state.preferences.dataSaver]);
 useEffect(()=>{if(!driverMode||!driver?.approved||!driver.online||!foreground)return;const timer=setInterval(()=>{void cloudCurrentToken().then(token=>cloudHeartbeat(token)).catch(()=>{})},50000);return()=>clearInterval(timer)},[driverMode,driver?.approved,driver?.online,foreground]);
 async function run(work:(token:string)=>Promise<void>,success?:string){if(busy)return;setBusy(true);setNotice('');try{await work(await cloudCurrentToken());await refresh();if(success)setNotice(success)}catch(e){const kind=(e as {kind?:string})?.kind??(e as Error)?.message;setNotice(kind==='invalid_pin'?t('رمز بدء الرحلة غير صحيح.','The ride PIN is wrong.'):kind==='pin_locked'?t('تم إيقاف محاولات رمز هذه الرحلة.','PIN tries are locked for this ride.'):kind==='driver_not_approved'?t('حساب السائق بانتظار الاعتماد.','Driver account is waiting for approval.'):authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}}
 const status=(value:string)=>({requested:t('بانتظار السائق','Waiting for driver'),accepted:t('السائق في الطريق','Driver is on the way'),arrived:t('وصل السائق','Driver arrived'),riding:t('الرحلة جارية','Ride in progress'),completed:t('مكتملة','Completed'),cancelled:t('ملغاة','Cancelled')} as Record<string,string>)[value]??value;
 const mine=rides.filter(r=>driverMode?r.driver_id===auth.session?.user.id:r.passenger_id===auth.session?.user.id);
 if(!auth.ready)return <Page title={t('رحلاتي','My rides')}><Label>{t('جارٍ تحميل الحساب…','Loading account…')}</Label></Page>;
 if(!auth.session)return <Page title={driverMode?t('وضع السائق','Driver mode'):t('رحلاتي','My rides')}><Panel><Icon name="person-circle-outline" size={42}/><Label>{t('سجّل الدخول لعرض رحلاتك أو العمل كسائق.','Sign in to view your rides or use driver mode.')}</Label><Button title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push('/account')}/></Panel></Page>;
 return <Page title={driverMode?t('وضع السائق','Driver mode'):t('رحلاتي','My rides')}>
  <View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Button secondary={driverMode} title={t('الراكب','Passenger')} onPress={()=>router.replace('/cloud')}/></View><View style={{flex:1}}><Button secondary={!driverMode} title={t('السائق','Driver')} onPress={()=>router.replace({pathname:'/cloud',params:{mode:'driver'}})}/></View></View>
  <Button secondary icon="refresh-outline" title={loading?t('جارٍ تحميل الرحلات…','Loading rides…'):t('تحديث الرحلات','Refresh rides')} disabled={busy} onPress={()=>void run(async()=>{})}/>
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {!driverMode&&<Button icon="car-outline" title={t('حجز رحلة جديدة','Book a new ride')} onPress={()=>router.replace('/')}/>}
  {driverMode&&<Panel>
   {!driver?<><Label>{t('التسجيل كسائق','Register as a driver')}</Label><Label muted>{t('منطقة العمل ونوع السيارة: ','Work region and car: ')}{regions[draft.region]?.[state.language==='ar'?0:1]} · {categories.find(c=>c.id===draft.category)?.[state.language]}</Label><Button secondary title={t('تعديل المنطقة ونوع السيارة','Change region and car')} onPress={()=>router.replace('/')}/><Button title={t('إرسال طلب اعتماد سائق','Apply for driver approval')} disabled={busy} onPress={()=>void run(async token=>{await cloudRegisterDriver(token,draft.region,draft.category)},t('تم إرسال الطلب إلى الإدارة.','Application sent to admin.'))}/></>:!driver.approved?<><Label>{t('طلبك بانتظار مراجعة الإدارة','Your application is waiting for review')}</Label><Label muted>{t('يمكنك تحديث الصفحة بعد اعتماد الحساب.','Refresh after your account is approved.')}</Label></>:<><Label>{driver.online?t('متاح لاستقبال الطلبات','Available for requests'):t('استقبال الطلبات متوقف','Requests are off')}</Label><Button title={driver.online?t('إيقاف استقبال الطلبات','Go offline'):t('بدء استقبال الطلبات','Go online')} disabled={busy} onPress={()=>void run(async token=>{await cloudSetDriverOnline(token,!driver.online)})}/></>}
  </Panel>}
  {driverMode&&driver?.approved&&driver.online&&<Panel><Label large>{t('طلبات متاحة','Available requests')}</Label>{offers.length===0&&<Label muted>{t('لا توجد طلبات مناسبة الآن.','No matching requests now.')}</Label>}{offers.map(offer=><View key={offer.ride_id} style={{gap:8,paddingVertical:10}}><Label>{regions[offer.region]?.[state.language==='ar'?0:1]} · {offer.category}</Label><Label muted>{t('منطقة الانطلاق التقريبية: ','Pickup area: ')}{offer.pickup_lat_approx}, {offer.pickup_lng_approx}</Label><Button title={t('قبول الطلب','Accept request')} disabled={busy||mine.some(live)} onPress={()=>void run(async token=>{if(!await cloudAcceptRide(token,offer.ride_id))throw Error('not_allowed')},t('تم قبول الطلب.','Request accepted.'))}/></View>)}</Panel>}
  {!loading&&mine.length===0&&<Panel><Icon name="time-outline" size={36}/><Label>{t('لا توجد رحلات بعد','No rides yet')}</Label></Panel>}
  {mine.map(ride=><Panel key={ride.id}>
   <View style={{alignSelf:'flex-start',borderRadius:20,paddingHorizontal:12,paddingVertical:4,backgroundColor:colors.selected}}><Label muted>{status(ride.status)}</Label></View>
   <Label>{ride.pickup}</Label><Icon name="arrow-down-outline" size={18}/><Label>{ride.destination}</Label><Label muted>{new Date(ride.created_at).toLocaleString(state.language==='ar'?'ar':'en')}</Label>
   {!driverMode&&live(ride)&&<>
    <Button secondary title={t('إظهار رمز بدء الرحلة','Show ride start PIN')} disabled={busy} onPress={()=>void run(async token=>{const value=await cloudPassengerPin(token,ride.id);if(value)setPassengerPins(previous=>({...previous,[ride.id]:value}))})}/>
    {!!passengerPins[ride.id]&&<><Label large>{passengerPins[ride.id]}</Label><Label muted>{t('أعط الرمز للسائق بعد التأكد من السيارة.','Give the PIN to the driver after checking the car.')}</Label></>}
    {ride.status!=='riding'&&<Button secondary title={t('إلغاء الطلب','Cancel request')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudCancelRide(token,ride.id))throw Error('not_allowed')},t('تم إلغاء الطلب.','Request cancelled.'))}/>}
   </>}
   {driverMode&&['accepted','arrived','riding'].includes(ride.status)&&<>
    <RoutePanel currentLocation to={ride.status==='riding'?{latitude:ride.destination_lat,longitude:ride.destination_lng}:{latitude:ride.pickup_lat,longitude:ride.pickup_lng}} title={ride.status==='riding'?t('الطريق إلى وجهة الراكب','Route to destination'):t('الطريق إلى الراكب','Route to passenger')}/>
    {ride.status==='accepted'&&<Button title={t('وصلت إلى الراكب','I arrived at pickup')} disabled={busy} onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'arrived')!=='arrived')throw Error('not_allowed')})}/>}
    {ride.status==='arrived'&&<><Field label={t('رمز الراكب — ٦ أرقام','Passenger PIN — 6 digits')} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={6}/><Button title={t('بدء الرحلة','Start ride')} disabled={busy||!/^\d{6}$/.test(pin)} onPress={()=>void run(async token=>{const result=await cloudAdvanceRide(token,ride.id,'riding',pin);if(result!=='riding')throw Error(result);setPin('')})}/></>}
    {ride.status==='riding'?<Button title={t('إنهاء الرحلة','Finish ride')} disabled={busy} onPress={()=>void run(async token=>{if(await cloudAdvanceRide(token,ride.id,'completed')!=='completed')throw Error('not_allowed')})}/>:<Button secondary title={t('إعادة الطلب للبحث عن سائق','Release request to other drivers')} disabled={busy} onPress={()=>void run(async token=>{if(!await cloudReleaseRide(token,ride.id))throw Error('not_allowed')})}/>}
   </>}
  </Panel>)}
  <Label muted>{t('نسخة اختبار. لا تتوفر خدمة نقل تجارية مضمونة حتى اكتمال التشغيل واعتماد السائقين.','Test version. A transport service is not guaranteed until setup and driver checks are complete.')}</Label>
 </Page>;
}
