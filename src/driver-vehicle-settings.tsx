import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Platform,View} from 'react-native';
import {cloudCurrentToken,cloudMyDriverVehicleDetails,cloudSaveDriverVehicleDetails,type VehicleReviewDetails} from './cloud-api';
import {readVehiclePhoto} from './vehicle-photo';
import {Button,Field,Label,Panel,useText} from './ui';

const fields=[
 {key:'display_name',ar:'اسم السائق للعرض',en:'Driver display name',length:80},
 {key:'vehicle_model',ar:'ماركة السيارة وطرازها',en:'Vehicle make and model',length:80},
 {key:'vehicle_color',ar:'لون السيارة',en:'Vehicle color',length:40},
 {key:'vehicle_plate',ar:'رقم اللوحة',en:'Plate number',length:24},
] as const;
type Form=Record<typeof fields[number]['key'],string>&{photo:string|null};

export default function DriverVehicleSettings(){
 const t=useText();
 const [form,setForm]=useState<Form|null>(null);
 const [review,setReview]=useState<VehicleReviewDetails|null>(null);
 const [dirty,setDirty]=useState(false);
 const [photoChanged,setPhotoChanged]=useState(false);
 const [loadError,setLoadError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<'saved'|'failed'|'photo'|null>(null);
 const picker=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  let active=true;
  void cloudCurrentToken().then(cloudMyDriverVehicleDetails).then(details=>{
   if(!active)return;
   if(!details){setLoadError(true);return}
   setReview(details);
   setForm({display_name:details.display_name??'',vehicle_model:details.vehicle_model??'',vehicle_color:details.vehicle_color??'',
    vehicle_plate:details.vehicle_plate??'',photo:details.photo??null});
  }).catch(()=>{if(active)setLoadError(true)});
  return()=>{active=false};
 },[attempt]);
 if(loadError)return <Panel><Label>{t('تعذّر تحميل بيانات السيارة.','Could not load vehicle details.')}</Label>
  <Button secondary title={t('إعادة المحاولة','Try again')} onPress={()=>{setLoadError(false);setAttempt(n=>n+1)}}/></Panel>;
 if(!form)return <ActivityIndicator accessibilityLabel={t('تحميل بيانات السيارة','Loading vehicle details')}/>;
 async function save(values:Form){
  setBusy(true);setStatus(null);
  try{
   const saved=await cloudSaveDriverVehicleDetails(await cloudCurrentToken(),values,photoChanged);
   if(saved){setDirty(false);setPhotoChanged(false);setReview(current=>current&&{...current,status:'pending',reason:null});}
   setStatus(saved?'saved':'failed');
  }catch{setStatus('failed')}finally{setBusy(false)}
 }
 async function selectPhoto(file:File){
  setBusy(true);setStatus(null);
  try{
   const photo=await readVehiclePhoto(file);
   setForm(current=>current?{...current,photo}:null);setPhotoChanged(true);setDirty(true);
  }catch{setStatus('photo')}finally{setBusy(false)}
 }
 const complete=fields.every(field=>form[field.key].trim());
 return <Panel>
  <Label large>{t('بيانات السائق والسيارة','Driver and vehicle details')}</Label>
  <Label muted>{t('تظهر هذه البيانات للزبون المعيّن أثناء الرحلة. اختر صورة للسيارة فقط، وتجنّب ظهور أشخاص أو وثائق في الصورة.','The assigned passenger can see these details during the ride. Choose a vehicle photo without people or documents.')}</Label>
  {review?.status==='pending'&&<Label>{t('البيانات بانتظار مراجعة الإدارة.','Your details are waiting for admin review.')}</Label>}
  {review?.status==='approved'&&<Label>{t('بيانات السيارة معتمدة.','Your vehicle details are approved.')}</Label>}
  {review?.status==='changes_requested'&&<Label>{t('الإدارة طلبت تعديل البيانات.','Admin requested changes.')}</Label>}
  {review?.status==='rejected'&&<Label>{t('الإدارة رفضت هذه البيانات.','Admin rejected these details.')}</Label>}
  {review?.reason&&<Label>{review.reason}</Label>}
  {review?.approved&&<Label muted>{t('تبقى البيانات المعتمدة معروضة للزبون حتى توافق الإدارة على التعديل.','Passengers see the approved details until admin accepts your update.')}</Label>}
  <Label muted>{t('أدخل اسم العرض والطراز واللون واللوحة لإرسال البيانات. الصورة اختيارية.','Enter your display name, model, color and plate to submit. A photo is optional.')}</Label>
  {fields.map(field=><Field key={field.key} label={t(field.ar,field.en)} value={form[field.key]} maxLength={field.length}
   editable={!busy} onChangeText={value=>{setDirty(true);setStatus(null);setForm({...form,[field.key]:value})}}/>)}
  {form.photo&&<Image accessibilityLabel={t('معاينة صورة السيارة','Vehicle photo preview')}
   source={{uri:'data:image/jpeg;base64,'+form.photo}} style={{width:'100%',height:174,borderRadius:12}} resizeMode="contain"/>}
  {Platform.OS==='web'&&<>
   <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void selectPhoto(file);
   }}/>
   <Button secondary icon="image-outline" title={form.photo?t('تغيير صورة السيارة','Change vehicle photo'):t('اختيار صورة السيارة','Choose vehicle photo')} disabled={busy} onPress={()=>picker.current?.click()}/>
   {form.photo&&<Button secondary title={t('إزالة الصورة','Remove photo')} disabled={busy} onPress={()=>{setForm({...form,photo:null});setPhotoChanged(true);setDirty(true);setStatus(null)}}/>}
  </>}
  <Button icon="save-outline" title={t('إرسال بيانات السيارة للمراجعة','Submit vehicle details for review')} disabled={busy||!complete} onPress={()=>void save(form)}/>
  <Button secondary icon="refresh-outline" title={t('تحديث حالة المراجعة','Refresh review status')} disabled={busy||dirty} onPress={()=>{setForm(null);setStatus(null);setAttempt(n=>n+1)}}/>
  {status&&<View accessibilityRole="alert"><Label>{status==='saved'?t('تم إرسال البيانات للمراجعة.','Details submitted for review.'):status==='photo'?t('اختر صورة JPG أو PNG أو WebP بحجم يصل إلى ٢٠ ميغابايت.','Choose a JPG, PNG or WebP photo up to 20 MB.'):t('تعذّر حفظ البيانات. جرّب مرة أخرى.','Could not save the details. Try again.')}</Label></View>}
 </Panel>;
}
