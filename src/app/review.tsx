import React,{useEffect,useRef,useState} from 'react';
import {Switch,View} from 'react-native';
import {router} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {cloudCurrentToken,cloudMutationUncertain,cloudRequestRide} from '../cloud-api';
import {readRideState} from '../cloud-ride-state';
import {newRideRequestId,useRideRecovery} from '../use-ride-recovery';
import {authErrorMessage} from '../auth-errors';
import {siteCurrentPosition} from '../site-bridge';
import {pickupPosition,pickupPositionMessage} from '../pickup-position';
import {PositionError} from '../current-position';
import {pickupQuoteMatches} from '../pickup-policy';
import {validateDraft} from '../domain';
import {PassengerMap,PassengerStops,RideFooter} from '../passenger-trip-summary';
import type {FareQuote,RoutePlan} from '../routing';
import {rememberPassengerRoute} from '../passenger-ride-route';
import RoutePanel from '../route-panel';
import RideOptions from '../ride-options';
import {useRideSharing} from '../ride-live-sharing';
import {Button,Label,Page,Panel,useText} from '../ui';
export default function Review(){
 const {draft,state,setDraft,foreground,connection}=useApp();const auth=useAuth();const owner=auth.session?.user.id;const t=useText();const [quoteAttempt,setQuoteAttempt]=useState(0);const [busy,setBusy]=useState(false),[error,setError]=useState(''),[quoted,setQuoted]=useState<{key:string;quote:FareQuote;plan:RoutePlan}|null>(null),[pickupReady,setPickupReady]=useState(false),[locationAttempt,setLocationAttempt]=useState(0);const quoteKey=[draft.pickupPoint?.latitude,draft.pickupPoint?.longitude,draft.destinationPoint?.latitude,draft.destinationPoint?.longitude,owner,quoteAttempt].join('|');const manualPickup=draft.pickupMode==='manual';const invalid=validateDraft(draft)||!draft.pickupPoint||!draft.destinationPoint;
 const sharing=useRideSharing(owner);
 const [sharingOwner,setSharingOwner]=useState<string>();
 const shareOnRequest=!!owner&&sharingOwner===owner;
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 useEffect(()=>{
  setPickupReady(false);setQuoted(null);setError('');
  if(manualPickup)return;
  const controller=new AbortController();
  let active=true;
  void pickupPosition(siteCurrentPosition,{controller,reuseNative:locationAttempt===0}).then(point=>{
   if(!active)return;
   setDraft(previous=>({...previous,pickup:t('موقعي الحالي','My current location'),pickupPoint:point}));
   setPickupReady(true);
  }).catch(error=>{if(active)setError(pickupPositionMessage(error,state.language))});
  return()=>{active=false;controller.abort()};
 },[setDraft,state.language,locationAttempt,manualPickup,t]);
 async function openRide(rideId:string){
  let shared=false;
  if(shareOnRequest&&foreground&&sharing.capability){
   setBusy(true);
   shared=await sharing.start(rideId,'passenger');
  }
  if(!mounted.current||readRideState().owner!==owner)return;
  setDraft(previous=>({...previous,pickup:'',destination:'',pickupPoint:undefined,pickupMode:undefined,destinationPoint:undefined}));
  router.replace({pathname:'/cloud',params:{ride:rideId,...(shareOnRequest&&!shared?{shareUnavailable:'1'}:{})}});
 }
 const recovery=useRideRecovery('request',owner,foreground,busy,ride=>{void openRide(ride.id)});
 async function confirm(){
  if(busy||connection==='offline'||!owner||invalid||(!manualPickup&&!pickupReady)||quoted?.key!==quoteKey||recovery.checking)return;
  setBusy(true);setError('');
  let submitted=false;
  try{
   let requestDraft=draft;
   if(!manualPickup){
    const current=await pickupPosition(siteCurrentPosition);
    requestDraft={...draft,pickup:t('موقعي الحالي','My current location'),pickupPoint:current};
    if(!pickupQuoteMatches(draft.pickupPoint,current)){
     setQuoted(null);setDraft(requestDraft);
     setError(t('تغيّر موقعك الحالي. نحدّث نقطة الانطلاق والأجرة؛ راجع السعر ثم أكّد الطلب.','Your location changed. We are updating pickup and fare. Check the price, then confirm.'));
     return;
    }
   }
   const token=await cloudCurrentToken();
   if(readRideState().owner!==owner)return;
   const requestId=recovery.id??newRideRequestId();
   recovery.remember(requestId);submitted=true;
   const rideId=await cloudRequestRide(token,requestDraft,requestId,quoted.quote.id);
   if(readRideState().owner===owner){
    if(requestDraft.pickupPoint&&requestDraft.destinationPoint)
     rememberPassengerRoute(owner,rideId,requestDraft.pickupPoint,requestDraft.destinationPoint,quoted.plan.points);
    recovery.clear();await openRide(rideId);
   }
  }catch(e){
   if(readRideState().owner!==owner)return;
   if(submitted&&cloudMutationUncertain(e))return;
   // A previous attempt with this same ID can still be awaiting reconciliation.
   if(submitted&&!recovery.id)recovery.clear();
   if(e instanceof PositionError){setError(pickupPositionMessage(e,state.language));return}
   const kind=(e as {kind?:string})?.kind;
   if(kind==='YQ001'){setQuoted(null);setQuoteAttempt(value=>value+1);setError(t('انتهت صلاحية التقدير. نحدّث الأجرة؛ راجعها ثم أكّد الطلب.','The estimate expired. We are updating the fare. Check it, then confirm again.'));return}
   setError(kind==='too_many_requests'||kind==='23505'?t('قد يكون لديك طلب نشط. افتح رحلاتي للتحقق.','You may already have an active request. Open My rides to check.'):authErrorMessage(e,state.language));
  }finally{setBusy(false)}
 }
 const readyToReview=!!(manualPickup||pickupReady)&&!invalid;
 const canEdit=!busy&&!recovery.id;
 function editStop(target:'pickup'|'destination'){
  router.replace({pathname:'/location',params:{target,focus:'1',fromReview:'1'}});
 }
 const stops=<PassengerStops compact pickup={draft.pickup||t('حدد نقطة الانطلاق','Choose pickup')} destination={draft.destination||t('حدد الوجهة','Choose destination')}
  onEditPickup={canEdit&&draft.destinationPoint?()=>editStop('pickup'):undefined}
  onEditDestination={canEdit?()=>editStop('destination'):undefined}/>;
 const footer=readyToReview&&auth.session?<RideFooter>
  <Button icon="car-outline" title={busy?t('جارٍ إرسال الطلب…','Sending request…'):recovery.id?t('إعادة إرسال نفس الطلب','Retry the same request'):t('اطلب تاكسي','Request a taxi')} onPress={()=>void confirm()} disabled={busy||connection==='offline'||recovery.checking||quoted?.key!==quoteKey}/>
 </RideFooter>:undefined;
 return <Page compact simpleHeader footer={footer} title={t('راجع رحلتك','Review your ride')} backTo={!recovery.id&&draft.destinationPoint?{pathname:'/location',params:{target:'pickup',fromReview:'1'}}:'/'}>
  {(!auth.session||!readyToReview)&&draft.destinationPoint&&<PassengerMap point={draft.pickupPoint??null} initialCenter={draft.destinationPoint} destinationPoint={draft.destinationPoint}/>}
  {!manualPickup&&!pickupReady?<Panel outlined>
   <Label>{error||t('جارٍ قراءة موقع الانطلاق من الهاتف…','Reading pickup from your phone…')}</Label>
   {!!error&&<Button secondary title={t('تحديث موقعي الحالي','Update my current location')} onPress={()=>setLocationAttempt(value=>value+1)}/>}
   {stops}
  </Panel>:invalid?<Panel outlined>
   <Label>{t('تحقق من نقطتي الانطلاق والوصول.','Check the pickup and destination.')}</Label>
   {stops}
  </Panel>:<>
   {auth.session?<RoutePanel key={quoteKey} from={draft.pickupPoint} to={draft.destinationPoint} estimate autoEstimate
    title={t('الأجرة التقديرية','Estimated fare')} onQuote={(quote,plan)=>setQuoted(quote&&plan?{key:quoteKey,quote,plan}:null)}>
    {stops}
   </RoutePanel>:<Panel outlined>
    {stops}
    <Label muted>{t('سجّل الدخول لعرض الأجرة وتأكيد الطلب.','Sign in to see the fare and confirm.')}</Label>
    <Button icon="log-in-outline" title={t('تسجيل الدخول والمتابعة','Sign in and continue')} onPress={()=>router.push({pathname:'/account',params:{next:'review'}})}/>
   </Panel>}
   <RideOptions/>
   {owner&&sharing.capability&&<Panel outlined>
    <View style={{flexDirection:state.language==='ar'?'row-reverse':'row',alignItems:'center',gap:10}}>
     <View style={{flex:1}}><Label>{t('مشاركة موقعي مع السائق','Share my location with the driver')}</Label></View>
     <Switch value={shareOnRequest} disabled={busy||recovery.checking}
      accessibilityLabel={t('مشاركة موقعي مع السائق','Share my location with the driver')}
      onValueChange={enabled=>setSharingOwner(enabled?owner:undefined)}/>
    </View>
    <Label muted>{t('تبدأ المشاركة بعد تسجيل الطلب وتستمر في الخلفية أثناء الانتظار والرحلة. يراه السائق المعيّن فقط. يمكنك إيقافها من الرحلة أو الإشعار.','Sharing starts after your request is confirmed and continues in the background while you wait and ride. Only your assigned driver can see it. Stop it from the ride or notification.')}</Label>
   </Panel>}
   <Label muted>{t('الأجرة تقديرية. يتأكد توفر السيارة بعد قبول سائق للطلب.','The fare is an estimate. A car is confirmed when a driver accepts.')}</Label>
  </>}
  {recovery.id&&<Panel>
   <Label>{connection==='offline'?t('انقطع الاتصال بعد محاولة الإرسال. سنتحقق من نفس الطلب عند عودة الإنترنت.','Connection lost after sending. We will check the same request when you reconnect.'):busy||recovery.checking?t('جارٍ التحقق من وصول الطلب…','Checking whether your request arrived…'):t('لم يتأكد وصول الطلب بعد. يمكنك إعادة إرساله بنفس رقم الطلب.','Your request is still unconfirmed. You can retry with the same request ID.')}</Label>
  </Panel>}
  {!!error&&(manualPickup||pickupReady)&&<Panel><Label>{error}</Label><Button secondary title={t('فتح رحلاتي','Open My rides')} onPress={()=>router.push('/cloud')}/></Panel>}
 </Page>;
}
