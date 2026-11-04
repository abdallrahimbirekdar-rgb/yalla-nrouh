import RoutePanel from '../route-panel';
import React,{useState} from 'react';
import {siteCurrentPosition} from '../site-bridge';
import {pickupAllowed} from '../pickup-policy';
import {router} from 'expo-router';
import {useApp} from '../context';
import {validateDraft} from '../domain';
import {Summary} from '../components';
import {Button,Label,Page,useText} from '../ui';
export default function Review(){const {state,draft,dispatch}=useApp();const t=useText();const [checking,setChecking]=useState(false),[error,setError]=useState('');const invalid=validateDraft(draft);const active=state.trips.find(trip=>trip.id===state.activeTripId);
  async function confirm(){if(invalid||active||checking)return;setChecking(true);setError('');try{const current=await siteCurrentPosition(false);if(!pickupAllowed(draft.pickupPoint,current)){setError(t('نقطة الانطلاق يجب أن تكون ضمن ٥٠٠ متر من موقعك الحالي. عدّل الانطلاق.','Pickup must be within 500 metres of your location. Change pickup.'));return}const id=`demo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;dispatch({type:'create',draft,id,now:new Date().toISOString(),pin:String(Math.floor(1000+Math.random()*9000))});router.replace({pathname:'/trip/[id]',params:{id}})}catch{setError(t('تعذر التحقق من موقعك. فعّل الموقع وأعد المحاولة.','Could not check your location. Turn on location and try again.'))}finally{setChecking(false)}}
  return <Page title={t('راجع رحلتك','Review your ride')}>{invalid?<Label>{t('حدد الانطلاق والوجهة أولًا.','Choose pickup and destination first.')}</Label>:<Summary trip={draft}/>}<RoutePanel from={draft.pickupPoint} to={draft.destinationPoint} fromAddress={draft.pickup} toAddress={draft.destination} estimate title={t('الطريق والسعر المتوقع','Route and price estimate')}/><Label muted>{t('الحجز تجريبي. الملاحة في Google Maps متاحة الآن. تقدير السعر قبل الحجز ينتظر ربط حساب الطرق؛ العداد المحلي يعتمد على المسافة والوقت المسجلين.','Demo booking. Google Maps navigation is available now. Pre-ride price estimates await the route service; the local meter uses recorded distance and time.')}</Label>{!!error&&<Label>{error}</Label>}<Button title={t('تأكيد الطلب التجريبي','Confirm demo request')} disabled={Boolean(invalid||active||checking)} onPress={confirm}/><Button secondary title={t('تعديل التفاصيل','Edit details')} onPress={()=>router.replace('/')}/></Page>
}
