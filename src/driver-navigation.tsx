import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Linking,Modal,Platform,View} from 'react-native';
import {useApp} from './context';
import {cloudCurrentToken} from './cloud-api';
import {isNativeWebView,nativeAction} from './site-bridge';
import {navigationPosition,navigationGuidanceReady,sharedNavigationDisplay} from './navigation-position';
import {router} from 'expo-router';
import {positionDeadline} from './position-deadline';
import {createRoutingClient,type RoutePlan} from './routing';
import {routeScheduler} from './route-scheduler';
import {distanceMeters,navigationProgress} from './navigation-progress';
import type {Coordinate} from './geo';
import type {Fix} from './meter';
import {googleDirections} from './google-links';
import MapCanvas from './map/MapCanvas';
import {Button,Label,Panel,useText,useTheme} from './ui';
const formatDistance=(meters:number,ar:boolean)=>meters<1000?Math.round(meters/10)*10+' '+(ar?'م':'m'):(meters/1000).toFixed(1)+' '+(ar?'كم':'km');
export default function DriverNavigation({to,title,targetLabel,action,initialPlan,routeOrigin,devicePosition}:{to:Coordinate;title:string;targetLabel:string;action:React.ReactNode;initialPlan?:RoutePlan|null;routeOrigin?:Coordinate;devicePosition?:Coordinate}){
 const {state,connection}=useApp();const t=useText();const {colors}=useTheme();const ar=state.language==='ar';
 const [plan,setPlan]=useState<RoutePlan|null>(null),[gpsLost,setGpsLost]=useState(true),[accuracy,setAccuracy]=useState<number|null>(null),[position,setPosition]=useState<Coordinate|null>(devicePosition??null),[error,setError]=useState(''),[routeError,setRouteError]=useState(''),[busy,setBusy]=useState(false),[busyStage,setBusyStage]=useState<'location'|'route'>('location'),[elapsed,setElapsed]=useState(0),[enabled,setEnabled]=useState(true),[follow,setFollow]=useState(true),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0),[revision,setRevision]=useState(0);
 const shared=useRef(devicePosition);shared.current=devicePosition;
 const lastPrecise=useRef<Fix|null>(null),latest=useRef<RoutePlan|null>(null);
 const lat=to.latitude,lng=to.longitude,originLat=routeOrigin?.latitude,originLng=routeOrigin?.longitude;
 const target=useRef('');const [lastFixAt,setLastFixAt]=useState<number|null>(null);
 useEffect(()=>{
  const known=shared.current;
  const start=originLat!==undefined&&originLng!==undefined?{latitude:originLat,longitude:originLng}:undefined;
  const destination={latitude:lat,longitude:lng};
  const key=[lat,lng,state.language].join('|');
  if(target.current!==key){target.current=key;latest.current=null;lastPrecise.current=null;setPlan(null)}
  if(!enabled){setBusy(false);setGpsLost(true);return}
  setError('');setRouteError('');
  let alive=true,nativeVisible:boolean|null=null,visible=Platform.OS!=='web'||document.visibilityState!=='hidden';
  let timer:ReturnType<typeof setTimeout>|undefined,gpsRequest:AbortController|null=null,routeRequest:AbortController|null=null;
  let nextRouteAt=0,offRouteCount=0,reroutes=0,forceRoute=attempt>0;
  let hasPosition=!!known,lastPosition=start?undefined:known;
  function showFix(fix:Fix){
   const accurate=navigationGuidanceReady(fix);
   if(accurate)lastPrecise.current=fix;
   if(!accurate&&navigationGuidanceReady(lastPrecise.current))return;
   hasPosition=true;lastPosition=fix;setPosition(fix);setLastFixAt(fix.time);setAccuracy(fix.accuracy);setGpsLost(!accurate);setRevision(value=>value+1);
  }
  async function updateRoute(point:Coordinate,accurate=false){
   if(!alive||!visible||routeRequest||(Platform.OS==='web'&&navigator.onLine===false))return;
   const existing=latest.current;
   if(!existing&&initialPlan&&distanceMeters(destination,initialPlan.to)<=10&&distanceMeters(point,initialPlan.from)<=150){
    latest.current=initialPlan;setPlan(initialPlan);
    if(!forceRoute)return;
   }
   if(accurate&&existing){
    const progress=navigationProgress(existing,point);
    offRouteCount=progress.offRouteMeters>100?offRouteCount+1:0;
   }
   if(Date.now()<nextRouteAt||!forceRoute&&latest.current&&(offRouteCount<2||reroutes>=2))return;
   forceRoute=false;
   const controller=new AbortController();routeRequest=controller;
   if(latest.current)reroutes++;
   setRouteError('');setBusyStage('route');setBusy(true);
   try{
    const token=await cloudCurrentToken();
    const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
    const next=await routeScheduler.run(()=>client.route(point,destination,controller.signal,state.language,token),controller.signal);
    if(alive&&!controller.signal.aborted){latest.current=next;setPlan(next);offRouteCount=0;nextRouteAt=Date.now()+60000}
   }catch(error){
    if(alive&&!controller.signal.aborted){
     const cause=error as {code?:string;kind?:string};
     const code=cause.code??cause.kind??'network';
     setRouteError(code);
     nextRouteAt=Date.now()+(['busy','not_configured','not_enabled','unauthorized','login_required'].includes(code)?60000:15000);
    }
   }finally{
    if(routeRequest===controller)routeRequest=null;
    if(alive)setBusy(false);
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
    showFix(fix);setError('');
    void updateRoute(fix,navigationGuidanceReady(fix));
   }catch(error){
    const code=(error as {code?:string}).code??'position';
    if(alive&&visible&&(!controller.signal.aborted||code==='timeout')){
     setError(code);
     if(!navigationGuidanceReady(lastPrecise.current))setGpsLost(true);
     if(code==='permission'||code==='services')delay=15000;
     if(lastPosition||start)void updateRoute(lastPosition??start!);
    }
   }finally{
    if(gpsRequest===controller)gpsRequest=null;
    if(alive){
     if(!routeRequest)setBusy(false);
     if(visible)timer=setTimeout(()=>void tick(),delay);
    }
   }
  }
  const pause=()=>{clearTimeout(timer);gpsRequest?.abort();routeRequest?.abort()};
  const resume=()=>{
   visible=nativeVisible??(Platform.OS!=='web'||document.visibilityState!=='hidden');
   if(!visible){pause();return}
   if(!latest.current){nextRouteAt=0;if(lastPosition||start)void updateRoute(lastPosition??start!)}
   void tick();
  };
  const native=(event:Event)=>{const active=(event as CustomEvent).detail?.active;if(typeof active==='boolean'){nativeVisible=active;resume()}};
  if(Platform.OS==='web'){document.addEventListener('visibilitychange',resume);window.addEventListener('yalla:native-visibility',native);window.addEventListener('online',resume)}
  if(known){const display=sharedNavigationDisplay(known);if(display.fix)showFix(display.fix)}
  const first=lastPosition??start;
  if(first)void updateRoute(first);
  void tick(attempt>0);
  return()=>{alive=false;pause();if(Platform.OS==='web'){document.removeEventListener('visibilitychange',resume);window.removeEventListener('yalla:native-visibility',native);window.removeEventListener('online',resume)}};
 },[lat,lng,originLat,originLng,state.language,enabled,attempt,initialPlan]);
 useEffect(()=>{
  if(gpsLost||lastFixAt===null)return;
  const expiry=setTimeout(()=>setGpsLost(true),Math.max(0,lastFixAt+15000-Date.now()));
  return()=>clearTimeout(expiry);
 },[gpsLost,lastFixAt]);
 useEffect(()=>{setElapsed(0);if(!busy)return;const started=Date.now();const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer)},[busy,busyStage]);
 useEffect(()=>{if(!expanded||Platform.OS!=='web')return;const back=(event:Event)=>{event.preventDefault();setExpanded(false)};window.addEventListener('yalla:native-back',back);return()=>window.removeEventListener('yalla:native-back',back)},[expanded]);
 const progress=plan&&position?navigationProgress(plan,position):null;
 const offRoute=progress&&progress.offRouteMeters>100;
 const gpsMessage=error==='permission'?t('اسمح بالموقع أثناء استخدام التطبيق.','Allow location while using the app.'):error==='services'?t('فعّل خدمة الموقع في الهاتف.','Turn on phone location.'):error==='accuracy'||error==='timeout'||error==='position'?t('نعيد محاولة الحصول على موقع دقيق تلقائيًا.','We are retrying precise location automatically.'):'';
 const routeMessage=routeError==='no_route'?t('لم تعثر Google على طريق قيادة إلى الوجهة.','Google found no driving route.'):routeError==='busy'?t('خدمة الطرق مشغولة. سنعيد المحاولة.','The route service is busy. We will retry.'):routeError==='login_required'||routeError==='unauthorized'?t('تعذر التحقق من حساب السائق لحساب الطريق.','Could not verify the driver account for routing.'):routeError==='navigation'?t('تعذر فتح خرائط Google.','Could not open Google Maps.'):routeError?t('تعذر تحميل مسار القيادة من Google.','Could not load the driving route from Google.'):'';
 const openGoogle=()=>{void Linking.openURL(googleDirections(to,undefined,true)).catch(()=>setRouteError('navigation'))};
 const map=(height:number)=><View style={{height,borderRadius:16,overflow:'hidden'}}><MapCanvas compact readOnly minMapHeight={height} point={plan?.from??routeOrigin??to} route={plan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/></View>;
 const instruction=<View style={{padding:14,borderRadius:14,backgroundColor:colors.selected,gap:6}}><Label display>{gpsLost?(!enabled?t('المتابعة متوقفة مؤقتًا','Navigation is paused'):position?t('بانتظار موقع أدق','Waiting for better GPS'):t('جارٍ قراءة موقع الهاتف','Reading phone location')):routeError&&!plan?t('تعذر حساب الطريق','Could not find the route'):progress?.arrived?t('اقتربت من نقطة الوصول','You are near the destination'):offRoute?t('أنت خارج المسار المعروض','You are off the shown route'):progress?.instruction||t('نجهّز الطريق إلى وجهتك…','Finding the route to your destination…')}</Label>{progress?.nextInstruction&&!gpsLost&&!offRoute&&!progress.arrived&&<Label>{t('بعد ','In ')}{formatDistance(progress.nextTurnMeters,ar)}: {progress.nextInstruction}</Label>}{progress&&!gpsLost&&!offRoute&&<Label large>{formatDistance(progress.remainingMeters,ar)} · {Math.max(1,Math.ceil(progress.remainingSeconds/60))} {t('دقيقة تقريبًا','min, estimated')}</Label>}</View>;
 return <Panel outlined><Label large>{title}</Label>{instruction}{action}
  {connection==='offline'&&<Label muted>{plan?t('الاتصال منقطع. نعرض آخر مسار متاح.','Offline. Showing the last available route.'):t('الاتصال منقطع. سيُستأنف حساب الطريق عند عودته.','Offline. Route lookup resumes when you reconnect.')}</Label>}
  {lastFixAt!==null&&<Label muted>{t('آخر تحديث للموقع: ','Location last updated: ')}{new Date(lastFixAt).toLocaleTimeString(ar?'ar':'en')}</Label>}
  <Label>{targetLabel}</Label>
  {!expanded&&map(290)}
  {busy&&<View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator color={colors.purple}/><Label muted>{busyStage==='location'?t('جارٍ قراءة موقع الهاتف…','Reading phone location…'):t('جارٍ حساب الطريق…','Finding the route…')} {elapsed} {t('ث','s')}</Label></View>}
  {accuracy!==null&&<Label muted>{t('دقة آخر قراءة: نحو ','Last location accuracy: about ')}{Math.ceil(accuracy)} {t('متر','m')}{gpsLost&&position?t(' — نعرض الموقع والطريق، وتبقى تعليمات الانعطاف متوقفة حتى تتحسن الدقة.',' — the map is visible; turn directions wait for better accuracy.'):''}</Label>}
  {!!gpsMessage&&<Label muted>{gpsMessage}</Label>}
  {!!routeMessage&&<View accessibilityRole="alert"><Label muted>{routeMessage}</Label></View>}
  {['permission','services'].includes(error)&&<View style={{gap:8}}>
   <Button secondary title={t('حالة الموقع والأذونات','Location status and permissions')} onPress={()=>{setExpanded(false);router.push('/settings')}}/>
   {isNativeWebView()&&<Button secondary title={t('فتح أذونات موقع التطبيق','Open app location permissions')} onPress={()=>void nativeAction('location-settings').catch(()=>setError('permission'))}/>}
  </View>}
  {(gpsLost||!!routeError)&&<Button secondary icon="navigate-outline" title={t('فتح الملاحة في خرائط Google','Open navigation in Google Maps')} onPress={openGoogle}/>}
  {offRoute&&<Label muted>{t('نعيد حساب الطريق عند توفر موقع دقيق. يمكنك طلب التحديث يدويًا.','The route updates with an accurate location. You can also update it now.')}</Label>}
  <View style={{gap:8}}><Button icon="expand-outline" title={t('تكبير الملاحة داخل التطبيق','Full-screen navigation')} onPress={()=>setExpanded(true)}/><Button secondary icon="locate" title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button secondary title={t('تحديث الموقع والطريق','Update location and route')} onPress={()=>{setEnabled(true);setAttempt(value=>value+1)}}/><Button secondary title={enabled?t('إيقاف المتابعة مؤقتًا','Pause navigation'):t('استئناف الملاحة','Resume navigation')} onPress={()=>setEnabled(value=>!value)}/></View>
  <Label muted>Google Maps · {t('المتابعة أثناء فتح التطبيق','Navigation while the app is open')}</Label>
  <Modal visible={expanded} animationType="none" onRequestClose={()=>setExpanded(false)}><View style={{flex:1,padding:16,paddingTop:32,backgroundColor:colors.background,gap:12}}>{instruction}{action}<View style={{flex:1,minHeight:200}}><MapCanvas compact readOnly minMapHeight={200} point={plan?.from??routeOrigin??to} route={plan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/></View>{!!(routeMessage||gpsMessage)&&<Label muted>{routeMessage||gpsMessage}</Label>}{(gpsLost||!!routeError)&&<Button secondary icon="navigate-outline" title={t('فتح الملاحة في خرائط Google','Open navigation in Google Maps')} onPress={openGoogle}/>}<Button secondary title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button title={t('العودة إلى الطلب','Back to the ride')} onPress={()=>setExpanded(false)}/></View></Modal>
 </Panel>;
}
