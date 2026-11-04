import RoutePanel from '../route-panel';
import React from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {validateDraft} from '../domain';
import {Summary} from '../components';
import {Button,Label,Page,useText} from '../ui';
export default function Review(){const {state,draft,dispatch}=useApp();const t=useText();const invalid=validateDraft(draft);const active=state.trips.find(trip=>trip.id===state.activeTripId);
  function confirm(){if(invalid||active)return;const id=`demo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;dispatch({type:'create',draft,id,now:new Date().toISOString(),pin:String(Math.floor(1000+Math.random()*9000))});router.replace({pathname:'/trip/[id]',params:{id}})}
  return <Page title={t('راجع رحلتك','Review your ride')}>{invalid?<Label>{t('حدد الانطلاق والوجهة أولًا.','Choose pickup and destination first.')}</Label>:<Summary trip={draft}/>}<RoutePanel from={draft.pickupPoint} to={draft.destinationPoint} fromAddress={draft.pickup} toAddress={draft.destination} estimate title={t('الطريق والسعر المتوقع','Route and price estimate')}/><Label muted>{t('الحجز تجريبي. الملاحة في Google Maps متاحة الآن. تقدير السعر قبل الحجز ينتظر ربط حساب الطرق؛ العداد المحلي يعتمد على المسافة والوقت المسجلين.','Demo booking. Google Maps navigation is available now. Pre-ride price estimates await the route service; the local meter uses recorded distance and time.')}</Label><Button title={t('تأكيد الطلب التجريبي','Confirm demo request')} disabled={Boolean(invalid||active)} onPress={confirm}/><Button secondary title={t('تعديل التفاصيل','Edit details')} onPress={()=>router.replace('/')}/></Page>
}
