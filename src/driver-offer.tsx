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
export default function DriverOffer({offer,remainingSeconds,position,disabled,expanded,onExpand,onDecline,onAccept}:{offer:RidePreview;remainingSeconds:number;position?:Coordinate;disabled:boolean;expanded:boolean;onExpand:()=>void;onDecline:()=>void;onAccept:(routes:{trip:RoutePlan|null;pickup:RoutePlan|null})=>void}){
 const {state}=useApp();const auth=useAuth();const t=useText();const {colors,dark}=useTheme();
 const [plan,setPlan]=useState<RoutePlan|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [pickupPlan,setPickupPlan]=useState<RoutePlan|null>(null),[pickupBusy,setPickupBusy]=useState(false),[pickupError,setPickupError]=useState(''),[pickupAttempt,setPickupAttempt]=useState(0);
 const currentPosition=useRef(position);currentPosition.current=position;
 const id=offer.ride_id,owner=auth.session?.user.id;
 const quotedFare=typeof offer.estimated_fare==='number'&&Number.isSafeInteger(offer.estimated_fare)&&offer.estimated_fare>=0?offer.estimated_fare:null;
 const [pickupPoint,setPickupPoint]=useState<Coordinate|null>(null);
 useEffect(()=>{if(!expanded)return;let live=true;const controller=new AbortController();setBusy(true);setError('');setPlan(null);setPickupPlan(null);setPickupPoint(null);
  void (async()=>{const token=await cloudCurrentToken();const row=await cloudDriverRidePreview(token,id);if(!live)return;
   const from={latitude:row.pickup_lat,longitude:row.pickup_lng},to={latitude:row.destination_lat,longitude:row.destination_lng};
   // Always recheck server visibility before reusing a summary.
   const key=JSON.stringify([owner,id,state.language]);
   const cached=attempt===0?offerRouteCache.get(key,from,to):null;
   if(cached){setPlan(cached.trip);setPickupPlan(cached.pickup);setPickupPoint(from);return}
   const client=createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route');
   const driver=currentPosition.current;
   const tripOnly=async()=>({trip:await routeScheduler.run(()=>client.route(from,to,controller.signal,state.language,token),controller.signal),pickup:null});
   // Queue the trip first, then let pickup routing run even if that trip request fails.
   const pending=driver&&quotedFare===null
    ? routeScheduler.run(()=>client.driverOffer(driver,from,to,controller.signal,state.language,token),controller.signal).catch(error=>{
      if(!(error instanceof ServiceError)||!['response','no_route'].includes(error.code))throw error;
      return tripOnly();
     })
    : tripOnly();
   setPickupPoint(from);
   const next=await pending;
   if(live){offerRouteCache.set(key,next);setPlan(next.trip);setPickupPlan(next.pickup)}
  })().catch(e=>{if(live)setError((e as {code?:string;kind?:string}).code??(e as {kind?:string}).kind??'network')}).finally(()=>{if(live)setBusy(false)});
  return()=>{live=false;controller.abort()};
 },[id,owner,state.language,attempt,quotedFare,expanded]);
 const originLat=position?.latitude,originLng=position?.longitude;
 const pickupLat=pickupPoint?.latitude,pickupLng=pickupPoint?.longitude;
 useEffect(()=>{setPickupError('');setPickupBusy(false);if(!expanded||quotedFare===null&&busy||originLat===undefined||originLng===undefined||pickupLat===undefined||pickupLng===undefined)return;
  if(pickupPlan&&distanceMeters(pickupPlan.from,{latitude:originLat,longitude:originLng})<100&&distanceMeters(pickupPlan.to,{latitude:pickupLat,longitude:pickupLng})<1&&pickupAttempt===0)return;let live=true;const controller=new AbortController();setPickupBusy(true);
  void cloudCurrentToken().then(token=>routeScheduler.run(()=>createRoutingClient(process.env.EXPO_PUBLIC_GOOGLE_ROUTES_PROXY||'https://gokosprcqpdvqgahvquk.supabase.co/functions/v1/fare-route').route({latitude:originLat,longitude:originLng},{latitude:pickupLat,longitude:pickupLng},controller.signal,state.language,token),controller.signal)).then(next=>{if(live){setPickupBusy(false);setPickupAttempt(0);setPickupPlan(next);if(plan)offerRouteCache.set(JSON.stringify([owner,id,state.language]),{trip:plan,pickup:next})}}).catch(()=>{if(live)setPickupError(state.language==='ar'?'تعذر حساب طريق الوصول إلى الراكب.':'Could not find the driving route to pickup.')}).finally(()=>{if(live)setPickupBusy(false)});
  return()=>{live=false;controller.abort()};
 },[originLat,originLng,pickupLat,pickupLng,state.language,pickupAttempt,pickupPlan,plan,owner,id,quotedFare,busy,expanded]);
 const fare=quotedFare??(plan?priceForRoute(plan.meters,plan.seconds/60,plan.tariff??null):null);
 const approach=pickupPlan&&position?navigationProgress(pickupPlan,position):null;
 const away=pickupPlan?(approach&&approach.offRouteMeters<=100?approach.remainingMeters:pickupPlan.meters):null;
 const eta=pickupPlan?(approach&&approach.offRouteMeters<=100?approach.remainingSeconds:pickupPlan.seconds):null;
 const row={flexDirection:state.language==='ar'?'row-reverse' as const:'row' as const,gap:8};
 const metric={flex:1,minWidth:0,paddingHorizontal:10,paddingVertical:7,borderRadius:12,backgroundColor:colors.soft};
 const urgent=remainingSeconds<=30;
 return <Panel outlined>
  <View style={{...row,alignItems:'center'}}>
   <View style={{flex:1}}><Label muted>{t('عرض رحلة','Ride offer')}</Label><Label>{regions[offer.region]?.[state.language==='ar'?0:1]} · {categories.find(c=>c.id===offer.category)?.[state.language]??offer.category}</Label></View>
   <View style={{...row,gap:4,alignItems:'center',paddingHorizontal:8,borderRadius:10,backgroundColor:urgent?(dark?'#47262a':'#ffeded'):colors.selected}}>
    <Icon name="time-outline" size={16} color={urgent?colors.error:colors.ink}/>
    <Label>{t('متبقّي','Left')} {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</Label>
   </View>
  </View>
  <View style={row}>
   <View style={{...metric,backgroundColor:colors.selected}}><Label>{t('الأجرة التقديرية','Estimated fare')}</Label><Label display>{fare===null?'—':fare.toLocaleString('en-US')}</Label>{fare!==null&&<Label>{t('ل.س','SYP')}</Label>}</View>
   <View style={metric}><Label>{t('للزبون','To pickup')}</Label><Label display>{away===null?'—':(away/1000).toFixed(1)}</Label><Label>{away!==null?t('كم','km')+(eta===null?'':' · '+Math.ceil(eta/60)+' '+t('د','min')):expanded&&pickupBusy?t('جارٍ الحساب','Calculating'):t('مسافة القيادة','Driving distance')}</Label></View>
  </View>
  <View style={row}>
   <View style={{flex:1.25}}><Button prominent tone="positive" icon="checkmark-circle-outline" title={t('قبول','Accept')} disabled={disabled||error==='ride_unavailable'} onPress={()=>onAccept({trip:plan,pickup:pickupPlan})}/></View>
   <View style={{flex:1}}><Button prominent secondary tone="danger" icon="close-circle-outline" title={t('رفض','Decline')} disabled={disabled} onPress={onDecline}/></View>
  </View>
  {!expanded&&<Button secondary icon="location-outline" title={t('عرض مكان الزبون','Show pickup location')} onPress={onExpand}/>}
  {expanded&&<>
  {plan&&<Label>{t('رحلة الزبون','Passenger trip')} · {(plan.meters/1000).toFixed(1)} {t('كم','km')} · {Math.ceil(plan.seconds/60)} {t('دقيقة','min')}</Label>}
  {pickupPoint&&<>
   <View style={{...row,alignItems:'center'}}><Icon name="location-outline" size={19}/><Label>{t('مكان الزبون','Pickup location')}</Label></View>
   <View style={{height:175,borderRadius:14,overflow:'hidden'}}><MapCanvas compact readOnly minMapHeight={175} point={pickupPoint} route={plan?.points} onChange={()=>{}}/></View>
   {plan&&<Label muted>{t('أ: مكان الزبون · ب: الوجهة','A: pickup · B: destination')} · Google Maps</Label>}
  </>}
  <Label muted>{!position?t('حدّث موقعك لحساب طريق الوصول إلى الراكب.','Update your location to calculate the driving route to pickup.'):t('المسافتان حسب طريق القيادة في Google. الأجرة تخص رحلة الراكب ولا تشمل وصولك إليه.','Both distances use Google driving routes. The fare covers the passenger trip and excludes your drive to pickup.')}</Label>{!!pickupError&&<><Label muted>{pickupError}</Label><Button secondary title={t('إعادة حساب طريق الانطلاق','Retry driving route to pickup')} onPress={()=>setPickupAttempt(value=>value+1)}/></>}
  {busy&&<View style={{alignItems:'center',gap:8,padding:16}}><ActivityIndicator color={colors.purple}/><Label muted>{t('جارٍ تحميل تفاصيل الطريق…','Loading route details…')}</Label></View>}
  {!!error&&<><Label muted>{error==='ride_unavailable'?t('هذا الطلب لم يعد متاحًا. حدّث الطلبات.','This request is no longer available. Refresh requests.'):error==='busy'?t('بلغت خدمة الخرائط حد المحاولات. يمكنك إعادة حساب الملخص لاحقًا.','The route limit was reached. Try the summary again later.'):t('تعذر حساب الملخص الآن. أعد المحاولة.','Could not load the summary. Try again.')}</Label><Button secondary title={t('إعادة حساب الملخص','Retry summary')} onPress={()=>setAttempt(value=>value+1)}/></>}
  </>}
 </Panel>;
}
