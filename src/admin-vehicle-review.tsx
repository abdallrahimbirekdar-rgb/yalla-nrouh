import React,{useState} from 'react';
import {Image,View} from 'react-native';
import {
 cloudCurrentToken,cloudReviewVehicle,cloudSuspendDriver,cloudVehicleReviewDetails,
 type StaffDriver,type VehicleReviewDecision,type VehicleReviewDetails,
} from './cloud-api';
import {categories,regions} from './domain';
import {useApp} from './context';
import {Button,Field,Label,useText,useTheme} from './ui';

export default function AdminVehicleReview({account,onChanged}:{account:StaffDriver;onChanged:()=>void}){
 const t=useText();const {colors}=useTheme();const {state}=useApp();
 const [detail,setDetail]=useState<VehicleReviewDetails|null>(null),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const category=categories.find(entry=>entry.id===account.category)?.[state.language]??account.category;
 async function open(){
  setBusy(true);setNotice('');
  try{
   const result=await cloudVehicleReviewDetails(await cloudCurrentToken(),account.user_id);
   if(!result)throw Error('not_found');
   setDetail(result);setReason('');
  }catch{setNotice(t('تعذّر تحميل بيانات السائق.','Could not load driver details.'))}
  finally{setBusy(false)}
 }
 async function review(decision:VehicleReviewDecision){
  if(!detail?.revision)return;
  setBusy(true);setNotice('');
  try{
   const token=await cloudCurrentToken();
   const result=await cloudReviewVehicle(token,account.user_id,detail.revision,decision,reason);
   const messages={
    saved:t('تم حفظ قرار المراجعة.','Review decision saved.'),
    stale:t('الطلب تغيّر منذ فتحه. افتح أحدث نسخة وراجعها.','The submission changed. Open and review the latest version.'),
    incomplete:t('يجب استكمال الاسم والطراز واللون واللوحة أولًا.','The name, model, color and plate are required.'),
    active_ride:t('يمكن اعتماد التعديل بعد انتهاء رحلة السائق النشطة.','Approve the update after the driver finishes the active ride.'),
    invalid:t('تحقق من سبب القرار.','Check the reason for the decision.'),
   };
   setNotice(messages[result]);
   if(result==='saved'||result==='stale'){setDetail(null);setReason('');onChanged()}
  }catch{setNotice(t('تعذّر حفظ القرار.','Could not save the decision.'))}
  finally{setBusy(false)}
 }
 async function suspend(){
  setBusy(true);setNotice('');
  try{
   if(!await cloudSuspendDriver(await cloudCurrentToken(),account.user_id))throw Error('not_found');
   setDetail(null);setReason('');onChanged();setNotice(t('تم تعليق استقبال الطلبات لهذا السائق.','Ride requests were suspended for this driver.'));
  }catch{setNotice(t('تعذّر تعليق السائق.','Could not suspend the driver.'))}
  finally{setBusy(false)}
 }
 const complete=Boolean(detail?.display_name&&detail.vehicle_model&&detail.vehicle_color&&detail.vehicle_plate);
 return <View style={{gap:9,paddingVertical:10,borderTopWidth:1,borderColor:colors.line}}>
  <Label>{regions[account.region]?.[state.language==='ar'?0:1]} · {category}</Label>
  <Label muted>{account.user_id}</Label>
  <Label>{account.approved?t('مصرّح له باستقبال الطلبات','Authorized to receive ride requests'):t('استقبال الطلبات غير مفعّل','Ride requests are disabled')}</Label>
  <Button secondary title={detail?t('إغلاق البيانات','Close details'):t('مراجعة بيانات السائق والسيارة','Review driver and vehicle details')} disabled={busy}
   onPress={()=>detail?setDetail(null):void open()}/>
  {detail&&<>
   <Label>{detail.display_name??'—'}</Label>
   <Label muted>{[detail.vehicle_model,detail.vehicle_color,detail.vehicle_plate].filter(Boolean).join(' · ')||t('لم يضف بيانات السيارة بعد.','Vehicle details have not been added yet.')}</Label>
   {detail.photo&&<Image accessibilityLabel={t('صورة السيارة للمراجعة','Vehicle photo for review')} source={{uri:'data:image/jpeg;base64,'+detail.photo}}
    style={{width:'100%',height:180,borderRadius:12}} resizeMode="contain"/>}
   {detail.status==='pending'&&<>
    <Label>{t('بانتظار المراجعة','Waiting for review')}</Label>
    <Button title={t('اعتماد البيانات','Approve details')} disabled={busy||!complete} onPress={()=>void review('approve')}/>
    {!complete&&<Label muted>{t('الاسم والطراز واللون واللوحة مطلوبة للاعتماد.','Name, model, color and plate are required for approval.')}</Label>}
    <Field label={t('السبب الذي سيظهر للسائق','Reason shown to the driver')} value={reason} onChangeText={setReason} maxLength={300} editable={!busy}/>
    <Button secondary title={t('طلب تعديل','Request changes')} disabled={busy||!reason.trim()} onPress={()=>void review('changes_requested')}/>
    <Button secondary title={t('رفض هذه البيانات','Reject these details')} disabled={busy||!reason.trim()} onPress={()=>void review('rejected')}/>
   </>}
   {detail.status==='changes_requested'&&<Label>{t('طُلب تعديل البيانات.','Changes were requested.')}</Label>}
   {detail.status==='rejected'&&<Label>{t('رُفضت هذه البيانات.','These details were rejected.')}</Label>}
   {detail.status==='approved'&&<Label>{t('بيانات معتمدة','Approved details')}</Label>}
   {detail.status==='unsubmitted'&&<Label>{t('بانتظار إرسال بيانات السيارة.','Waiting for the driver to submit vehicle details.')}</Label>}
   {detail.reason&&<Label muted>{detail.reason}</Label>}
   {account.approved&&<Button secondary title={t('تعليق استقبال الطلبات','Suspend ride requests')} disabled={busy} onPress={()=>void suspend()}/>}
  </>}
  {notice!==''&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
 </View>;
}
