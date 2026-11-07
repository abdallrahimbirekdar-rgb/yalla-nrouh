import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {router} from 'expo-router';
import {useAuth} from './auth';
import {cloudCurrentToken,cloudReportRouteProblem} from './cloud-api';
import {siteCurrentPosition} from './site-bridge';
import {type Coordinate} from './geo';
import {createRoutingClient,type FareQuote,type RoutePlan} from './routing';
import {ServiceError} from './api';
import {priceForRoute} from './meter';
import {useApp} from './context';
import MapCanvas from './map/MapCanvas';
import {PassengerFare} from './passenger-trip-summary';
import {Button,Icon,Label,Panel,useText,useTheme} from './ui';
export default function RoutePanel({from,to,currentLocation=false,estimate=false,autoEstimate=false,title,onQuote,children}:{from?:Coordinate;to?:Coordinate;currentLocation?:boolean;estimate?:boolean;autoEstimate?:boolean;title:string;onQuote?:(quote:FareQuote|null)=>void;children?:React.ReactNode}){
 const auth=useAuth();const userId=auth.session?.user.id;const {state}=useApp();const t=useText();const {colors}=useTheme();const [plan,setPlan]=useState<RoutePlan|null>(null),[quotedFare,setQuotedFare]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
 const alive=useRef(true),generation=useRef(0),running=useRef(false),abort=useRef<AbortController|null>(null),lastAuto=useRef('');const quoteCallback=useRef(onQuote);quoteCallback.current=onQuote;
 const key=[from?.latitude,from?.longitude,to?.latitude,to?.longitude,currentLocation,auth.session?.user.id].join('|');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort()}},[]);
 useEffect(()=>{generation.current++;abort.current?.abort();running.current=false;setBusy(false);setPlan(null);setQuotedFare(null);setError('');quoteCallback.current?.(null)},[key]);
 async function calculate(){
  if(running.current||!to||(!from&&!currentLocation))return;if(!auth.session){setError('unauthorized');return}
  const id=++generation.current;const active=()=>alive.current&&id===generation.current;running.current=true;setBusy(true);setError('');setPlan(null);setQuotedFare(null);quoteCallback.current?.(null);abort.current?.abort();const controller=new AbortController();abort.current=controller;
  let token:string|undefined;
  try{
   token=await cloudCurrentToken();const start=currentLocation?await siteCurrentPosition(false):from;if(!start||!active())return;
   const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
   if(onQuote){
    const {plan:next,quote}=await client.quote(start,to,controller.signal,state.language,token,auth.admin);
    if(active()){setPlan(next);setQuotedFare(quote.fare);quoteCallback.current?.(quote)}
   }else{
    const next=await client.route(start,to,controller.signal,state.language,token,auth.admin);
    if(active())setPlan(next);
   }
  }catch(e){
   if(active()&&!controller.signal.aborted){
    const code=e instanceof ServiceError?e.code:(e as {status?:number})?.status===401?'unauthorized':'network';
    setError(code);
    if(token&&code!=='unauthorized')void cloudReportRouteProblem(token,code).catch(()=>{});
   }
  }
  finally{if(active()){running.current=false;setBusy(false)}}
 }
 const action=useRef(calculate);action.current=calculate;
 useEffect(()=>{if(!autoEstimate||!auth.ready||!userId||!from||!to||lastAuto.current===key)return;lastAuto.current=key;void action.current()},[autoEstimate,auth.ready,userId,key,from,to]);
 const price=quotedFare??(plan?priceForRoute(plan.meters,plan.seconds/60,plan.tariff??state.tariff):null);
 const message=error==='unauthorized'?t('سجّل الدخول مجددًا لحساب الأجرة.','Sign in again to check the fare.'):error==='busy'?t('تم بلوغ حد المحاولات أو أُعيد الطلب بسرعة. انتظر قليلًا قبل المحاولة.','Too many requests. Wait before trying again.'):error==='no_route'?t('لم تعثر Google على طريق قيادة بين النقطتين. جرّب تعديل النقاط.','Google found no driving route. Try changing the points.'):error==='not_configured'||error==='not_enabled'?t('خدمة حساب الطريق غير متاحة الآن. أعد المحاولة لاحقًا.','The route service is not available. Try later.'):t('تعذر حساب الطريق. تحقق من الاتصال وأعد المحاولة.','Could not find the route. Check internet and try again.');
 return <Panel outlined>
  {estimate?<PassengerFare fare={price} pending={busy||autoEstimate&&!plan&&!error}/>:<Label>{title}</Label>}
  {!estimate&&busy&&<View style={{flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'}}><ActivityIndicator color={colors.purple}/><Label muted>{t('جارٍ حساب المسار…','Calculating route…')}</Label></View>}
  {plan&&<View style={{flexDirection:'row',justifyContent:'center',gap:22}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Icon name="map-outline" size={17}/><Label>{(plan.meters/1000).toFixed(2)} {t('كم','km')}</Label></View>
   <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Icon name="time-outline" size={17}/><Label>{Math.ceil(plan.seconds/60)} {t('دقيقة','min')}</Label></View>
  </View>}
  {children}
  {!!error&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
  {plan&&<Button secondary icon={expanded?'chevron-up':'map-outline'} title={expanded?t('إخفاء خريطة المسار','Hide route map'):t('عرض خريطة المسار','Show route map')} onPress={()=>setExpanded(value=>!value)}/>}
  {plan&&expanded&&<>
   <MapCanvas point={plan.from} route={plan.points} readOnly onChange={()=>{}}/>
   <Label muted>Google Maps</Label>
  </>}
  {!auth.session?<Button icon="log-in-outline" title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push({pathname:'/account',params:{next:'review'}})}/>:(!busy&&!plan||expanded)&&<Button secondary disabled={busy||!to||!from&&!currentLocation} title={plan?t('إعادة حساب الطريق والأجرة','Update route and fare'):estimate?t('إعادة حساب الأجرة','Recalculate fare'):t('حساب الطريق','Find route')} onPress={()=>void calculate()}/>}
 </Panel>;
}
