import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {cloudCurrentToken,cloudDriverRidePreview,type RidePreview} from './cloud-api';
import {createRoutingClient,type RoutePlan} from './routing';
import {ServiceError} from './api';
import {routeScheduler} from './route-scheduler';
import {offerRouteCache} from './offer-route-cache';
import {distanceMeters,navigationProgress} from './navigation-progress';
import type {Coordinate} from './geo';
import {priceForRoute} from './meter';
import {categories,regions} from './domain';
import {useApp} from './context';
import {useAuth} from './auth';
import MapCanvas from './map/MapCanvas';
import {Button,Icon,Label,Panel,useText,useTheme} from './ui';
export default function DriverOffer({offer,position,disabled,onAccept}:{offer:RidePreview;position?:Coordinate;disabled:boolean;onAccept:(routes:{trip:RoutePlan|null;pickup:RoutePlan|null})=>void}){
 const {state}=useApp();const auth=useAuth();const t=useText();const {colors}=useTheme();
 const [plan,setPlan]=useState<RoutePlan|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [pickupPlan,setPickupPlan]=useState<RoutePlan|null>(null),[pickupBusy,setPickupBusy]=useState(false),[pickupError,setPickupError]=useState(''),[pickupAttempt,setPickupAttempt]=useState(0);
 const currentPosition=useRef(position);currentPosition.current=position;
 const id=offer.ride_id,owner=auth.session?.user.id;
 useEffect(()=>{let live=true;const controller=new AbortController();setBusy(true);setError('');setPlan(null);setPickupPlan(null);
  void (async()=>{const token=await cloudCurrentToken();const row=await cloudDriverRidePreview(token,id);if(!live)return;
   const from={latitude:row.pickup_lat,longitude:row.pickup_lng},to={latitude:row.destination_lat,longitude:row.destination_lng};
   // Always recheck server visibility before reusing a summary.
   const key=JSON.stringify([owner,id,state.language]);
   const cached=attempt===0?offerRouteCache.get(key,from,to):null;
   if(cached){setPlan(cached.trip);setPickupPlan(cached.pickup);return}
   const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
   const driver=currentPosition.current;
   const tripOnly=async()=>({trip:await routeScheduler.run(()=>client.route(from,to,controller.signal,state.language,token),controller.signal),pickup:null});
   const next=driver
    ? await routeScheduler.run(()=>client.driverOffer(driver,from,to,controller.signal,state.language,token),controller.signal).catch(error=>{
      if(!(error instanceof ServiceError)||!['response','no_route'].includes(error.code))throw error;
      return tripOnly();
     })
    : await tripOnly();
   if(live){offerRouteCache.set(key,next);setPlan(next.trip);setPickupPlan(next.pickup)}
  })().catch(e=>{if(live)setError((e as {code?:string;kind?:string}).code??(e as {kind?:string}).kind??'network')}).finally(()=>{if(live)setBusy(false)});
  return()=>{live=false;controller.abort()};
 },[id,owner,state.language,attempt]);
 const originLat=position?.latitude,originLng=position?.longitude;
 const pickupLat=plan?.from.latitude,pickupLng=plan?.from.longitude;
 useEffect(()=>{setPickupError('');setPickupBusy(false);if(originLat===undefined||originLng===undefined||pickupLat===undefined||pickupLng===undefined)return;
  if(pickupPlan&&distanceMeters(pickupPlan.from,{latitude:originLat,longitude:originLng})<100&&distanceMeters(pickupPlan.to,{latitude:pickupLat,longitude:pickupLng})<1&&pickupAttempt===0)return;let live=true;const controller=new AbortController();setPickupBusy(true);
  void cloudCurrentToken().then(token=>routeScheduler.run(()=>createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route').route({latitude:originLat,longitude:originLng},{latitude:pickupLat,longitude:pickupLng},controller.signal,state.language,token),controller.signal)).then(next=>{if(live){setPickupBusy(false);setPickupAttempt(0);setPickupPlan(next);if(plan)offerRouteCache.set(JSON.stringify([owner,id,state.language]),{trip:plan,pickup:next})}}).catch(()=>{if(live)setPickupError(state.language==='ar'?'تعذر حساب طريق الوصول إلى الراكب.':'Could not find the driving route to pickup.')}).finally(()=>{if(live)setPickupBusy(false)});
  return()=>{live=false;controller.abort()};
 },[originLat,originLng,pickupLat,pickupLng,state.language,pickupAttempt,pickupPlan,plan,owner,id]);
 const fare=plan?priceForRoute(plan.meters,plan.seconds/60,plan.tariff??null):null;
 const approach=pickupPlan&&position?navigationProgress(pickupPlan,position):null;
 const away=pickupPlan?(approach&&approach.offRouteMeters<=100?approach.remainingMeters:pickupPlan.meters):null;
 return <Panel><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Label large>{t('طلب رحلة','Ride request')}</Label><Icon name="car-sport-outline" color={colors.purple}/></View>
  <Label muted>{regions[offer.region]?.[state.language==='ar'?0:1]} · {categories.find(c=>c.id===offer.category)?.[state.language]??offer.category}</Label>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   <View style={{flex:1,minWidth:120,padding:12,backgroundColor:colors.selected,borderRadius:12,gap:4}}><Label muted>{t('طريقك إلى الانطلاق','Driving distance to pickup')}</Label><Label>{pickupBusy?t('جارٍ الحساب…','Calculating…'):away===null?'—':(away/1000).toFixed(1)+' '+t('كم','km')}</Label>{pickupPlan&&<Label muted>{Math.ceil((approach?.remainingSeconds??pickupPlan.seconds)/60)} {t('دقيقة تقريبًا','min, estimated')}</Label>}</View>
   <View style={{flex:1,minWidth:120,padding:12,backgroundColor:colors.selected,borderRadius:12,gap:4}}><Label muted>{t('الأجرة التقديرية','Estimated fare')}</Label><Label>{fare===null?'—':fare.toLocaleString('en-US')+' '+t('ل.س','SYP')}</Label></View>
   <View style={{flex:1,minWidth:120,padding:12,backgroundColor:colors.selected,borderRadius:12,gap:4}}><Label muted>{t('مسافة الرحلة','Trip distance')}</Label><Label>{plan?(plan.meters/1000).toFixed(1)+' '+t('كم','km'):'—'}</Label></View>
   <View style={{flex:1,minWidth:120,padding:12,backgroundColor:colors.selected,borderRadius:12,gap:4}}><Label muted>{t('مدة الرحلة','Trip time')}</Label><Label>{plan?Math.ceil(plan.seconds/60)+' '+t('دقيقة','min'):'—'}</Label></View>
  </View>
  <Label muted>{!position?t('حدّث موقعك لحساب طريق الوصول إلى الراكب.','Update your location to calculate the driving route to pickup.'):t('المسافتان حسب طريق القيادة في Google. الأجرة تخص رحلة الراكب ولا تشمل وصولك إليه.','Both distances use Google driving routes. The fare covers the passenger trip and excludes your drive to pickup.')}</Label>{!!pickupError&&<><Label muted>{pickupError}</Label><Button secondary title={t('إعادة حساب طريق الانطلاق','Retry driving route to pickup')} onPress={()=>setPickupAttempt(value=>value+1)}/></>}
  {busy&&<View style={{alignItems:'center',gap:8,padding:16}}><ActivityIndicator color={colors.purple}/><Label muted>{t('جارٍ تجهيز ملخص الطريق والسعر…','Loading route and fare…')}</Label></View>}
  {plan&&<><View style={{height:190,borderRadius:14,overflow:'hidden'}}><MapCanvas compact readOnly minMapHeight={180} point={plan.from} route={plan.points} onChange={()=>{}}/></View><Label muted>{t('أ: الانطلاق · ب: الوصول','A: pickup · B: destination')} · Google Maps</Label></>}
  {!!error&&<><Label muted>{error==='ride_unavailable'?t('هذا الطلب لم يعد متاحًا. حدّث الطلبات.','This request is no longer available. Refresh requests.'):error==='busy'?t('بلغت خدمة الخرائط حد المحاولات. يمكنك إعادة حساب الملخص لاحقًا.','The route limit was reached. Try the summary again later.'):t('تعذر حساب الملخص الآن. أعد المحاولة.','Could not load the summary. Try again.')}</Label><Button secondary title={t('إعادة حساب الملخص','Retry summary')} onPress={()=>setAttempt(value=>value+1)}/></>}
  <Button icon="checkmark-circle-outline" title={t('قبول الطلب','Accept request')} disabled={disabled||error==='ride_unavailable'} onPress={()=>onAccept({trip:plan,pickup:pickupPlan})}/>
 </Panel>;
}
