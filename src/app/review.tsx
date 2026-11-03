import React from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {validateDraft} from '../domain';
import {Summary} from '../components';
import {Button,Label,Page,useText} from '../ui';
export default function Review(){const {state,draft,dispatch}=useApp();const t=useText();const invalid=validateDraft(draft);const active=state.trips.find(trip=>trip.id===state.activeTripId);
  function confirm(){if(invalid||active)return;const id=`demo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;dispatch({type:'create',draft,id,now:new Date().toISOString(),pin:String(Math.floor(1000+Math.random()*9000))});router.replace({pathname:'/trip/[id]',params:{id}})}
  return <Page title={t('راجع رحلتك','Review your ride')}>{invalid?<Label>{t('حدد الانطلاق والوجهة أولًا.','Choose pickup and destination first.')}</Label>:<Summary trip={draft}/>}<Label muted>{t('هذا طلب تجريبي فقط. لا يوجد سعر أو وقت وصول محسوب.','This is a demo request. No price or arrival time is calculated.')}</Label><Button title={t('تأكيد الطلب التجريبي','Confirm demo request')} disabled={Boolean(invalid||active)} onPress={confirm}/><Button secondary title={t('تعديل التفاصيل','Edit details')} onPress={()=>router.replace('/')}/></Page>
}
