import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Linking,Modal,Platform,View} from 'react-native';
import {useApp} from './context';
import {cloudCurrentToken} from './cloud-api';
import {isNativeWebView,nativeAction} from './site-bridge';
import {navigationPosition,navigationGuidanceReady,sharedNavigationDisplay,watchDriverPosition} from './navigation-position';
import {router} from 'expo-router';
import {positionDeadline} from './position-deadline';
import {createRoutingClient,type RoutePlan} from './routing';
import {routeScheduler} from './route-scheduler';
import {getValhallaRoute,type DriverRoutePlan} from './valhalla-route';
import DriverPilotMap from './map/DriverPilotMap';
import {useDriverSpeech} from './driver-speech';
import {distanceMeters,navigationProgress} from './navigation-progress';
import type {Coordinate} from './geo';
import type {Fix} from './meter';
import {googleDirections} from './google-links';
import MapCanvas from './map/MapCanvas';
import {Button,Label,Panel,useText,useTheme} from './ui';
const formatDistance=(meters:number,ar:boolean)=>meters<1000?Math.round(meters/10)*10+' '+(ar?'م':'m'):(meters/1000).toFixed(1)+' '+(ar?'كم':'km');
export default function DriverNavigation({to,title,targetLabel,action,initialPlan,routeOrigin,devicePosition,pilotAvailable,pilotActive,onPilotToggle}:{to:Coordinate;title:string;targetLabel:string;action:React.ReactNode;initialPlan?:RoutePlan|null;routeOrigin?:Coordinate;devicePosition?:Coordinate;pilotAvailable?:boolean;pilotActive?:boolean;onPilotToggle?:()=>void}){
 const {state,connection}=useApp();const t=useText();const {colors}=useTheme();const ar=state.language==='ar';
 const [plan,setPlan]=useState<DriverRoutePlan|null>(null),[gpsLost,setGpsLost]=useState(true),[accuracy,setAccuracy]=useState<number|null>(null),[position,setPosition]=useState<Coordinate|null>(devicePosition??null),[error,setError]=useState(''),[routeError,setRouteError]=useState(''),[busy,setBusy]=useState(false),[busyStage,setBusyStage]=useState<'location'|'route'>('location'),[elapsed,setElapsed]=useState(0),[enabled,setEnabled]=useState(true),[follow,setFollow]=useState(true),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0),[revision,setRevision]=useState(0);
 const shared=useRef(devicePosition);shared.current=devicePosition;
 const lastFix=useRef<Fix|null>(null),latest=useRef<DriverRoutePlan|null>(null);
 const lat=to.latitude,lng=to.longitude,originLat=routeOrigin?.latitude,originLng=routeOrigin?.longitude;
 const target=useRef('');const [lastFixAt,setLastFixAt]=useState<number|null>(null);
 useEffect(()=>{
  const known=shared.current;
  const start=originLat!==undefined&&originLng!==undefined?{latitude:originLat,longitude:originLng}:undefined;
  const destination={latitude:lat,longitude:lng};
  const key=[lat,lng,state.language,pilotActive].join('|');
  if(target.current!==key){target.current=key;latest.current=null;setPlan(null)}
  if(!enabled){setBusy(false);setGpsLost(true);return}
  setError('');setRouteError('');
  let alive=true,nativeVisible=Platform.OS==='web'?(window as Window&{__YALLA_NATIVE_ACTIVE__?:boolean}).__YALLA_NATIVE_ACTIVE__:undefined;
  const isVisible=()=>Platform.OS!=='web'||(nativeVisible!==false&&document.visibilityState!=='hidden');
  let visible=isVisible(),stopWatch:(()=>void)|null=null,streamMode:'native'|'browser'|'none'='none';
  let firstFixTimer:ReturnType<typeof setTimeout>|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined,gpsRequest:AbortController|null=null,routeRequest:AbortController|null=null;
  let nextRouteAt=0,offRouteCount=0,reroutes=0,forceRoute=attempt>0;
  let hasPosition=!!known||!!lastFix.current,lastPosition=lastFix.current??(start?undefined:known);
  let preciseStreamAt=0;
  function showFix(fix:Fix){
   const accurate=navigationGuidanceReady(fix);
   if(lastFix.current&&fix.time<lastFix.current.time)return;
   lastFix.current=fix;
   hasPosition=true;lastPosition=fix;setPosition(fix);setLastFixAt(fix.time);setAccuracy(fix.accuracy);setGpsLost(!accurate);setRevision(value=>value+1);
  }
  function receiveFix(fix:Fix){
   if(lastFix.current&&fix.time<lastFix.current.time)return;
   const accurate=navigationGuidanceReady(fix);
   showFix(fix);
   setError('');
   void updateRoute(fix,accurate);
  }
  async function updateRoute(point:Coordinate,accurate=false){
   if(!alive||!visible||routeRequest||pilotActive&&!accurate&&!!latest.current||(Platform.OS==='web'&&navigator.onLine===false))return;
   const existing=latest.current;
   if(!pilotActive&&!existing&&initialPlan&&distanceMeters(destination,initialPlan.to)<=10&&distanceMeters(point,initialPlan.from)<=150){
    latest.current=initialPlan;setPlan(initialPlan);
    if(!forceRoute)return;
   }
   if(accurate&&existing){
    const progress=navigationProgress(existing,point);
    offRouteCount=progress.offRouteMeters>(pilotActive?50:100)?offRouteCount+1:0;
   }
   if(Date.now()<nextRouteAt||!forceRoute&&latest.current&&(offRouteCount<2||reroutes>=(pilotActive?3:2)))return;
   forceRoute=false;
   const controller=new AbortController();routeRequest=controller;
   if(latest.current)reroutes++;
   setRouteError('');setBusyStage('route');setBusy(true);
   try{
    let next:DriverRoutePlan;
    if(pilotActive)next=await getValhallaRoute(point,destination,state.language,controller.signal);
    else{
     const token=await cloudCurrentToken();
     const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
     next=await routeScheduler.run(()=>client.route(point,destination,controller.signal,state.language,token),controller.signal);
    }
    if(alive&&!controller.signal.aborted){latest.current=next;setPlan(next);offRouteCount=0;nextRouteAt=Date.now()+(pilotActive?(accurate?15000:2000):60000)}
   }catch(error){
    if(alive&&!controller.signal.aborted){
     const cause=error as {code?:string;kind?:string};
     const code=cause.code??cause.kind??'network';
     setRouteError(code);
     nextRouteAt=Date.now()+(['busy','not_configured','not_enabled','unauthorized','login_required'].includes(code)?60000:15000);
    }
   }finally{
    if(routeRequest===controller)routeRequest=null;
    if(alive&&!routeRequest)setBusy(false);
   }
  }
  async function tick(ask=false){
   if(!alive||!visible||gpsRequest)return;
   clearTimeout(timer);
   const controller=new AbortController();gpsRequest=controller;
   let delay=hasPosition?4000:7000;
   if(!hasPosition&&!routeRequest){setBusyStage('location');setBusy(true)}
   try{
    const fix=await positionDeadline(signal=>navigationPosition(ask,signal,hasPosition),controller,22000);
    if(!alive||controller.signal.aborted)return;
    receiveFix(fix);
   }catch(error){
    const code=(error as {code?:string}).code??'position';
    if(alive&&visible&&(!controller.signal.aborted||code==='timeout')){
     setError(code);
     if(!navigationGuidanceReady(lastFix.current))setGpsLost(true);
     if(code==='permission'||code==='services')delay=15000;
     if(lastPosition||start)void updateRoute(lastPosition??start!);
    }
   }finally{
    if(gpsRequest===controller){
     gpsRequest=null;
     if(alive){
      if(!routeRequest)setBusy(false);
      if(visible&&(!stopWatch||Date.now()-preciseStreamAt>=9000))timer=setTimeout(()=>void tick(),delay);
     }
    }
   }
  }
  const armLocationCheck=()=>{
   clearTimeout(firstFixTimer);
   firstFixTimer=setTimeout(()=>{
    if(!alive||!visible||!stopWatch)return;
    // Keep the primary subscription alive while the one-shot provider acquires
    // a fix. Reopening the same watcher repeatedly can interrupt acquisition.
    void tick();
   },10000);
  };
  const startLocation=(ask=false)=>{
   if(!visible||stopWatch||gpsRequest)return;
   stopWatch=watchDriverPosition(ask,fix=>{
    if(!alive||!visible)return;
    const accurate=navigationGuidanceReady(fix);
    if(accurate){
     preciseStreamAt=fix.time;
     clearTimeout(timer);
     gpsRequest?.abort();gpsRequest=null;
     if(!routeRequest)setBusy(false);
     armLocationCheck();
    }
    receiveFix(fix);
   },code=>{
    if(!alive||!visible)return;
    if(['permission','services','accuracy'].includes(code))clearTimeout(firstFixTimer);
    setError(code);
   });
   if(stopWatch){
    streamMode=isNativeWebView()&&(window as Window&{__YALLA_DRIVER_LOCATION_STREAM__?:boolean}).__YALLA_DRIVER_LOCATION_STREAM__===true?'native':'browser';
    armLocationCheck();
    if(ask)void tick(true);
   }else{streamMode='none';void tick(ask)}
  };
  const pause=()=>{
   clearTimeout(timer);clearTimeout(firstFixTimer);
   stopWatch?.();stopWatch=null;streamMode='none';
   gpsRequest?.abort();gpsRequest=null;
   routeRequest?.abort();routeRequest=null;
  };
  const resume=()=>{
   visible=isVisible();
   if(!visible){pause();return}
   if(!latest.current){nextRouteAt=0;if(lastPosition||start)void updateRoute(lastPosition??start!)}
   startLocation();
  };
  const bootstrap=()=>{
   if(!visible||!isNativeWebView()||streamMode==='native'||!(window as Window&{__YALLA_DRIVER_LOCATION_STREAM__?:boolean}).__YALLA_DRIVER_LOCATION_STREAM__)return;
   // Replace the older WebView GPS watcher with the new direct Android stream.
   // Do not retain two independent subscriptions competing for GPS fixes.
   stopWatch?.();stopWatch=null;streamMode='none';
   clearTimeout(timer);clearTimeout(firstFixTimer);gpsRequest?.abort();gpsRequest=null;
   if(!routeRequest)setBusy(false);
   startLocation();
  };
  const native=(event:Event)=>{const active=(event as CustomEvent).detail?.active;if(typeof active==='boolean'){nativeVisible=active;resume()}};
  if(Platform.OS==='web'){document.addEventListener('visibilitychange',resume);window.addEventListener('yalla:native-visibility',native);window.addEventListener('yalla:native-bootstrap',bootstrap);window.addEventListener('online',resume)}
  if(known){const display=sharedNavigationDisplay(known);if(display.fix)showFix(display.fix)}
  const measured=lastFix.current;
  if(measured)setGpsLost(!navigationGuidanceReady(measured));
  const first=lastPosition??start;
  if(first)void updateRoute(first,measured===first&&navigationGuidanceReady(measured));
  startLocation(attempt>0);
  return()=>{alive=false;pause();if(Platform.OS==='web'){document.removeEventListener('visibilitychange',resume);window.removeEventListener('yalla:native-visibility',native);window.removeEventListener('yalla:native-bootstrap',bootstrap);window.removeEventListener('online',resume)}};
 },[lat,lng,originLat,originLng,state.language,enabled,attempt,initialPlan,pilotActive]);
 useEffect(()=>{
  if(gpsLost||lastFixAt===null)return;
  const expiry=setTimeout(()=>setGpsLost(true),Math.max(0,lastFixAt+15000-Date.now()));
  return()=>clearTimeout(expiry);
 },[gpsLost,lastFixAt]);
 useEffect(()=>{setElapsed(0);if(!busy)return;const started=Date.now();const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer)},[busy,busyStage]);
 useEffect(()=>{if(!expanded||Platform.OS!=='web')return;const back=(event:Event)=>{event.preventDefault();setExpanded(false)};window.addEventListener('yalla:native-back',back);return()=>window.removeEventListener('yalla:native-back',back)},[expanded]);
 const activePlan=plan?.provider===(pilotActive?'Valhalla':'Google Maps')?plan:null;
 const progress=activePlan&&position?navigationProgress(activePlan,position):null;
 const offRoute=progress&&progress.offRouteMeters>(pilotActive?50:100);
 const pilotPosition=progress&&!gpsLost&&progress.offRouteMeters<=18?progress.snapped:position;
 const arrived=!gpsLost&&!!position&&distanceMeters(position,to)<=35;
 const stale=lastFixAt!==null&&Date.now()-lastFixAt>=15000;
 const speech=useDriverSpeech(activePlan,progress,enabled&&!stale&&!gpsLost&&!offRoute&&!arrived,state.language);
 const voiceButton=<Button secondary icon={speech.enabled?'volume-high-outline':'volume-mute-outline'}
  title={speech.enabled?t('كتم صوت الاتجاهات','Mute directions'):t('تشغيل صوت الاتجاهات','Turn on voice directions')}
  onPress={()=>void speech.toggle()}/>;
 const voiceNotice=speech.problem&&<Label muted>{speech.available
  ?t('الصوت غير متاح لهذه اللغة. ثبّت صوت النطق العربي أو الإنجليزي من إعدادات الهاتف ثم أعد المحاولة.','No voice is available for this language. Install the matching voice in your phone settings and try again.')
  :t('الصوت يحتاج متصفحًا يدعم النطق أو نسخة أندرويد 1.0.6 فأحدث.','Voice needs a browser that supports speech or Android app 1.0.6 or later.')}</Label>;
 const livePosition=enabled&&lastFixAt!==null&&!stale;
 const gpsMessage=error==='permission'?t('اسمح بالموقع أثناء استخدام التطبيق.','Allow location while using the app.'):error==='services'?t('فعّل خدمة الموقع في الهاتف.','Turn on phone location.'):error==='accuracy'||error==='timeout'||error==='position'?t('لم يصل تحديث جديد للموقع. يمكنك فتح خرائط Google أو تحديث الموقع من هنا.','No new location update arrived. You can open Google Maps or retry here.'):'';
 const routeMessage=pilotActive&&routeError!=='navigation'&&routeError?t('تعذّر حساب طريق Valhalla التجريبي. يمكنك الرجوع إلى الملاحة الحالية أو فتح خرائط Google.','The Valhalla pilot route could not load. Switch back or open Google Maps.'):routeError==='no_route'?t('لم تعثر Google على طريق قيادة إلى الوجهة.','Google found no driving route.'):routeError==='busy'?t('خدمة الطرق مشغولة. سنعيد المحاولة.','The route service is busy. We will retry.'):routeError==='login_required'||routeError==='unauthorized'?t('تعذر التحقق من حساب السائق لحساب الطريق.','Could not verify the driver account for routing.'):routeError==='navigation'?t('تعذر فتح خرائط Google.','Could not open Google Maps.'):routeError?t('تعذر تحميل مسار القيادة من Google.','Could not load the driving route from Google.'):'';
 const openGoogle=()=>{void Linking.openURL(googleDirections(to,undefined,true)).catch(()=>setRouteError('navigation'))};
 const googleButton=<Button secondary icon="navigate-outline" title={t('فتح الملاحة في خرائط Google','Open navigation in Google Maps')} onPress={openGoogle}/>;
 const pilotToggle=pilotAvailable&&onPilotToggle&&Platform.OS==='web'&&<Button secondary icon="map-outline"
  title={pilotActive?t('العودة إلى الملاحة الحالية','Return to current navigation'):t('تجربة MapLibre وValhalla','Try MapLibre and Valhalla')}
  onPress={onPilotToggle}/>;
 const pilotDisclosure=pilotAvailable&&!pilotActive&&<Label muted>{t('اختبار خاص. عند تشغيله تُرسل إحداثيات المسار إلى خادم Valhalla التجريبي.','Private pilot. Enabling it sends route coordinates to the Valhalla demo server.')}</Label>;
 const mapContent=(height:number)=>pilotActive
  ?<DriverPilotMap point={pilotPosition} destination={to} route={activePlan?.points} follow={follow&&livePosition} fresh={livePosition}/>
  :<MapCanvas compact readOnly minMapHeight={height} point={activePlan?.from??routeOrigin??to} route={activePlan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/>;
 const map=(height:number)=><View style={{height,borderRadius:16,overflow:'hidden'}}>{mapContent(height)}</View>;
 const retry=<Button secondary title={t('تحديث الموقع والطريق','Update location and route')} onPress={()=>{setEnabled(true);setAttempt(value=>value+1)}}/>;
 const preview=pilotActive&&gpsLost&&activePlan&&<Label muted>{t('هذا المسار من آخر موقع متاح أو من نقطة الانطلاق. تستأنف تعليمات الانعطاف عند وصول موقع حديث ودقيق.','Route preview from the last available position or pickup. Turn guidance resumes with a fresh, accurate position.')}</Label>;
 const instruction=<View style={{padding:14,borderRadius:14,backgroundColor:colors.selected,gap:6}}><Label display>{gpsLost?(!enabled?t('المتابعة متوقفة مؤقتًا','Navigation is paused'):stale?t('توقّف تحديث موقع السيارة','Car location has stopped updating'):position?t('بانتظار موقع أدق','Waiting for better GPS'):t('جارٍ قراءة موقع الهاتف','Reading phone location')):arrived?t('اقتربت من نقطة الوصول','You are near the destination'):routeError&&!activePlan?t('تعذر حساب الطريق','Could not find the route'):offRoute?t('أنت خارج المسار المعروض','You are off the shown route'):pilotActive&&progress?.nextInstruction?t('بعد ','In ')+formatDistance(progress.nextTurnMeters,ar)+' · '+progress.nextInstruction:progress?.instruction||t('نجهّز الطريق إلى وجهتك…','Finding the route to your destination…')}</Label>{!pilotActive&&progress?.nextInstruction&&!gpsLost&&!offRoute&&!arrived&&<Label>{t('بعد ','In ')}{formatDistance(progress.nextTurnMeters,ar)}: {progress.nextInstruction}</Label>}{progress&&!gpsLost&&!offRoute&&!arrived&&<Label large>{formatDistance(progress.remainingMeters,ar)} · {Math.max(1,Math.ceil(progress.remainingSeconds/60))} {t('دقيقة تقريبًا','min, estimated')}</Label>}</View>;
 return <Panel outlined><Label large>{title}</Label>{instruction}{action}{voiceButton}{voiceNotice}{googleButton}{pilotToggle}
  {pilotDisclosure}
  {preview}
  {connection==='offline'&&<Label muted>{activePlan?t('الاتصال منقطع. نعرض آخر مسار متاح.','Offline. Showing the last available route.'):t('الاتصال منقطع. سيُستأنف حساب الطريق عند عودته.','Offline. Route lookup resumes when you reconnect.')}</Label>}
  {lastFixAt!==null&&<Label muted>{t('آخر تحديث للموقع: ','Location last updated: ')}{new Date(lastFixAt).toLocaleTimeString(ar?'ar':'en')}</Label>}
  <Label>{targetLabel}</Label>
  {!expanded&&map(290)}
  {busy&&<View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator color={colors.purple}/><Label muted>{busyStage==='location'?t('جارٍ قراءة موقع الهاتف…','Reading phone location…'):t('جارٍ حساب الطريق…','Finding the route…')} {elapsed} {t('ث','s')}</Label></View>}
  {accuracy!==null&&<Label muted>{t('دقة آخر قراءة: نحو ','Last location accuracy: about ')}{Math.ceil(accuracy)} {t('متر','m')}{stale?t(' · قراءة قديمة',' · Previous reading'):''}</Label>}
  {!!gpsMessage&&<Label muted>{gpsMessage}</Label>}
  {!!routeMessage&&<View accessibilityRole="alert"><Label muted>{routeMessage}</Label></View>}
  {['permission','services','accuracy'].includes(error)&&<View style={{gap:8}}>
   <Button secondary title={t('حالة الموقع والأذونات','Location status and permissions')} onPress={()=>{setExpanded(false);router.push('/settings')}}/>
   {isNativeWebView()&&<Button secondary title={t('فتح أذونات موقع التطبيق','Open app location permissions')} onPress={()=>void nativeAction('location-settings').catch(()=>setError('permission'))}/>}
  </View>}
  {offRoute&&<Label muted>{t('نعيد حساب الطريق عند توفر موقع دقيق. يمكنك طلب التحديث يدويًا.','The route updates with an accurate location. You can also update it now.')}</Label>}
  <View style={{gap:8}}><Button icon="expand-outline" title={t('تكبير الملاحة داخل التطبيق','Full-screen navigation')} onPress={()=>setExpanded(true)}/><Button secondary icon="locate" title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/>{retry}<Button secondary title={enabled?t('إيقاف المتابعة مؤقتًا','Pause navigation'):t('استئناف الملاحة','Resume navigation')} onPress={()=>setEnabled(value=>!value)}/></View>
  <Label muted>{pilotActive?'MapLibre · Valhalla · FOSSGIS':'Google Maps'} · {t('المتابعة أثناء فتح التطبيق','Navigation while the app is open')}</Label>
  <Modal visible={expanded} animationType="none" onRequestClose={()=>setExpanded(false)}><View style={{flex:1,padding:16,paddingTop:32,backgroundColor:colors.background,gap:12}}>{instruction}{action}{voiceButton}{voiceNotice}{googleButton}{pilotToggle}{pilotDisclosure}{preview}<View style={{flex:1,minHeight:200}}>{mapContent(200)}</View>{!!(routeMessage||gpsMessage)&&<Label muted>{routeMessage||gpsMessage}</Label>}{gpsLost&&retry}<Button secondary title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button title={t('العودة إلى الطلب','Back to the ride')} onPress={()=>setExpanded(false)}/></View></Modal>
 </Panel>;
}
