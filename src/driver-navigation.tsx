import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Platform,View} from 'react-native';
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
import MapCanvas from './map/MapCanvas';
import {Button,Label,Panel,useText,useTheme} from './ui';
const formatDistance=(meters:number,ar:boolean)=>meters<1000?Math.round(meters/10)*10+' '+(ar?'م':'m'):(meters/1000).toFixed(1)+' '+(ar?'كم':'km');
export default function DriverNavigation({to,title,targetLabel,action,initialPlan,devicePosition,deviceRevision}:{to:Coordinate;title:string;targetLabel:string;action:React.ReactNode;initialPlan?:RoutePlan|null;devicePosition?:Coordinate;deviceRevision?:number}){
 const {state}=useApp();const t=useText();const {colors}=useTheme();const ar=state.language==='ar';
 const [plan,setPlan]=useState<RoutePlan|null>(null),[gpsLost,setGpsLost]=useState(true),[accuracy,setAccuracy]=useState<number|null>(null),[position,setPosition]=useState<Coordinate|null>(devicePosition??null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[busyStage,setBusyStage]=useState<'location'|'route'>('location'),[elapsed,setElapsed]=useState(0),[enabled,setEnabled]=useState(true),[follow,setFollow]=useState(true),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0),[revision,setRevision]=useState(0);
 const shared=useRef(devicePosition);shared.current=devicePosition;const wake=useRef<(()=>void)|null>(null),needsFix=useRef(false);
 const latest=useRef<RoutePlan|null>(null);const lat=to.latitude,lng=to.longitude;
 useEffect(()=>{
  const known=shared.current;if(known){const display=sharedNavigationDisplay(known);setPosition(known);setAccuracy(display.accuracy);setGpsLost(!display.guidanceReady)}else setGpsLost(true);
  if(!enabled){setBusy(false);return}latest.current=null;setPlan(null);setError('');
  let alive=true,running=false,nativeVisible:boolean|null=null,visible=Platform.OS!=='web'||document.visibilityState!=='hidden';
  let timer:ReturnType<typeof setTimeout>|undefined,inflight:AbortController|null=null,lastRouteAt=0,offRouteCount=0,reroutes=0;
  async function tick(ask=false){
   if(!alive||!visible||running)return;clearTimeout(timer);needsFix.current=false;running=true;const controller=new AbortController();inflight=controller;let gpsFailed=false,phase:'location'|'route'='location';setError(previous=>['permission','accuracy','services','timeout','position'].includes(previous)?'':previous);setBusyStage('location');setBusy(!latest.current);
   try{
    const measurement:{fix:Awaited<ReturnType<typeof navigationPosition>>|null}={fix:null};
    const point=await positionDeadline(async signal=>{measurement.fix=await navigationPosition(ask,signal);return measurement.fix},controller,22000);
    const measured=measurement.fix;
    if(!alive||controller.signal.aborted)return;
    setGpsLost(!navigationGuidanceReady(measured));setAccuracy(measured?.accuracy??null);setPosition(point);setBusy(false);setRevision(value=>value+1);setError(previous=>['permission','accuracy','services','timeout','position'].includes(previous)?'':previous);
    if(!latest.current&&initialPlan&&distanceMeters(point,initialPlan.from)<=100&&distanceMeters({latitude:lat,longitude:lng},initialPlan.to)<=10){latest.current=initialPlan;setPlan(initialPlan)}
    const existing=latest.current;const progress=existing?navigationProgress(existing,point):null;
    offRouteCount=progress&&progress.offRouteMeters>100?offRouteCount+1:0;
    if(!existing&&(!lastRouteAt||Date.now()-lastRouteAt>=60000)||offRouteCount>=2&&reroutes<2&&Date.now()-lastRouteAt>=60000){
     lastRouteAt=Date.now();phase='route';setError('');setBusyStage('route');setBusy(true);if(existing)reroutes++;
     const token=await cloudCurrentToken();
     const next=await routeScheduler.run(()=>createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route').route(point,{latitude:lat,longitude:lng},controller.signal,state.language,token),controller.signal);
     if(alive&&!controller.signal.aborted){latest.current=next;setPlan(next);offRouteCount=0}
    }
   }catch(e){const code=(e as {code?:string;kind?:string}).code??(e as {kind?:string}).kind??(phase==='location'?'position':'network');if(alive&&visible&&(!controller.signal.aborted||code==='timeout')){setError(code);if(['permission','accuracy','services','timeout','position'].includes(code)){gpsFailed=true;needsFix.current=true;setGpsLost(true)}}}
   finally{running=false;if(alive){setBusy(false);if(visible&&!gpsFailed)timer=setTimeout(()=>void tick(),10000)}}
  }
  const pause=()=>{clearTimeout(timer);inflight?.abort()};
  const resume=()=>{const next=nativeVisible??(document.visibilityState!=='hidden');visible=next;if(next){clearTimeout(timer);void tick()}else pause()};
  const native=(event:Event)=>{const active=(event as CustomEvent).detail?.active;if(typeof active==='boolean'){nativeVisible=active;resume()}};
  if(Platform.OS==='web'){document.addEventListener('visibilitychange',resume);window.addEventListener('yalla:native-visibility',native)}
  const receive=()=>void tick();wake.current=receive;void tick(attempt>0);
  return()=>{alive=false;if(wake.current===receive)wake.current=null;pause();if(Platform.OS==='web'){document.removeEventListener('visibilitychange',resume);window.removeEventListener('yalla:native-visibility',native)}};
 },[lat,lng,state.language,enabled,attempt,initialPlan]);
 useEffect(()=>{if(!devicePosition)return;const display=sharedNavigationDisplay(devicePosition);setPosition(devicePosition);setAccuracy(display.accuracy);setGpsLost(!display.guidanceReady);if(needsFix.current&&display.accuracy!==null)wake.current?.()},[devicePosition,deviceRevision]);
 useEffect(()=>{setElapsed(0);if(!busy)return;const started=Date.now();const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer)},[busy,busyStage]);
 useEffect(()=>{if(!expanded||Platform.OS!=='web')return;const back=(event:Event)=>{event.preventDefault();setExpanded(false)};window.addEventListener('yalla:native-back',back);return()=>window.removeEventListener('yalla:native-back',back)},[expanded]);
 const progress=plan&&position?navigationProgress(plan,position):null;
 const offRoute=progress&&progress.offRouteMeters>100;
 const map=(height:number)=><View style={{height,borderRadius:16,overflow:'hidden'}}><MapCanvas compact readOnly minMapHeight={height} point={plan?.from??position} route={plan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/></View>;
 const instruction=<View style={{padding:14,borderRadius:14,backgroundColor:colors.selected,gap:6}}><Label display>{gpsLost?(!enabled?t('المتابعة متوقفة مؤقتًا','Navigation is paused'):error?t('تعذر تحديث الملاحة','Navigation could not update'):position?t('بانتظار موقع أدق','Waiting for better GPS'):t('جارٍ قراءة موقع الهاتف','Reading phone location')):error&&!plan?t('تعذر حساب الطريق','Could not find the route'):progress?.arrived?t('اقتربت من نقطة الوصول','You are near the destination'):offRoute?t('أنت خارج المسار المعروض','You are off the shown route'):progress?.instruction||t('نجهّز الطريق إلى وجهتك…','Finding the route to your destination…')}</Label>{progress?.nextInstruction&&!gpsLost&&!offRoute&&!progress.arrived&&<Label>{t('بعد ','In ')}{formatDistance(progress.nextTurnMeters,ar)}: {progress.nextInstruction}</Label>}{progress&&!gpsLost&&!offRoute&&<Label large>{formatDistance(progress.remainingMeters,ar)} · {Math.max(1,Math.ceil(progress.remainingSeconds/60))} {t('دقيقة تقريبًا','min, estimated')}</Label>}</View>;
 return <Panel><Label>{title}</Label>{instruction}{action}
  <Label>{targetLabel}</Label>
  {!expanded&&map(290)}
  {busy&&<View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator color={colors.purple}/><Label muted>{busyStage==='location'?t('جارٍ قراءة موقع الهاتف…','Reading phone location…'):t('جارٍ حساب الطريق…','Finding the route…')} {elapsed} {t('ث','s')}</Label></View>}
  {accuracy!==null&&<Label muted>{t('دقة آخر قراءة: نحو ','Last location accuracy: about ')}{Math.ceil(accuracy)} {t('متر','m')}{gpsLost&&position?t(' — نعرض الموقع والطريق، وتبقى تعليمات الانعطاف متوقفة حتى تتحسن الدقة.',' — the map is visible; turn directions wait for better accuracy.'):''}</Label>}
  {!!error&&<View accessibilityRole="alert" style={{gap:8}}><Label muted>{error==='permission'?t('لم يُمنح إذن الموقع. اسمح بالموقع أثناء استخدام التطبيق.','Allow location while using the app.'):error==='accuracy'?t('لم تصل قراءة موقع بدقة كافية. تحقق من الموقع الدقيق وتحسين دقة الموقع في الهاتف.','No location with enough accuracy arrived. Check precise location and location accuracy on your phone.'):error==='services'?t('خدمة الموقع في الهاتف متوقفة. شغّلها ثم أعد المحاولة.','Phone location is off. Turn it on and retry.'):error==='timeout'?t('لم يرسل الهاتف موقعًا خلال المهلة. توقفت المحاولة؛ اضغط تحديث الموقع والطريق للمحاولة مجددًا.','No location arrived in time. This attempt stopped. Tap Update location and route to retry.'):error==='unauthorized'||error==='login_required'?t('تعذر التحقق من جلسة الحساب. افتح حسابي وسجّل الدخول مجددًا.','Could not check your session. Open My account and sign in again.'):error==='no_route'?t('لم تعثر Google على طريق قيادة إلى هذه النقطة.','Google found no driving route to this point.'):error==='network'?t('وصل موقع الهاتف، لكن تعذر تحميل الطريق. تحقق من الاتصال وأعد المحاولة.','Phone location arrived, but the route could not load. Check internet and retry.'):error==='busy'?t('بلغت خدمة الطريق حد المحاولات. يبقى المسار السابق ظاهرًا ويمكنك المحاولة لاحقًا.','The route limit was reached. The previous route stays visible. Try later.'):t('تعذر قراءة الموقع أو حساب الطريق. افتح حالة الموقع للتحقق من السبب.','Could not read location or find the route. Check location status for details.')}</Label><Button secondary title={t('حالة الموقع والأذونات','Location status and permissions')} onPress={()=>{setExpanded(false);router.push('/settings')}}/>{isNativeWebView()&&<Button secondary title={t('فتح أذونات موقع التطبيق','Open app location permissions')} onPress={()=>void nativeAction('location-settings').catch(()=>setError('permission'))}/>}</View>}
  {offRoute&&<Label muted>{t('نعيد حساب الطريق عند توفر موقع دقيق. يمكنك طلب التحديث يدويًا.','The route updates with an accurate location. You can also update it now.')}</Label>}
  <View style={{gap:8}}><Button icon="expand-outline" title={t('تكبير الملاحة داخل التطبيق','Full-screen navigation')} onPress={()=>setExpanded(true)}/><Button secondary icon="locate" title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button secondary title={t('تحديث الموقع والطريق','Update location and route')} onPress={()=>{setEnabled(true);setAttempt(value=>value+1)}}/><Button secondary title={enabled?t('إيقاف المتابعة مؤقتًا','Pause navigation'):t('استئناف الملاحة','Resume navigation')} onPress={()=>setEnabled(value=>!value)}/></View>
  <Label muted>Google Maps · {t('المتابعة أثناء فتح التطبيق','Navigation while the app is open')}</Label>
  <Modal visible={expanded} animationType="none" onRequestClose={()=>setExpanded(false)}><View style={{flex:1,padding:16,paddingTop:32,backgroundColor:colors.background,gap:12}}>{instruction}{action}<View style={{flex:1,minHeight:200}}><MapCanvas compact readOnly minMapHeight={200} point={plan?.from??position} route={plan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/></View>{!!error&&<Label muted>{t('تعذر تحديث الموقع أو الطريق. ارجع للوحة الملاحة لإعادة المحاولة.','Could not update location or route. Return to navigation to retry.')}</Label>}<Button secondary title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button title={t('العودة إلى الطلب','Back to the ride')} onPress={()=>setExpanded(false)}/></View></Modal>
 </Panel>;
}
