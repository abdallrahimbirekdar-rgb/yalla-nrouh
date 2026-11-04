import MeterView from '../meter-view';
import React,{useState} from 'react';
import {router} from 'expo-router';
import {useApp} from '../context';
import {TripStatus} from '../domain';
import {Status,Summary} from '../components';
import {Button,EmptyIllustration,Field,Label,Page,Panel,useText} from '../ui';
export default function Driver(){const {state,dispatch,trackingId,trackingError,startTracking,stopTracking,foreground}=useApp();const t=useText();const [pin,setPin]=useState(''),[error,setError]=useState('');const trip=state.trips.find(item=>item.id===state.activeTripId);
  function move(to:TripStatus){if(!trip)return;if(to==='riding'&&pin!==trip.pin){setError(t('رمز الرحلة غير صحيح. اطلبه من شاشة الراكب.','Wrong PIN. Check it on the passenger screen.'));return}setError('');dispatch({type:'transition',id:trip.id,to,actor:'driver',now:new Date().toISOString(),pin})}
  return <Page title={t('أهلًا كابتن','Hello, driver')}>
    {!state.driver.approved?<Panel><EmptyIllustration icon="shield-checkmark-outline"/><Label>{t('حساب السائق التجريبي بانتظار الموافقة','Demo driver account is waiting for approval')}</Label><Button icon="checkmark-circle-outline" title={t('فتح الإدارة لاعتماد السائق','Open admin to approve the driver')} onPress={()=>router.push('/admin')}/></Panel>:<>
      <Button title={state.driver.online?t('متاح الآن • إيقاف الاستقبال','Online • Stop requests'):t('غير متاح • تشغيل الاستقبال','Offline • Go online')} onPress={()=>dispatch({type:'online'})}/>
      {trip&&(state.driver.online||trip.status!=='requested')?<><Status status={trip.status}/><Summary trip={trip}/>
        {trip.status==='requested'&&<><Button title={t('قبول الطلب التجريبي','Accept demo request')} onPress={()=>move('accepted')}/><Button secondary title={t('رفض الطلب التجريبي','Decline demo request')} onPress={()=>move('cancelled')}/></>}
        {trip.status==='accepted'&&<Button title={t('وصلت إلى الراكب','I have arrived')} onPress={()=>move('arrived')}/>}
        {trip.status==='arrived'&&<Panel><Field label={t('رمز بدء الرحلة من الراكب','Ride PIN from the passenger')} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4}/>{Boolean(error)&&<Label>{error}</Label>}<Button title={t('التحقق وبدء الرحلة','Check PIN and start ride')} onPress={()=>move('riding')}/></Panel>}
        {trip.status==='riding'&&<><MeterView trip={trip}/><Panel><Label>{t('تسجيل GPS على هذا الهاتف','GPS log on this phone')}</Label><Label muted>{t('كل 10 ثوانٍ و20 مترًا، أثناء فتح التطبيق فقط. يتوقف عند قفل الشاشة أو مغادرة التطبيق. تبقى النقاط المحفوظة دون إنترنت.','Every 10 seconds and 20 metres while the app is open. Stops when the screen is locked or you leave the app. Saved points stay on this phone without internet.')}</Label><Button secondary title={trackingId===trip.id?t('إيقاف تسجيل الموقع','Stop GPS log'):t('بدء أو استئناف تسجيل الموقع','Start or resume GPS log')} onPress={()=>trackingId===trip.id?stopTracking():void startTracking(trip.id)}/>{trackingId===trip.id&&<Label>{foreground?t('تسجيل الموقع مفعّل','GPS log is on'):t('التسجيل متوقف في الخلفية','GPS log is paused in the background')}</Label>}{trackingError&&<Label>{t('تعذر تسجيل الموقع. تحقق من إذن الموقع وخدمة GPS ثم حاول مجددًا.','Could not record location. Check location permission and GPS, then try again.')}</Label>}</Panel><Button title={t('إنهاء الرحلة التجريبية','Finish demo ride')} onPress={()=>move('completed')}/></>}
        <Button secondary title={t('عرض شاشة الراكب','View passenger screen')} onPress={()=>router.push({pathname:'/trip/[id]',params:{id:trip.id}})}/>
      </>:<Panel><Label>{state.driver.online?t('بانتظار طلب تجريبي من شاشة الراكب.','Waiting for a demo request from the passenger screen.'):t('شغّل الاستقبال لعرض الطلبات.','Go online to see requests.')}</Label></Panel>}
      <Label muted>{t('التسجيل والأجرة تقدير محلي تجريبي. لا يوجد تسديد أو مزامنة مع خادم بعد.','Route and price are local demo estimates. No payment or server sync is connected yet.')}</Label>
    </>}
  </Page>
}
