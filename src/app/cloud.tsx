import React,{useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import RoutePanel from '../route-panel';
import {router} from 'expo-router';
import {useApp} from '../context';
import {Button,Field,Label,Page,Panel,useText} from '../ui';
import {categories,regions} from '../domain';
import {
  cloudAcceptRide,cloudAdvanceRide,cloudCancelRide,cloudGetToken,cloudHeartbeat,
  cloudMyDriver,cloudMyRides,cloudOpenRides,cloudPassengerPin,cloudRegisterDriver,cloudReleaseRide,
  cloudRequestRide,cloudSetDriverOnline,cloudSignIn,cloudSignOut,cloudSignUp,cloudWhoAmI,
  cloudIsAdmin,cloudStaffDrivers,cloudApproveDriver,
  type CloudDriver,type CloudRide,type RidePreview,type StaffDriver,type CloudError
} from '../cloud-api';

const liveStatuses=['requested','accepted','arrived','riding'];
export default function CloudBeta(){
 const {draft,state}=useApp();const t=useText();
 const [token,setToken]=useState<string|null>(()=>cloudGetToken());
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [userId,setUserId]=useState(''),[userEmail,setUserEmail]=useState('');
 const [mode,setMode]=useState<'passenger'|'driver'>('passenger');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const polling=useRef(false);
 const [driver,setDriver]=useState<CloudDriver|null>(null);
 const [isAdmin,setIsAdmin]=useState(false),[staffDrivers,setStaffDrivers]=useState<StaffDriver[]>([]);
 const [rides,setRides]=useState<CloudRide[]>([]),[offers,setOffers]=useState<RidePreview[]>([]);
 const [pin,setPin]=useState(''),[passengerPin,setPassengerPin]=useState(''),[pinRideId,setPinRideId]=useState<string|null>(null);
 const statusName=(value:string)=>({requested:t('بانتظار السائق','Waiting'),accepted:t('قبل السائق','Accepted'),arrived:t('وصل السائق','Arrived'),riding:t('الرحلة جارية','Riding'),completed:t('انتهت الرحلة','Completed'),cancelled:t('ملغاة','Cancelled')} as Record<string,string>)[value]??value;
 function errorText(error:unknown){
   const kind=(error as CloudError)?.kind??(error instanceof Error?error.message:'');
   if(kind==='select_map_points')return t('حدد الانطلاق والوصول على الخريطة قبل إرسال الطلب.','Choose pickup and destination on the map before sending.');
   if(kind==='driver_not_approved')return t('حساب السائق بانتظار مراجعة الإدارة.','Driver account is waiting for approval.');
   if(kind==='too_many_requests'||kind==='23505')return t('يوجد طلب نشط أو تم إرسال طلب قبل لحظات.','You already have an active or recent request.');
   if(kind==='invalid_credentials'||kind==='invalid_grant')return t('تأكد من البريد الإلكتروني وكلمة المرور.','Check your email and password.');
   if(kind==='timeout'||kind==='network')return t('الاتصال ضعيف. تأكد من الإنترنت وأعد المحاولة.','Connection failed. Check your internet and try again.');
   if(kind==='invalid_pin')return t('رمز الرحلة غير صحيح. تأكد من الرمز ذي الستة أرقام.','Wrong ride PIN. Check the six digits.');
   if(kind==='pin_locked')return t('تم إيقاف محاولات الرمز لهذا الطلب.','PIN attempts are locked for this ride.');
   if(kind==='invalid_transition'||kind==='not_allowed')return t('لا يمكن تنفيذ هذه الخطوة في حالة الرحلة الحالية. حدّث البيانات.','This action is not allowed for the current ride. Refresh first.');
   if((error as CloudError)?.status===401)return t('انتهت الجلسة. سجّل الدخول من جديد.','Session ended. Sign in again.');
   return t('لم تكتمل العملية. تحقق من البيانات أو حاول مجددًا.','Could not complete this action. Check the data and try again.');
 }
 async function refresh(current:string){
   if(cloudGetToken()!==current)return;
   const [me,myRides,myDriver]=await Promise.all([cloudWhoAmI(current),cloudMyRides(current),cloudMyDriver(current)]);
   const [newOffers,admin]=await Promise.all([myDriver?.approved&&myDriver.online?cloudOpenRides(current):Promise.resolve([]),cloudIsAdmin(current)]);
   const staff=admin?await cloudStaffDrivers(current):[];
   if(cloudGetToken()!==current)return;
   setUserId(me.id);setUserEmail(me.email??'');setRides(myRides);setDriver(myDriver);
   setOffers(newOffers);setIsAdmin(admin);setStaffDrivers(staff);
 }
 async function run(work:()=>Promise<void>,message?:string){
   if(busy)return;setBusy(true);setNotice('');
   try{await work();if(message)setNotice(message)}catch(e){setNotice(errorText(e))}
   finally{setBusy(false)}
 }
 useEffect(()=>{if(token)void refresh(token).catch(()=>setNotice(t('تعذر تحديث الجلسة. سجّل الدخول مجددًا إذا لزم الأمر.','Could not load your session. Sign in again if needed.')))},[]);
 useEffect(()=>{
   if(!token)return;
   const tick=()=>{
     if(busy||polling.current||AppState.currentState!=='active'||cloudGetToken()!==token)return;
     polling.current=true;
     void refresh(token).catch(()=>{}).finally(()=>{polling.current=false});
   };
   const interval=setInterval(tick,state.preferences.dataSaver?60000:20000);
   const listener=AppState.addEventListener('change',next=>{if(next==='active')tick()});
   return ()=>{clearInterval(interval);listener.remove()};
 },[token,busy,state.preferences.dataSaver]);
 useEffect(()=>{
   if(!token||!driver?.approved||!driver.online)return;
   const interval=setInterval(()=>{if(AppState.currentState==='active')void cloudHeartbeat(token).catch(()=>{})},50000);
   return ()=>clearInterval(interval);
 },[token,driver?.approved,driver?.online]);
 const mine=rides.filter(r=>r.passenger_id===userId);
 const driving=rides.filter(r=>r.driver_id===userId);
 const activeDriverRide=driving.find(r=>liveStatuses.includes(r.status));
 const fullCategory=categories.find(c=>c.id===draft.category);
 function changeMode(next:'passenger'|'driver'){setMode(next);setNotice('')}
 function logout(){cloudSignOut();setToken(null);setUserId('');setUserEmail('');setRides([]);setOffers([]);setDriver(null);setIsAdmin(false);setStaffDrivers([]);setPin('');setPassengerPin('');setPinRideId(null)}
 return <Page title={t('الرحلات عبر الخادم — اختبار','Server rides — beta test')}>
  <Panel>
   <Label large>{t('اختبار الربط الحقيقي','Server connection test')}</Label>
   <Label muted>{t('هذه شاشة تجريبية منفصلة عن الحجز المحلي. لا توجد خدمة سيارات عاملة أو تسعيرة معتمدة أو مدفوعات. لا تستخدم بيانات أشخاص آخرين في الاختبار.','This is separate from the local demo. There are no live drivers, approved fares or payments. Use only your own test data.')}</Label>
   <Label muted>{t('تتحدث البيانات تلقائيًا أثناء فتح الشاشة: كل دقيقة في وضع توفير البيانات، وكل 20 ثانية في الوضع العادي.','Data refreshes while this screen is open: every minute in data saver mode, or every 20 seconds normally.')}</Label>
  </Panel>
  {!token?
   <Panel>
    <Field label={t('البريد الإلكتروني','Email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={200}/>
    <Field label={t('كلمة المرور','Password')} value={password} onChangeText={setPassword} secureTextEntry maxLength={128}/>
    <Button title={t('تسجيل الدخول','Sign in')} disabled={busy||!email.includes('@')||!password} onPress={()=>void run(async()=>{
      const next=await cloudSignIn(email,password);setToken(next);setPassword('');await refresh(next);
    },t('تم تسجيل الدخول إلى الخادم.','Signed in to the server.'))}/>
    <Button secondary title={t('إنشاء حساب اختبار','Create a test account')} disabled={busy||!email.includes('@')||password.length<8} onPress={()=>void run(async()=>{
      await cloudSignUp(email,password);setPassword('');
    },t('إذا طلب النظام تأكيد البريد، افتح رسالة التفعيل ثم سجّل الدخول.','If asked, confirm your email and then sign in.'))}/>
    <Label muted>{t('لا تُحفظ كلمة المرور أو جلسة الدخول في التخزين المحلي. ستحتاج إلى تسجيل الدخول مجددًا بعد إغلاق التطبيق.','Password and session are not stored on the phone. Sign in again after restarting the app.')}</Label>
   </Panel>:
   <>
    <Panel>
     <Label>{t('الحساب: ','Account: ')}{userEmail||t('مسجل الدخول','Signed in')}</Label>
     <View style={{gap:8}}>
      <Button secondary title={t('الراكب','Passenger')} disabled={mode==='passenger'} onPress={()=>changeMode('passenger')}/>
      <Button secondary title={t('السائق','Driver')} disabled={mode==='driver'} onPress={()=>changeMode('driver')}/>
      <Button secondary title={t('تحديث البيانات','Refresh')} disabled={busy} onPress={()=>void run(()=>refresh(token))}/>
      <Button secondary title={t('تسجيل الخروج','Sign out')} onPress={logout}/>
     </View>
    </Panel>
    {mode==='passenger'&&<>
      <Panel>
       <Label large>{t('طلب رحلة اختبارية','Test ride request')}</Label>
       <Label>{draft.pickup||t('لم تُحدد نقطة الانطلاق','No pickup selected')}</Label>
       <Label>{draft.destination||t('لم تُحدد نقطة الوصول','No destination selected')}</Label>
       <Label muted>{fullCategory?.[state.language]??draft.category} · {regions[draft.region]?.[state.language==='ar'?0:1]}</Label>
       <Button secondary title={t('تحديد الانطلاق على الخريطة','Choose pickup on map')} onPress={()=>router.push({pathname:'/location',params:{target:'pickup',returnTo:'cloud'}})}/>
       <Button secondary title={t('تحديد الوصول على الخريطة','Choose destination on map')} onPress={()=>router.push({pathname:'/location',params:{target:'destination',returnTo:'cloud'}})}/>
       <Button title={t('إرسال طلب اختبار إلى الخادم','Send test request to server')} disabled={busy||!draft.pickupPoint||!draft.destinationPoint} onPress={()=>void run(async()=>{
         const result=await cloudRequestRide(token,draft);setPassengerPin(result.pin);setPinRideId(result.ride_id);await refresh(token);
       },t('أُرسل طلب الاختبار. احتفظ برمز البدء ذي 6 أرقام.','Test request sent. Keep the 6-digit start PIN.'))}/>
      </Panel>
      <Label large>{t('طلباتي على الخادم','My server requests')}</Label>
      {mine.length===0&&<Label muted>{t('لا توجد طلبات بعد.','No server rides yet.')}</Label>}
      {mine.map(r=><Panel key={r.id}>
       <Label>{r.pickup} → {r.destination}</Label>
       <Label muted>{statusName(r.status)} · {r.category}</Label>
       {liveStatuses.includes(r.status)&&<>
        <Button secondary title={t('إظهار رمز بدء الرحلة','Show ride PIN')} disabled={busy} onPress={()=>void run(async()=>{
          const found=await cloudPassengerPin(token,r.id);setPassengerPin(found??'');setPinRideId(r.id);
        })}/>
        {pinRideId===r.id&&!!passengerPin&&<Label>{t('رمز بدء هذه الرحلة: ','Start PIN for this ride: ')}{passengerPin}</Label>}
        {['requested','accepted','arrived'].includes(r.status)&&<Button secondary title={t('إلغاء هذا الطلب','Cancel request')} disabled={busy} onPress={()=>void run(async()=>{
          const ok=await cloudCancelRide(token,r.id);if(!ok)throw Error();await refresh(token);
        },t('تم إلغاء طلب الاختبار.','Test request cancelled.'))}/>}
       </>}
      </Panel>)}
     </>}
    {isAdmin&&<Panel>
      <Label large>{t('إدارة السائقين — اختبار','Driver review — beta')}</Label>
      <Label muted>{t('لا تعتمد أي سائق قبل التحقق من هويته وأوراق السيارة.','Check the driver and vehicle documents before approval.')}</Label>
      {staffDrivers.length===0&&<Label muted>{t('لا توجد طلبات تسجيل سائق.','No driver applications.')}</Label>}
      {staffDrivers.map(account=><View key={account.user_id} style={{gap:8,paddingVertical:10}}>
        <Label>{account.user_id.slice(0,8)}… · {regions[account.region]?.[state.language==='ar'?0:1]} · {account.category}</Label>
        <Label muted>{account.approved?t('معتمد','Approved'):t('بانتظار المراجعة','Pending')}</Label>
        <Button secondary title={account.approved?t('سحب الموافقة','Revoke approval'):t('الموافقة على السائق','Approve driver')} disabled={busy}
         onPress={()=>void run(async()=>{
           const ok=await cloudApproveDriver(token,account.user_id,!account.approved);
           if(!ok)throw Error();await refresh(token);
         },t('تم تحديث حالة السائق.','Driver status updated.'))}/>
      </View>)}
    </Panel>}
    {mode==='driver'&&<>
      {!driver?<Panel>
       <Label>{t('التسجيل كسائق اختبار يحتاج موافقة الإدارة قبل استقبال أي طلب.','Test driver registration needs admin approval before receiving requests.')}</Label>
       <Label muted>{t('محافظة العمل ونوع السيارة يؤخذان من خيارات الرحلة الحالية.','Region and vehicle type are taken from the current ride options.')}</Label>
       <Button title={t('تقديم طلب تسجيل سائق','Apply as a test driver')} disabled={busy} onPress={()=>void run(async()=>{
         await cloudRegisterDriver(token,draft.region,draft.category);await refresh(token);
       },t('تم إرسال طلب اعتماد السائق.','Driver application sent.'))}/>
      </Panel>:<Panel>
       <Label>{t('منطقة العمل: ','Work region: ')}{regions[driver.region]?.[state.language==='ar'?0:1]}</Label>
       <Label>{t('نوع السيارة: ','Vehicle: ')}{driver.category}</Label>
       {!driver.approved?<Label>{t('بانتظار اعتماد الإدارة بعد التحقق من بيانات السائق والسيارة.','Waiting for admin approval and driver/vehicle checks.')}</Label>:
        <>
         <Label>{driver.online?t('استقبال الطلبات مفعّل','Requests enabled'):t('استقبال الطلبات متوقف','Requests off')}</Label>
         <Button title={driver.online?t('إيقاف استقبال الطلبات','Go offline'):t('تشغيل استقبال الطلبات','Go online')} disabled={busy} onPress={()=>void run(async()=>{
           await cloudSetDriverOnline(token,!driver.online);await refresh(token);
         })}/>
        </>}
      </Panel>}
      {!!driver?.approved&&driver.online&&<>
       <Label large>{t('الطلبات المتاحة','Available requests')}</Label>
       {offers.length===0&&<Label muted>{t('لا توجد طلبات مناسبة حاليًا. حدّث القائمة للبحث.','No matching requests. Refresh to check again.')}</Label>}
       {offers.map(offer=><Panel key={offer.ride_id}>
        <Label>{offer.category} · {regions[offer.region]?.[state.language==='ar'?0:1]}</Label>
        <Label muted>{t('منطقة الانطلاق تقريبًا: ','Approximate pickup area: ')}{offer.pickup_lat_approx}, {offer.pickup_lng_approx}</Label>
        <Button title={t('قبول طلب الاختبار','Accept test request')} disabled={busy||!!activeDriverRide} onPress={()=>void run(async()=>{
          const ok=await cloudAcceptRide(token,offer.ride_id);if(!ok)throw Error();await refresh(token);
        },t('تم قبول الطلب.','Ride accepted.'))}/>
       </Panel>)}
      </>}
      <Label large>{t('رحلاتي كسائق','My driver rides')}</Label>
      {driving.length===0&&<Label muted>{t('لم تقبل أي رحلة بعد.','No rides accepted yet.')}</Label>}
      {driving.map(r=><Panel key={r.id}>
       <Label>{r.pickup} → {r.destination}</Label>
       <Label muted>{statusName(r.status)}</Label>
       {['accepted','arrived','riding'].includes(r.status)&&<RoutePanel
        title={r.status==='riding'?t('الملاحة إلى وجهة الراكب','Directions to passenger destination'):t('الملاحة إلى نقطة انطلاق الراكب','Directions to passenger pickup')}
        to={r.status==='riding'?{latitude:r.destination_lat,longitude:r.destination_lng}:{latitude:r.pickup_lat,longitude:r.pickup_lng}}
        toAddress={r.status==='riding'?r.destination:r.pickup}
        currentLocation/>}
       {r.status==='accepted'&&<Button title={t('وصلت إلى نقطة الانطلاق','Arrived at pickup')} disabled={busy} onPress={()=>void run(async()=>{
         const result=await cloudAdvanceRide(token,r.id,'arrived');if(result!=='arrived')throw Error();await refresh(token);
       })}/>}
       {['accepted','arrived'].includes(r.status)&&<Button secondary title={t('إرجاع الطلب للبحث عن سائق آخر','Release ride to other drivers')} disabled={busy} onPress={()=>void run(async()=>{
         const ok=await cloudReleaseRide(token,r.id);if(!ok)throw new Error('invalid_transition');await refresh(token);
       },t('أُعيد الطلب إلى قائمة السائقين المتاحين.','Ride released for another driver.'))}/>}
       {r.status==='arrived'&&<>
        <Field label={t('رمز الراكب من 6 أرقام','Passenger 6-digit PIN')} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={6}/>
        <Button title={t('بدء الرحلة','Start ride')} disabled={busy||!/^\d{6}$/.test(pin)} onPress={()=>void run(async()=>{
          const result=await cloudAdvanceRide(token,r.id,'riding',pin);
          if(result!=='riding')throw new Error(result);
          setPin('');await refresh(token);
        })}/>
       </>}
       {r.status==='riding'&&<Button title={t('إنهاء الرحلة','Finish ride')} disabled={busy} onPress={()=>void run(async()=>{
         const result=await cloudAdvanceRide(token,r.id,'completed');if(result!=='completed')throw Error();await refresh(token);
       })}/>}
      </Panel>)}
     </>}
   </>
  }
  {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  {busy&&<Label muted>{t('جارٍ الاتصال بالخادم...','Connecting to server...')}</Label>}
 </Page>;
}
