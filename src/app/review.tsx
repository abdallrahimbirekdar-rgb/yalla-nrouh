import React,{useState} from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {useAuth} from '../auth';
import {cloudCurrentToken,cloudRequestRide} from '../cloud-api';
import {authErrorMessage} from '../auth-errors';
import {siteCurrentPosition} from '../site-bridge';
import {pickupPosition,pickupPositionMessage} from '../pickup-position';
import {PositionError} from '../current-position';
import {pickupAllowed} from '../pickup-policy';
import {validateDraft} from '../domain';
import {Summary} from '../components';
import RoutePanel from '../route-panel';
import {Button,Label,Page,Panel,useText} from '../ui';
export default function Review(){
 const {draft,state,setDraft}=useApp();const auth=useAuth();const t=useText();const [busy,setBusy]=useState(false),[error,setError]=useState(''),[quoted,setQuoted]=useState(false);const invalid=validateDraft(draft)||!draft.pickupPoint||!draft.destinationPoint;
 async function confirm(){
  if(busy||invalid||!quoted)return;setBusy(true);setError('');
  try{const current=await pickupPosition(siteCurrentPosition);if(!pickupAllowed(draft.pickupPoint,current)){setError(t('نقطة الانطلاق يجب أن تكون ضمن ٥٠٠ متر من موقعك الحالي. عدّلها ثم حاول.','Pickup must be within 500 metres of your location. Change it and try again.'));return}
   await cloudRequestRide(await cloudCurrentToken(),draft);setDraft(previous=>({...previous,pickup:'',destination:'',pickupPoint:undefined,destinationPoint:undefined}));router.replace('/cloud');
  }catch(e){if(e instanceof PositionError){setError(pickupPositionMessage(e,state.language==='ar'));return}setError((e as {kind?:string})?.kind==='too_many_requests'||(e as {kind?:string})?.kind==='23505'?t('لديك طلب نشط بالفعل. افتح رحلاتي لمتابعته.','You already have an active request. Open My rides.'):authErrorMessage(e,state.language==='ar'))}finally{setBusy(false)}
 }
 return <Page title={t('راجع رحلتك','Review your ride')}>
  {invalid?<Panel><Label>{t('حدد نقطتي الانطلاق والوصول أولًا.','Choose pickup and destination first.')}</Label><Button title={t('اختيار النقاط','Choose points')} onPress={()=>router.replace('/')}/></Panel>:<>
   <Summary trip={draft}/>
   {!auth.session?<Panel><Label>{t('سجّل الدخول للمتابعة وحساب الأجرة. ستبقى نقطتا رحلتك محفوظتين.','Sign in to check the fare and continue. Your points will stay saved.')}</Label><Button icon="log-in-outline" title={t('تسجيل الدخول والمتابعة','Sign in and continue')} onPress={()=>router.push({pathname:'/account',params:{next:'review'}})}/></Panel>:<>
    <RoutePanel from={draft.pickupPoint} to={draft.destinationPoint} estimate autoEstimate title={t('الطريق والأجرة المتوقعة','Route and fare estimate')} onQuote={value=>setQuoted(value!==null)}/>
    <Label muted>{t('السعر تقديري وفق الطريق وزمنه. الدفع نقدًا. هذه نسخة اختبار؛ إرسال الطلب لا يعني تأكيد توفر سيارة.','This is an estimated fare. Pay in cash. This is a test version. A request does not mean a car is available.')}</Label>
    <Button icon="checkmark-circle-outline" title={busy?t('جارٍ إرسال الطلب…','Sending request…'):t('تأكيد طلب الرحلة','Confirm ride request')} onPress={()=>void confirm()} disabled={busy||!quoted}/>
   </>}
  </>}
  {!!error&&<Panel><Label>{error}</Label><Button secondary title={t('فتح رحلاتي','Open My rides')} onPress={()=>router.push('/cloud')}/></Panel>}
  <Button secondary title={t('تعديل الانطلاق أو الوصول','Change pickup or destination')} onPress={()=>router.replace('/')}/>
 </Page>;
}
