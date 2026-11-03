import React,{useState} from 'react';
import {Share,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useApp} from '../../context';
import {Status,Summary,TripDate} from '../../components';
import {Button,Field,Label,Page,Panel,styles,useText} from '../../ui';
export default function TripScreen(){const {id}=useLocalSearchParams<{id:string}>();const {state,dispatch}=useApp();const t=useText();const trip=state.trips.find(item=>item.id===id);const [rating,setRating]=useState(5),[feedback,setFeedback]=useState(''),[shareError,setShareError]=useState(false);
  if(!trip)return <Page title={t('الرحلة غير موجودة','Ride not found')}><Button title={t('العودة','Back')} onPress={()=>router.replace('/')}/></Page>;
  const active=!['completed','cancelled'].includes(trip.status);
  async function share(){if(!trip)return;setShareError(false);try{await Share.share({message:t('رحلة تجريبية في يلا نروح — ليست متابعة مباشرة','Yalla Nrouh demo ride — not live tracking')+'\n'+trip.pickup+' → '+trip.destination+'\n'+trip.id})}catch{setShareError(true)}}
  return <Page title={t('تفاصيل الرحلة','Ride details')}><Status status={trip.status}/><TripDate trip={trip}/><Summary trip={trip}/>
    {['accepted','arrived','riding'].includes(trip.status)&&<Panel><Label>{t('ملف سائق تجريبي','Demo driver profile')}</Label><Label muted>{t('السيارة والهوية ستظهران بعد ربط حسابات السائقين.','Car and driver details will appear when driver accounts are connected.')}</Label></Panel>}
    {['accepted','arrived'].includes(trip.status)&&<Panel><Label>{t('رمز بدء الرحلة','Ride start PIN')}</Label><Label large>{trip.pin}</Label><Label muted>{t('أعطِ الرمز للسائق بعد التأكد من بيانات السيارة.','Give the PIN to the driver after checking the car details.')}</Label></Panel>}
    {active&&<Button title={t('فتح شاشة السائق التجريبية','Open demo driver screen')} onPress={()=>router.push('/driver')}/>}
    <Button secondary title={t('مشاركة ملخص تجريبي','Share demo summary')} onPress={share}/>{shareError&&<Label>{t('تعذرت المشاركة. أعد المحاولة.','Could not share. Please try again.')}</Label>}
    {['requested','accepted','arrived'].includes(trip.status)&&<Button secondary title={t('إلغاء الطلب التجريبي','Cancel demo request')} onPress={()=>dispatch({type:'transition',id:trip.id,to:'cancelled',actor:'passenger',now:new Date().toISOString()})}/>}
    {trip.status==='completed'&&(trip.rating!==undefined?<Panel><Label>{t('تم حفظ التقييم','Rating saved')}: {trip.rating}/5</Label>{Boolean(trip.feedback)&&<Label muted>{trip.feedback}</Label>}</Panel>:<Panel><Label>{t('كيف كانت الرحلة؟','How was your ride?')}</Label><View style={styles.row}>{[1,2,3,4,5].map(n=><Button key={n} secondary={rating!==n} title={String(n)} onPress={()=>setRating(n)}/>)}</View><Field label={t('ملاحظة اختيارية','Optional feedback')} value={feedback} onChangeText={setFeedback} maxLength={500} multiline/><Button title={t('حفظ التقييم التجريبي','Save demo rating')} onPress={()=>dispatch({type:'rate',id:trip.id,rating,feedback})}/></Panel>)}
    {!active&&<Button title={t('حجز رحلة جديدة','Book another ride')} onPress={()=>router.replace('/')}/>}
  </Page>
}
