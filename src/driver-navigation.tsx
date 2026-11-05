import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Platform,View} from 'react-native';
import {useApp} from './context';
import {cloudCurrentToken} from './cloud-api';
import {siteCurrentFix,isNativeWebView} from './site-bridge';
import {getWebPosition} from './web-position';
import {positionDeadline} from './position-deadline';
import {createRoutingClient,type RoutePlan} from './routing';
import {routeScheduler} from './route-scheduler';
import {distanceMeters,navigationProgress} from './navigation-progress';
import type {Coordinate} from './geo';
import type {Fix} from './meter';
import MapCanvas from './map/MapCanvas';
import {Button,Icon,Label,Panel,useText,useTheme} from './ui';
const accurateFix:(ask:boolean,signal?:AbortSignal)=>Promise<Fix>=siteCurrentFix;
const formatDistance=(meters:number,ar:boolean)=>meters<1000?Math.round(meters/10)*10+' '+(ar?'م':'m'):(meters/1000).toFixed(1)+' '+(ar?'كم':'km');
export default function DriverNavigation({to,title,initialPlan}:{to:Coordinate;title:string;initialPlan?:RoutePlan|null}){
 const {state}=useApp();const t=useText();const {colors}=useTheme();const ar=state.language==='ar';
 const [plan,setPlan]=useState<RoutePlan|null>(null),[gpsLost,setGpsLost]=useState(true),[position,setPosition]=useState<Coordinate|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(true),[follow,setFollow]=useState(true),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0),[revision,setRevision]=useState(0);
 const latest=useRef<RoutePlan|null>(null);const lat=to.latitude,lng=to.longitude;
 useEffect(()=>{
  setGpsLost(true);if(!enabled){setBusy(false);return}latest.current=null;setPlan(null);setPosition(null);setError('');
  let alive=true,running=false,nativeVisible:boolean|null=null,visible=Platform.OS!=='web'||document.visibilityState!=='hidden';
  let timer:ReturnType<typeof setTimeout>|undefined,inflight:AbortController|null=null,lastRouteAt=0,offRouteCount=0,reroutes=0;
  async function tick(ask=false){
   if(!alive||!visible||running)return;running=true;const controller=new AbortController();inflight=controller;setBusy(!latest.current);
   try{
    const point=await positionDeadline(signal=>isNativeWebView()?accurateFix(ask,signal):getWebPosition(12000,50,true),controller,22000);
    if(!alive||controller.signal.aborted)return;
    setGpsLost(false);setPosition(point);setRevision(value=>value+1);setError(previous=>['permission','accuracy','services','timeout','position'].includes(previous)?'':previous);
    if(!latest.current&&initialPlan&&distanceMeters(point,initialPlan.from)<=100&&distanceMeters({latitude:lat,longitude:lng},initialPlan.to)<=10){latest.current=initialPlan;setPlan(initialPlan)}
    const existing=latest.current;const progress=existing?navigationProgress(existing,point):null;
    offRouteCount=progress&&progress.offRouteMeters>100?offRouteCount+1:0;
    if(!existing&&(!lastRouteAt||Date.now()-lastRouteAt>=60000)||offRouteCount>=2&&reroutes<2&&Date.now()-lastRouteAt>=60000){
     lastRouteAt=Date.now();setError('');if(existing)reroutes++;
     const token=await cloudCurrentToken();
     const next=await routeScheduler.run(()=>createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route').route(point,{latitude:lat,longitude:lng},controller.signal,state.language,token),controller.signal);
     if(alive&&!controller.signal.aborted){latest.current=next;setPlan(next);offRouteCount=0}
    }
   }catch(e){const code=(e as {code?:string}).code??'position';if(alive&&visible&&(!controller.signal.aborted||code==='timeout')){setError(code);if(['permission','accuracy','services','timeout','position'].includes(code))setGpsLost(true)}}
   finally{running=false;if(alive){setBusy(false);if(visible)timer=setTimeout(()=>void tick(),10000)}}
  }
  const pause=()=>{clearTimeout(timer);inflight?.abort()};
  const resume=()=>{const next=nativeVisible??(document.visibilityState!=='hidden');visible=next;if(next){clearTimeout(timer);void tick()}else pause()};
  const native=(event:Event)=>{const active=(event as CustomEvent).detail?.active;if(typeof active==='boolean'){nativeVisible=active;resume()}};
  if(Platform.OS==='web'){document.addEventListener('visibilitychange',resume);window.addEventListener('yalla:native-visibility',native)}
  void tick(attempt>0);
  return()=>{alive=false;pause();if(Platform.OS==='web'){document.removeEventListener('visibilitychange',resume);window.removeEventListener('yalla:native-visibility',native)}};
 },[lat,lng,state.language,enabled,attempt,initialPlan]);
 useEffect(()=>{if(!expanded||Platform.OS!=='web')return;const back=(event:Event)=>{event.preventDefault();setExpanded(false)};window.addEventListener('yalla:native-back',back);return()=>window.removeEventListener('yalla:native-back',back)},[expanded]);
 const progress=plan&&position?navigationProgress(plan,position):null;
 const offRoute=progress&&progress.offRouteMeters>100;
 const map=(height:number)=><View style={{height,borderRadius:16,overflow:'hidden'}}><MapCanvas compact readOnly minMapHeight={height} point={plan?.from??position} route={plan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/></View>;
 const instruction=<View style={{padding:14,borderRadius:14,backgroundColor:colors.selected,gap:6}}><Icon name={progress?.arrived?'flag-outline':'navigate-outline'} color={colors.purple}/><Label large>{gpsLost?t(enabled?'بانتظار موقع دقيق من الهاتف':'المتابعة متوقفة مؤقتًا',enabled?'Waiting for accurate phone location':'Navigation is paused'):progress?.arrived?t('اقتربت من نقطة الوصول','You are near the destination'):offRoute?t('أنت خارج المسار المعروض','You are off the shown route'):progress?.instruction||t('نجهّز الطريق إلى وجهتك…','Finding the route to your destination…')}</Label>{progress?.nextInstruction&&!gpsLost&&!offRoute&&!progress.arrived&&<Label>{t('بعد ','In ')}{formatDistance(progress.nextTurnMeters,ar)}: {progress.nextInstruction}</Label>}{progress&&!gpsLost&&!offRoute&&<Label muted>{formatDistance(progress.remainingMeters,ar)} · {Math.max(1,Math.ceil(progress.remainingSeconds/60))} {t('دقيقة تقريبًا','min, estimated')}</Label>}</View>;
 return <Panel><Label large>{title}</Label>{instruction}
  {!expanded&&map(340)}
  {busy&&<View style={{flexDirection:'row',gap:8,alignItems:'center'}}><ActivityIndicator color={colors.purple}/><Label muted>{t('جارٍ تحديد الموقع وحساب الطريق…','Finding location and route…')}</Label></View>}
  {!!error&&<Label muted>{error==='busy'?t('بلغت خدمة الطريق حد المحاولات. يبقى المسار السابق ظاهرًا ويمكنك المحاولة لاحقًا.','The route limit was reached. The previous route stays visible. Try later.'):t('تعذر تحديث الموقع أو الطريق. لن نغيّر التعليمات اعتمادًا على موقع غير دقيق.','Could not update location or route. Directions need an accurate location.')}</Label>}
  {offRoute&&<Label muted>{t('نعيد حساب الطريق عند توفر موقع دقيق. يمكنك طلب التحديث يدويًا.','The route updates with an accurate location. You can also update it now.')}</Label>}
  <View style={{gap:8}}><Button icon="expand-outline" title={t('تكبير الملاحة داخل التطبيق','Full-screen navigation')} onPress={()=>setExpanded(true)}/><Button secondary icon="locate" title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button secondary title={t('تحديث الموقع والطريق','Update location and route')} onPress={()=>{setEnabled(true);setAttempt(value=>value+1)}}/><Button secondary title={enabled?t('إيقاف المتابعة مؤقتًا','Pause navigation'):t('استئناف الملاحة','Resume navigation')} onPress={()=>setEnabled(value=>!value)}/></View>
  <Label muted>Google Maps · {t('المتابعة أثناء فتح التطبيق','Navigation while the app is open')}</Label>
  <Modal visible={expanded} animationType="none" onRequestClose={()=>setExpanded(false)}><View style={{flex:1,padding:16,paddingTop:32,backgroundColor:colors.background,gap:12}}>{instruction}<View style={{flex:1,minHeight:200}}><MapCanvas compact readOnly minMapHeight={200} point={plan?.from??position} route={plan?.points} cameraTarget={position?{point:position,revision,isLocation:true,zoom:17,overview:!follow}:undefined} onChange={()=>{}}/></View>{!!error&&<Label muted>{t('تعذر تحديث الموقع أو الطريق. ارجع للوحة الملاحة لإعادة المحاولة.','Could not update location or route. Return to navigation to retry.')}</Label>}<Button secondary title={follow?t('عرض المسار كاملًا','Show the full route'):t('متابعة موقعي','Follow my location')} onPress={()=>setFollow(value=>!value)}/><Button title={t('العودة إلى الطلب','Back to the ride')} onPress={()=>setExpanded(false)}/></View></Modal>
 </Panel>;
}
