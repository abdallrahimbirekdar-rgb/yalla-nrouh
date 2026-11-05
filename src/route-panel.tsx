import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Linking,View} from 'react-native';
import {router} from 'expo-router';
import {useAuth} from './auth';
import {cloudCurrentToken} from './cloud-api';
import {siteCurrentPosition} from './site-bridge';
import {type Coordinate} from './geo';
import {googleDirections} from './google-links';
import {createRoutingClient,type FareQuote,type RoutePlan} from './routing';
import {ServiceError} from './api';
import {priceForRoute} from './meter';
import {useApp} from './context';
import MapCanvas from './map/MapCanvas';
import {Button,Icon,Label,Panel,useText,useTheme} from './ui';
export default function RoutePanel({from,to,fromAddress,toAddress,currentLocation=false,estimate=false,autoEstimate=false,title,onQuote}:{from?:Coordinate;to?:Coordinate;fromAddress?:string;toAddress?:string;currentLocation?:boolean;estimate?:boolean;autoEstimate?:boolean;title:string;onQuote?:(quote:FareQuote|null)=>void}){
 const auth=useAuth();const userId=auth.session?.user.id;const {state}=useApp();const t=useText();const {colors}=useTheme();const [plan,setPlan]=useState<RoutePlan|null>(null),[quotedFare,setQuotedFare]=useState<number|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
 const alive=useRef(true),generation=useRef(0),running=useRef(false),abort=useRef<AbortController|null>(null),lastAuto=useRef('');const quoteCallback=useRef(onQuote);quoteCallback.current=onQuote;
 const key=[from?.latitude,from?.longitude,to?.latitude,to?.longitude,currentLocation,auth.session?.user.id].join('|');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort()}},[]);
 useEffect(()=>{generation.current++;abort.current?.abort();running.current=false;setBusy(false);setPlan(null);setQuotedFare(null);setError('');quoteCallback.current?.(null)},[key]);
 async function calculate(){
  if(running.current||!to||(!from&&!currentLocation))return;if(!auth.session){setError('unauthorized');return}
  const id=++generation.current;const active=()=>alive.current&&id===generation.current;running.current=true;setBusy(true);setError('');setPlan(null);setQuotedFare(null);quoteCallback.current?.(null);abort.current?.abort();const controller=new AbortController();abort.current=controller;
  try{
   const token=await cloudCurrentToken();const start=currentLocation?await siteCurrentPosition(false):from;if(!start||!active())return;
   const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
   if(onQuote){
    const {plan:next,quote}=await client.quote(start,to,controller.signal,state.language,token,auth.admin);
    if(active()){setPlan(next);setQuotedFare(quote.fare);quoteCallback.current?.(quote)}
   }else{
    const next=await client.route(start,to,controller.signal,state.language,token,auth.admin);
    if(active())setPlan(next);
   }
  }catch(e){if(active())setError(e instanceof ServiceError?e.code:(e as {status?:number})?.status===401?'unauthorized':'network')}
  finally{if(active()){running.current=false;setBusy(false)}}
 }
 const action=useRef(calculate);action.current=calculate;
 useEffect(()=>{if(!autoEstimate||!auth.ready||!userId||!from||!to||lastAuto.current===key)return;lastAuto.current=key;void action.current()},[autoEstimate,auth.ready,userId,key,from,to]);
 async function navigate(){try{const end=to??toAddress;if(end)await Linking.openURL(googleDirections(end,currentLocation?undefined:from??fromAddress,currentLocation))}catch{setError('navigation')}}
 const price=quotedFare??(plan?priceForRoute(plan.meters,plan.seconds/60,plan.tariff??state.tariff):null);
 const message=error==='unauthorized'?t('سجّل الدخول مجددًا لحساب الأجرة.','Sign in again to check the fare.'):error==='busy'?t('تم بلوغ حد المحاولات أو أُعيد الطلب بسرعة. انتظر قليلًا قبل المحاولة.','Too many requests. Wait before trying again.'):error==='no_route'?t('لم تعثر Google على طريق قيادة بين النقطتين. جرّب تعديل النقاط.','Google found no driving route. Try changing the points.'):error==='not_configured'||error==='not_enabled'?t('خدمة حساب الطريق غير متاحة الآن. أعد المحاولة لاحقًا.','The route service is not available. Try later.'):t('تعذر حساب الطريق. تحقق من الاتصال وأعد المحاولة.','Could not find the route. Check internet and try again.');
 return <Panel><Label large>{title}</Label>
  {busy&&<View style={{gap:8,alignItems:'center',padding:16}}><ActivityIndicator color={colors.purple}/><Label muted>{t('نحسب الطريق والأجرة عبر Google Maps…','Finding route and fare with Google Maps…')}</Label></View>}
  {plan&&<>
   {estimate&&price!==null&&<View style={{padding:16,borderRadius:14,backgroundColor:colors.selected,alignItems:'center',gap:4}}><Label muted>{t('الأجرة التقديرية','Estimated fare')}</Label><Label large>{price.toLocaleString('en-US')} {t('ل.س','SYP')}</Label></View>}
   <View style={{flexDirection:'row',justifyContent:'space-around',gap:16}}><View style={{gap:4,alignItems:'center'}}><Icon name="map-outline"/><Label>{(plan.meters/1000).toFixed(2)} {t('كم','km')}</Label></View><View style={{gap:4,alignItems:'center'}}><Icon name="time-outline"/><Label>{Math.ceil(plan.seconds/60)} {t('دقيقة','min')}</Label></View></View>
   <MapCanvas point={plan.from} route={plan.points} readOnly onChange={()=>{}}/>
   {estimate&&<Label muted>{t('الأجرة = (فتح العداد + المسافة × سعر الكيلومتر + الوقت × سعر الدقيقة) × معامل الذروة. تستخدم تسعيرة الإدارة المشتركة.','Fare = (base + distance × km price + time × minute price) × peak factor. Uses shared admin rates.')}</Label>}
   <Button secondary title={t(expanded?'إخفاء تعليمات الطريق':'تعليمات الطريق',expanded?'Hide route steps':'Route steps')} onPress={()=>setExpanded(!expanded)}/>
   {expanded&&plan.steps.map((step,index)=><Label key={index}>{index+1}. {step.instruction}</Label>)}
   <Label muted>Google Maps</Label>
  </>}
  {!!error&&<View accessibilityRole="alert"><Label>{message}</Label></View>}
  {!auth.session?<Button icon="log-in-outline" title={t('تسجيل الدخول','Sign in')} onPress={()=>router.push({pathname:'/account',params:{next:'review'}})}/>:<Button secondary={Boolean(plan)} disabled={busy||!to||!from&&!currentLocation} title={plan?t('إعادة حساب الطريق والأجرة','Update route and fare'):estimate?t('حساب قيمة الأجرة','Calculate fare'):t('حساب الطريق','Find route')} onPress={()=>void calculate()}/>}
  <Button secondary icon="navigate-outline" disabled={!to&&!toAddress} title={t('فتح الملاحة في Google Maps','Open directions in Google Maps')} onPress={()=>void navigate()}/>
 </Panel>;
}
