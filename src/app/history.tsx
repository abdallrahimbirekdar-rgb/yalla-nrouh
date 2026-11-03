import React from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {Status,TripDate} from '../components';
import {Button,EmptyIllustration,Label,Page,Panel,useText} from '../ui';
export default function History(){const {state}=useApp();const t=useText();return <Page title={t('سجل رحلاتك','Your ride history')}>{state.trips.length===0?<Panel><EmptyIllustration icon="time-outline"/><Label>{t('لا توجد رحلات بعد. جرّب حجز رحلتك الأولى.','No rides yet. Try booking your first ride.')}</Label><Button icon="car-sport-outline" title={t('حجز رحلة','Book a ride')} onPress={()=>router.replace('/')}/></Panel>:state.trips.map(trip=><Panel key={trip.id}><Status status={trip.status}/><TripDate trip={trip}/><Label>{trip.pickup} ← {trip.destination}</Label>{trip.rating!==undefined&&<Label muted>{t('التقييم','Rating')}: {trip.rating}/5</Label>}<Button secondary title={t('عرض التفاصيل','View details')} onPress={()=>router.push({pathname:'/trip/[id]',params:{id:trip.id}})}/></Panel>)}</Page>}
