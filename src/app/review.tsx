import React,{useEffect,useState} from 'react';
import {View} from 'react-native';
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
import {PassengerStops} from '../passenger-trip-summary';
import type {FareQuote} from '../routing';
import RoutePanel from '../route-panel';
import RideOptions from '../ride-options';
import {Button,Label,Page,Panel,useText,useTheme} from '../ui';
export default function Review(){
 const {draft,state,setDraft,foreground}=useApp();const auth=useAuth();const owner=auth.session?.user.id;const t=useText();const {colors}=useTheme();const [quoteAttempt,setQuoteAttempt]=useState(0);const [busy,setBusy]=useState(false),[error,setError]=useState(''),[quoted,setQuoted]=useState<{key:string;quote:FareQuote}|null>(null),[pickupReady,setPickupReady]=useState(false),[locationAttempt,setLocationAttempt]=useState(0);const quoteKey=[draft.pickupPoint?.latitude,draft.pickupPoint?.longitude,draft.destinationPoint?.latitude,draft.destinationPoint?.longitude].join('|');const manualPickup=draft.pickupMode==='manual';const invalid=validateDraft(draft)||!draft.pickupPoint||!draft.destinationPoint;
 useEffect(()=>{let active=true;setPickupReady(false);setQuoted(null);setError('');if(manualPickup)return;void pickupPosition(siteCurrentPosition).then(point=>{if(active){setDraft(previous=>({...previous,pickup:state.language==='ar'?'موقعي الحالي':'My current location',pickupPoint:point}));setPickupReady(true)}}).catch(e=>{if(active)setError(pickupPositionMessage(e,state.language==='ar'))});return()=>{active=false}},[setDraft,state.language,locationAttempt,manualPickup]);
 function openRide(rideId:string){
  setDraft(previous=>({...previous,pickup:'',destination:'',pickupPoint:undefined,pickupMode:undefined,destinationPoint:undefined}));
  router.replace({pathname:'/cloud',params:{ride:rideId}});
 }
 const recovery=useRideRecovery('request',owner,foreground,busy,ride=>openRide(ride.id));
 async function confirm(){
  if(busy||!owner||invalid||(!manualPickup&&!pickupReady)||quoted?.key!==quoteKey||recovery.checking)return;
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
   if(readRideState().owner===owner){recovery.clear();openRide(rideId)}
  }catch(e){
   if(readRideState().owner!==owner)return;
   if(submitted&&cloudMutationUncertain(e))return;
   // A previous attempt with this same ID can still be awaiting reconciliation.
   if(submitted&&!recovery.id)recovery.clear();
   if(e instanceof PositionError){setError(pickupPositionMessage(e,state.language==='ar'));return}
   const kind=(e as {kind?:string})?.kind;
   if(kind==='YQ001'){setQuoted(null);setQuoteAttempt(value=>value+1);setError(t('انتهت صلاحية التقدير. نحدّث الأجرة؛ راجعها ثم أكّد الطلب.','The estimate expired. We are updating the fare. Check it, then confirm again.'));return}
   setError(kind==='too_many_requests'||kind==='23505'?t('قد يكون لديك طلب نشط. افتح رحلاتي للتحقق.','You may already have an active request. Open My rides to check.'):authErrorMessage(e,state.language==='ar'));
  }finally{setBusy(false)}
 }
 const readyToReview=!!(manualPickup||pickupReady)&&!invalid;
 const footer=readyToReview&&auth.session?<View style={{backgroundColor:colors.background,borderTopWidth:1,borderColor:colors.line,paddingHorizontal:14,paddingVertical:8}}>
  <View style={{width:'100%',maxWidth:616,alignSelf:'center'}}>
   <Button icon="checkmark-circle-outline" title={busy?t('جارٍ إرسال الطلب…','Sending request…'):recovery.id?t('إعادة إرسال نفس الطلب','Retry the same request'):t('تأكيد طلب الرحلة','Confirm ride request')} onPress={()=>void confirm()} disabled={busy||recovery.checking||quoted?.key!==quoteKey}/>
  </View>
 </View>:undefined;
 return <Page compact footer={footer} title={t('راجع رحلتك','Review your ride')} backTo={!recovery.id&&draft.destinationPoint?{pathname:'/location',params:{target:'pickup'}}:'/'}>
  {recovery.id&&<Panel>
   <Label>{busy||recovery.checking?t('جارٍ التحقق من وصول الطلب…','Checking whether your request arrived…'):t('لم يتأكد وصول الطلب بعد. يمكنك إعادة إرساله بنفس رقم الطلب.','Your request is still unconfirmed. You can retry with the same request ID.')}</Label>
  </Panel>}
  {!manualPickup&&!pickupReady?<Panel><Label>{error||t('جارٍ قراءة موقع الانطلاق من الهاتف…','Reading pickup from your phone…')}</Label><Button secondary title={t('تحديث موقعي الحالي','Update my current location')} onPress={()=>setLocationAttempt(value=>value+1)}/></Panel>:invalid?<Panel><Label>{t('حدد نقطتي الانطلاق والوصول أولًا.','Choose pickup and destination first.')}</Label><Button title={t('اختيار النقاط','Choose points')} onPress={()=>router.replace(draft.destinationPoint?{pathname:'/location',params:{target:'pickup'}}:{pathname:'/'})}/></Panel>:<>
   {auth.session?<RoutePanel key={quoteAttempt} from={draft.pickupPoint} to={draft.destinationPoint} estimate autoEstimate
    title={t('الأجرة التقديرية','Estimated fare')} onQuote={quote=>setQuoted(quote?{key:quoteKey,quote}:null)}>
    <PassengerStops {...draft}/>
   </RoutePanel>:<Panel outlined>
    <PassengerStops {...draft}/>
    <Label muted>{t('سجّل الدخول لعرض الأجرة وتأكيد الطلب.','Sign in to see the fare and confirm.')}</Label>
    <Button icon="log-in-outline" title={t('تسجيل الدخول والمتابعة','Sign in and continue')} onPress={()=>router.push({pathname:'/account',params:{next:'review'}})}/>
   </Panel>}
   <RideOptions/>
   <Label muted>{t('الأجرة تقديرية. يتأكد توفر السيارة بعد قبول سائق للطلب.','The fare is an estimate. A car is confirmed when a driver accepts.')}</Label>
  </>}
  {!!error&&<Panel><Label>{error}</Label><Button secondary title={t('فتح رحلاتي','Open My rides')} onPress={()=>router.push('/cloud')}/></Panel>}
  {!recovery.id&&<>
   {draft.destinationPoint&&<Button secondary icon="location-outline" title={t('تعديل نقطة الانطلاق','Change pickup point')} onPress={()=>router.replace({pathname:'/location',params:{target:'pickup'}})}/>}
   <Button secondary title={t('تعديل الوجهة','Change destination')} onPress={()=>router.replace({pathname:'/location',params:{target:'destination'}})}/>
  </>}
 </Page>;
}
