import React,{useEffect,useState} from 'react';
import {cloudGetToken,cloudIsAdmin,cloudFareSettings,cloudUpdateFareSettings} from '../cloud-api';
import {router} from 'expo-router';
import {useApp} from '../context';
import {parseAmount,priceForRoute,suggestedNewSypTariff,type Tariff} from '../meter';
import {Button,Field,Label,Page,Panel,useText} from '../ui';
export default function Admin(){const {state,dispatch}=useApp();const t=useText();const [base,setBase]=useState(state.tariff?String(state.tariff.base):''),[perKm,setPerKm]=useState(state.tariff?String(state.tariff.perKm):''),[perMinute,setPerMinute]=useState(state.tariff?String(state.tariff.perMinute):''),[peak,setPeak]=useState(String(state.tariff?.peakMultiplier??1)),[phone,setPhone]=useState(state.preferences.smsNumber),[message,setMessage]=useState('');
 const token=cloudGetToken();const [staff,setStaff]=useState(false),[sharedBusy,setSharedBusy]=useState(false);
 useEffect(()=>{let alive=true;if(token)void cloudIsAdmin(token).then(value=>{if(alive)setStaff(value)}).catch(()=>{});return()=>{alive=false}},[token]);
 async function sharedRates(publish:boolean){if(!token||!staff||sharedBusy)return;setSharedBusy(true);try{if(publish){if(!previewTariff)return;await cloudUpdateFareSettings(token,previewTariff)}const rates=await cloudFareSettings(token);setBase(String(rates.base));setPerKm(String(rates.perKm));setPerMinute(String(rates.perMinute));setPeak(String(rates.peakMultiplier??1));dispatch({type:'tariff',tariff:rates});setMessage(publish?t('تم نشر التسعيرة المشتركة لجميع حسابات التطبيق.','Shared rates saved for all app accounts.'):t('تم تحميل التسعيرة المشتركة.','Shared rates loaded.'))}catch{setMessage(t('تعذر تحديث التسعيرة المشتركة. تحقق من الاتصال وصلاحيات حساب الإدارة.','Could not update shared rates. Check internet and your admin account.'))}finally{setSharedBusy(false)}}
 const values=[base,perKm,perMinute,peak].map(parseAmount);
 const validInputs=values.every(value=>value!==null)&&values[3]!>=1&&values[3]!<=10;
 const previewTariff:Tariff|null=validInputs?{base:values[0]!,perKm:values[1]!,perMinute:values[2]!,peakMultiplier:values[3]!,updatedAt:new Date().toISOString()}:null;
 const example=previewTariff?priceForRoute(5000,10,previewTariff):null;
 function saveTariff(){
  if(!validInputs||!previewTariff){setMessage(t('أدخل أسعارًا صحيحة ومعامل ذروة بين 1 و10، دون فواصل آلاف.','Enter valid rates and a peak factor from 1 to 10, with no thousands marks.'));return;}
  dispatch({type:'tariff',tariff:previewTariff});
  setMessage(t('حُفظت ثوابت الأجرة للرحلات الجديدة على هذا الجهاز. التغييرات لا تمس رحلات بدأت سابقًا.','New fare settings were saved on this device. Earlier rides do not change.'));
 }
 function applySuggestedTariff(){
  const tariff={...suggestedNewSypTariff,updatedAt:new Date().toISOString()};
  setBase(String(tariff.base));setPerKm(String(tariff.perKm));setPerMinute(String(tariff.perMinute));setPeak(String(tariff.peakMultiplier));
  dispatch({type:'tariff',tariff});
  setMessage(t('تم تطبيق ثوابت التسعير المقترحة بالليرة السورية الجديدة للرحلات القادمة على هذا الجهاز.','Suggested prices in new Syrian pounds now apply to future rides on this device.'));
 }
 function savePhone(){const value=phone.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));if(value!==''&&!/^\+?\d{7,15}$/.test(value)){setMessage(t('أدخل رقمًا صحيحًا من 7 إلى 15 رقمًا، أو اتركه فارغًا.','Enter a valid phone number of 7 to 15 digits, or leave it empty.'));return;}dispatch({type:'preferences',preferences:{smsNumber:value}});setMessage(t('تم تطبيق رقم الرسائل محليًا.','SMS number applied on this phone.'));}
 return <Page title={t('إدارة النسخة التجريبية','Demo admin')}>
 <Label muted>{t('هذه شاشة محاكاة مفتوحة. التغييرات تخص هذا الجهاز فقط. الإدارة الفعلية وتعميم الأسعار تحتاجان حسابًا محميًا وخادمًا.','This is an open demo screen. Changes are for this phone only. Live admin and shared prices need a protected account and server.')}</Label>
 <Panel>
  <Label>{t('ثوابت حساب الأجرة — الليرة السورية الجديدة','Fare settings — new Syrian pounds')}</Label>
  <Label muted>{t('قيم تجريبية مقترحة وفق مقياس الأسعار الجديد، وليست تعرفة رسمية. يمكنك تعديل كل قيمة وحفظها.','Suggested demo rates in new Syrian pounds, not an official taxi tariff. You can edit and save every value.')}</Label>
  <Label muted>{t('الأجرة = (فتح العداد + الكيلومترات × سعر الكيلومتر + الدقائق × سعر الدقيقة) × معامل الذروة','Fare = (Base + km × km price + minutes × minute price) × peak factor')}</Label>
  <Field label={t('أجرة فتح العداد (ل.س)','Starting fare (SYP)')} value={base} onChangeText={setBase} keyboardType="decimal-pad"/>
  <Field label={t('سعر الكيلومتر الواحد (ل.س)','Price per kilometre (SYP)')} value={perKm} onChangeText={setPerKm} keyboardType="decimal-pad"/>
  <Field label={t('سعر الدقيقة الواحدة (ل.س)','Price per minute (SYP)')} value={perMinute} onChangeText={setPerMinute} keyboardType="decimal-pad"/>
  <Field label={t('معامل الذروة','Peak multiplier')} value={peak} onChangeText={setPeak} keyboardType="decimal-pad"/>
  <Label muted>{t('ضع 1 للسعر العادي، أو 1.5 لزيادة 50٪، أو 2 لمضاعفة الأجرة.','Use 1 for normal price, 1.5 for a 50% increase, or 2 for double fare.')}</Label>
  {example!==null&&<Label>{t('مثال توضيحي: رحلة 5 كم و10 دقائق','Example: a 5 km, 10 minute ride')}: {example.toLocaleString('en-US')} {t('ل.س','SYP')}</Label>}
  <Button secondary title={t('تطبيق ثوابت مقترحة لليرة الجديدة','Use suggested new-SYP rates')} onPress={applySuggestedTariff}/>
  <Button title={t('حفظ ثوابت التسعير','Save fare settings')} onPress={saveTariff} disabled={!validInputs}/>
  {staff&&<Panel><Label>{t('التسعيرة المشتركة — حساب إدارة موثّق','Shared rates — verified admin')}</Label><Button secondary title={t('تحميل التسعيرة المشتركة','Load shared rates')} onPress={()=>void sharedRates(false)} disabled={sharedBusy}/><Button title={t('نشر هذه الثوابت لجميع المستخدمين','Save these rates for all users')} onPress={()=>void sharedRates(true)} disabled={sharedBusy||!validInputs}/></Panel>}
  <Label muted>{t('هذه إعدادات محلية تجريبية لا تصل إلى باقي المستخدمين. تُثبت الثوابت عند بدء الرحلة ولا تتغير للرحلات السابقة. الدفع نقدًا فقط.','These are local demo settings, not shared with other users. Rates are fixed when a ride starts. Cash only.')}</Label>
 </Panel>
 <Panel><Field label={t('رقم استقبال الرسائل للتجربة — اختياري','SMS recipient for testing — optional')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16}/><Button secondary title={t('حفظ رقم الرسائل','Save SMS number')} onPress={savePhone}/><Label muted>{t('هذا لا يربط بوابة رسائل ولا يجعل الطلبات مقبولة تلقائيًا.','This does not connect an SMS service or accept requests on its own.')}</Label></Panel>
 {message!==''&&<Label>{message}</Label>}
 <Panel><Label>{t('السائق التجريبي','Demo driver')}</Label><Label>{state.driver.approved?t('الحالة: معتمد','Status: Approved'):t('الحالة: بانتظار المراجعة','Status: Waiting for review')}</Label><Button title={state.driver.approved?t('تعليق السائق التجريبي','Suspend demo driver'):t('اعتماد السائق التجريبي','Approve demo driver')} onPress={()=>dispatch({type:'approve',approved:!state.driver.approved})}/></Panel>
 <Panel><Label>{t('عدد الطلبات التجريبية','Demo requests')}: {state.trips.length}</Label><Label>{t('الرحلات المكتملة','Completed rides')}: {state.trips.filter(trip=>trip.status==='completed').length}</Label></Panel>
 <Button secondary title={t('حالة الخدمات','Service status')} onPress={()=>router.push('/services')}/>
 </Page>;
}
