import React,{useState} from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {TripStatus} from '../domain';
import {Status,Summary} from '../components';
import {Button,EmptyIllustration,Field,Label,Page,Panel,useText} from '../ui';
export default function Driver(){const {state,dispatch}=useApp();const t=useText();const [pin,setPin]=useState(''),[error,setError]=useState('');const trip=state.trips.find(item=>item.id===state.activeTripId);
  function move(to:TripStatus){if(!trip)return;if(to==='riding'&&pin!==trip.pin){setError(t('رمز الرحلة غير صحيح. اطلبه من شاشة الراكب.','Wrong PIN. Check it on the passenger screen.'));return}setError('');dispatch({type:'transition',id:trip.id,to,actor:'driver',now:new Date().toISOString(),pin})}
  return <Page title={t('أهلًا كابتن','Hello, driver')}>
    {!state.driver.approved?<Panel><EmptyIllustration icon="shield-checkmark-outline"/><Label>{t('حساب السائق التجريبي بانتظار الموافقة','Demo driver account is waiting for approval')}</Label><Button icon="checkmark-circle-outline" title={t('فتح الإدارة لاعتماد السائق','Open admin to approve the driver')} onPress={()=>router.push('/admin')}/></Panel>:<>
      <Button title={state.driver.online?t('متاح الآن • إيقاف الاستقبال','Online • Stop requests'):t('غير متاح • تشغيل الاستقبال','Offline • Go online')} onPress={()=>dispatch({type:'online'})}/>
      {trip&&(state.driver.online||trip.status!=='requested')?<><Status status={trip.status}/><Summary trip={trip}/>
        {trip.status==='requested'&&<><Button title={t('قبول الطلب التجريبي','Accept demo request')} onPress={()=>move('accepted')}/><Button secondary title={t('رفض الطلب التجريبي','Decline demo request')} onPress={()=>move('cancelled')}/></>}
        {trip.status==='accepted'&&<Button title={t('وصلت إلى الراكب','I have arrived')} onPress={()=>move('arrived')}/>}
        {trip.status==='arrived'&&<Panel><Field label={t('رمز بدء الرحلة من الراكب','Ride PIN from the passenger')} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4}/>{Boolean(error)&&<Label>{error}</Label>}<Button title={t('التحقق وبدء الرحلة','Check PIN and start ride')} onPress={()=>move('riding')}/></Panel>}
        {trip.status==='riding'&&<Button title={t('إنهاء الرحلة التجريبية','Finish demo ride')} onPress={()=>move('completed')}/>}
        <Button secondary title={t('عرض شاشة الراكب','View passenger screen')} onPress={()=>router.push({pathname:'/trip/[id]',params:{id:trip.id}})}/>
      </>:<Panel><Label>{state.driver.online?t('بانتظار طلب تجريبي من شاشة الراكب.','Waiting for a demo request from the passenger screen.'):t('شغّل الاستقبال لعرض الطلبات.','Go online to see requests.')}</Label></Panel>}
      <Label muted>{t('الأرباح غير محسوبة؛ التسعير لم يُربط بعد.','Earnings are not calculated. Pricing is not connected yet.')}</Label>
    </>}
  </Page>
}
