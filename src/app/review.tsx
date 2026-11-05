import React,{useEffect,useState} from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {cloudCurrentToken,cloudRequestRide} from '../cloud-api';
import {authErrorMessage} from '../auth-errors';
import {siteCurrentPosition} from '../site-bridge';
import {pickupPosition,pickupPositionMessage} from '../pickup-position';
import {PositionError} from '../current-position';
import {pickupQuoteMatches} from '../pickup-policy';
import {validateDraft} from '../domain';
import {Summary} from '../components';
import RoutePanel from '../route-panel';
import RideOptions from '../ride-options';
import {Button,Label,Page,Panel,useText} from '../ui';
export default function Review(){
 const {draft,state,setDraft}=useApp();const auth=useAuth();const t=useText();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[quoted,setQuoted]=useState(''),[pickupReady,setPickupReady]=useState(false),[locationAttempt,setLocationAttempt]=useState(0);const quoteKey=[draft.pickupPoint?.latitude,draft.pickupPoint?.longitude,draft.destinationPoint?.latitude,draft.destinationPoint?.longitude].join('|');const invalid=validateDraft(draft)||!draft.pickupPoint||!draft.destinationPoint;
 useEffect(()=>{let active=true;setPickupReady(false);setQuoted('');setError('');void pickupPosition(siteCurrentPosition).then(point=>{if(active){setDraft(previous=>({...previous,pickup:state.language==='ar'?'موقعي الحالي':'My current location',pickupPoint:point}));setPickupReady(true)}}).catch(e=>{if(active)setError(pickupPositionMessage(e,state.language==='ar'))});return()=>{active=false}},[setDraft,state.language,locationAttempt]);
 async function confirm(){
  if(busy||invalid||!pickupReady||quoted!==quoteKey)return;setBusy(true);setError('');
  try{const current=await pickupPosition(siteCurrentPosition);const currentDraft={...draft,pickup:t('موقعي الحالي','My current location'),pickupPoint:current};
   if(!pickupQuoteMatches(draft.pickupPoint,current)){setQuoted('');setDraft(currentDraft);setError(t('تغيّر موقعك الحالي. نحدّث نقطة الانطلاق والأجرة؛ راجع السعر ثم أكّد الطلب.','Your location changed. We are updating pickup and fare. Check the price, then confirm.'));return}
   await cloudRequestRide(await cloudCurrentToken(),currentDraft);setDraft(previous=>({...previous,pickup:'',destination:'',pickupPoint:undefined,destinationPoint:undefined}));router.replace('/cloud');
  }catch(e){if(e instanceof PositionError){setError(pickupPositionMessage(e,state.language==='ar'));return}setError((e as {kind?:string})?.kind==='too_many_requests'||(e as {kind?:string})?.kind==='23505'?t('لديك طلب نشط بالفعل. افتح رحلاتي لمتابعته.','You already have an active request. Open My rides.'):authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}
 }
 return <Page title={t('راجع رحلتك','Review your ride')}>
  {!pickupReady?<Panel><Label>{error||t('جارٍ قراءة موقع الانطلاق من الهاتف…','Reading pickup from your phone…')}</Label><Button secondary title={t('تحديث موقعي الحالي','Update my current location')} onPress={()=>setLocationAttempt(value=>value+1)}/></Panel>:invalid?<Panel><Label>{t('حدد نقطتي الانطلاق والوصول أولًا.','Choose pickup and destination first.')}</Label><Button title={t('اختيار النقاط','Choose points')} onPress={()=>router.replace('/')}/></Panel>:<>
   <Summary trip={draft}/>
   <RideOptions/>
   {!auth.session?<Panel><Label>{t('سجّل الدخول للمتابعة وحساب الأجرة. ستبقى نقطتا رحلتك محفوظتين.','Sign in to check the fare and continue. Your points will stay saved.')}</Label><Button icon="log-in-outline" title={t('تسجيل الدخول والمتابعة','Sign in and continue')} onPress={()=>router.push({pathname:'/account',params:{next:'review'}})}/></Panel>:<>
    <RoutePanel from={draft.pickupPoint} to={draft.destinationPoint} estimate autoEstimate title={t('الطريق والأجرة المتوقعة','Route and fare estimate')} onQuote={value=>setQuoted(value!==null?quoteKey:'')}/>
    <Label muted>{t('السعر تقديري وفق الطريق وزمنه. الدفع نقدًا. هذه نسخة اختبار؛ إرسال الطلب لا يعني تأكيد توفر سيارة.','This is an estimated fare. Pay in cash. This is a test version. A request does not mean a car is available.')}</Label>
    <Button icon="checkmark-circle-outline" title={busy?t('جارٍ إرسال الطلب…','Sending request…'):t('تأكيد طلب الرحلة','Confirm ride request')} onPress={()=>void confirm()} disabled={busy||quoted!==quoteKey}/>
   </>}
  </>}
  {!!error&&<Panel><Label>{error}</Label><Button secondary title={t('فتح رحلاتي','Open My rides')} onPress={()=>router.push('/cloud')}/></Panel>}
  <Button secondary title={t('تعديل الوجهة','Change destination')} onPress={()=>router.replace('/')}/>
 </Page>;
}
