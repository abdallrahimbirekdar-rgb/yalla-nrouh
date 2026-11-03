import React from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {Button,Label,Page,Panel,useText} from '../ui';
export default function Admin(){const {state,dispatch}=useApp();const t=useText();return <Page title={t('إدارة النسخة التجريبية','Demo admin')}>
  <Label muted>{t('هذه شاشة محاكاة مفتوحة لتجربة الصلاحيات. الإدارة الفعلية تحتاج حسابًا محميًا وخادمًا.','This open demo screen lets you try the workflow. Live admin needs a protected account and server.')}</Label>
  <Panel><Label>{t('السائق التجريبي','Demo driver')}</Label><Label>{state.driver.approved?t('الحالة: معتمد','Status: Approved'):t('الحالة: بانتظار المراجعة','Status: Waiting for review')}</Label><Button title={state.driver.approved?t('تعليق السائق التجريبي','Suspend demo driver'):t('اعتماد السائق التجريبي','Approve demo driver')} onPress={()=>dispatch({type:'approve',approved:!state.driver.approved})}/></Panel>
  <Panel><Label>{t('عدد الطلبات التجريبية','Demo requests')}: {state.trips.length}</Label><Label>{t('الرحلات المكتملة','Completed rides')}: {state.trips.filter(trip=>trip.status==='completed').length}</Label><Label>{t('الطلبات الملغاة','Cancelled requests')}: {state.trips.filter(trip=>trip.status==='cancelled').length}</Label></Panel>
  <Label muted>{t('لا توجد تسعيرة معتمدة أو رسوم فعلية في هذه النسخة.','No approved fares or real charges in this version.')}</Label><Button secondary title={t('حالة الخدمات المرتبطة','Connected services status')} onPress={()=>router.push('/services')}/>
  </Page>}
