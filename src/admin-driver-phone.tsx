import {useState} from 'react';
import {Linking,View} from 'react-native';
import {CloudError,cloudAdminPhoneCapabilities,cloudAdminPhoneDriver,cloudCurrentToken} from './cloud-api';
import {useApp} from './context';
import {categories,regions,type RideType} from './domain';
import {syrianMobile} from './syrian-phone';
import {Button,Field,Label,Panel,useText} from './ui';

export default function AdminDriverPhone({onCreated}:{onCreated:()=>void}){
 const t=useText();const {state}=useApp();
 const [name,setName]=useState(''),[phone,setPhone]=useState('');
 const [region,setRegion]=useState(0),[category,setCategory]=useState<RideType>('classic');
 const [choices,setChoices]=useState<'region'|'category'|null>(null);
 const [reset,setReset]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [providerDisabled,setProviderDisabled]=useState(false);
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const normalized=syrianMobile(phone);
 const validPassword=password.length>=10&&password.length<=72&&/[A-Za-z]/.test(password)&&/[0-9]/.test(password)&&!/[\x00-\x1f\x7f]/.test(password);
 const canSubmit=!busy&&!!normalized&&(reset||!!name.trim())&&validPassword&&password===confirmation;
 async function submit(){
  if(!canSubmit)return;
  setBusy(true);setNotice('');
  try{
   const token=await cloudCurrentToken();
   const capabilities=await cloudAdminPhoneCapabilities(token).catch(()=>null);
   if(capabilities?.mode!=='admin_selected_password_v1')throw new CloudError(503,'driver_phone_service_outdated');
   const created=await cloudAdminPhoneDriver(token,reset
    ?{action:'reset',phone:normalized,password}
    :{action:'create',phone:normalized,password,name:name.trim(),region,category});
   if(created.phone!==normalized)throw Error('invalid_response');
   setProviderDisabled(false);
   if(!reset){setName('');onCreated()}
   setPhone('');setPassword('');setConfirmation('');setShowPassword(false);setChoices(null);
   setNotice(reset
    ?t('تم تعيين كلمة المرور التي اخترتها لهذا السائق. سلّمها له بشكل خاص.','The password you chose has been set for this driver. Share it privately.')
    :t('تم إنشاء حساب السائق برقم الموبايل وكلمة المرور التي اخترتها. راجع بيانات السائق واعتمده قبل تلقي الطلبات.','Driver account created with the phone and password you chose. Review and approve the driver before accepting rides.'));
  }catch(error){
   const code=error instanceof CloudError?error.kind:'';
   setProviderDisabled(code==='phone_provider_disabled');
   const messages:Record<string,string>={
    phone_driver_exists:t('هذا الرقم مرتبط بحساب. إذا كان حساب سائق أضافته الإدارة، استخدم إعادة تعيين كلمة المرور.','This number already belongs to an account. Use password reset if admin created it as a driver account.'),
    phone_driver_not_found:t('لم أجد حساب سائق أضافته الإدارة بهذا الرقم.','No admin-created driver account was found with this number.'),
    phone_provider_disabled:t('يجب تفعيل تسجيل الدخول بالهاتف في إعدادات المصادقة قبل إضافة حسابات السائقين.','Enable phone sign-in in authentication settings before adding driver accounts.'),
    invalid_driver_password:t('كلمة المرور يجب أن تكون من ١٠ إلى ٧٢ حرفًا وتحتوي على حرف إنجليزي ورقم على الأقل.','Use 10 to 72 characters with at least one letter and one number.'),
    driver_phone_service_outdated:t('خدمة إنشاء السائقين بحاجة لتحديث على الخادم. لم نرسل طلب إنشاء الحساب.','The driver-account service needs a server update. No account creation request was sent.'),
   };
   setNotice(messages[code]??t('تعذّر إتمام العملية. تحقّق من الاتصال قبل المحاولة مجددًا.','Could not complete the action. Check your connection before retrying.'));
  }finally{setBusy(false)}
 }
 return <Panel>
  <Label large>{t('إضافة سائق برقم الموبايل','Add a driver by mobile number')}</Label>
  <Label muted>{t('تحقّق من رقم السائق قبل إنشاء الحساب. يقدر السائق الدخول بالرقم وكلمة المرور. يفعّل المسؤول استقبال الطلبات من قائمة السائقين بعد مراجعة بياناته.','Check the driver’s number before creating the account. The driver can sign in with the number and password. Approve the account from the driver list after reviewing the driver’s details.')}</Label>

   <Button secondary title={reset?t('العودة إلى إضافة سائق','Back to adding a driver'):t('إعادة تعيين كلمة مرور سائق','Reset a driver password')} disabled={busy} onPress={()=>{setReset(!reset);setPassword('');setConfirmation('');setNotice('');setChoices(null)}}/>
   {!reset&&<Field label={t('اسم السائق للعرض','Driver display name')} value={name} onChangeText={setName} maxLength={80} editable={!busy}/>}
   <Field label={t('رقم الموبايل السوري (+963)','Syrian mobile number (+963)')} placeholder="09XXXXXXXX" value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" editable={!busy}/>
   {!!phone.trim()&&!normalized&&<Label muted>{t('أدخل رقم موبايل سوري يبدأ بـ 09 أو +9639.','Enter a Syrian mobile number starting with 09 or +9639.')}</Label>}
   <Field label={t(reset?'كلمة المرور الجديدة':'كلمة مرور السائق',reset?'New driver password':'Driver password')} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete="new-password" maxLength={72} editable={!busy}/>
   <Field label={t('تأكيد كلمة المرور','Confirm password')} value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoComplete="new-password" maxLength={72} editable={!busy}/>
   <Button secondary title={showPassword?t('إخفاء كلمة المرور','Hide password'):t('إظهار كلمة المرور','Show password')} disabled={busy} onPress={()=>setShowPassword(!showPassword)}/>
   <Label muted>{t('اختر كلمة مرور من ١٠ إلى ٧٢ حرفًا فيها حرف إنجليزي ورقم على الأقل. لا يتم حفظها في لوحة الإدارة.','Choose a password of 10–72 characters with at least one letter and one number. It is not saved in the admin panel.')}</Label>
   {!!confirmation&&confirmation!==password&&<Label muted>{t('كلمتا المرور غير متطابقتين.','Passwords do not match.')}</Label>}
   {!reset&&<>
    <Button secondary title={t('منطقة العمل','Service area')+' · '+regions[region][state.language==='ar'?0:1]} disabled={busy} onPress={()=>setChoices(choices==='region'?null:'region')}/>
    {choices==='region'&&regions.map((area,index)=><Button key={index} secondary={region!==index} title={area[state.language==='ar'?0:1]} onPress={()=>{setRegion(index);setChoices(null)}}/>)}
    <Button secondary title={t('فئة السيارة','Vehicle class')+' · '+categories.find(item=>item.id===category)?.[state.language]} disabled={busy} onPress={()=>setChoices(choices==='category'?null:'category')}/>
    {choices==='category'&&categories.map(item=><Button key={item.id} secondary={category!==item.id} title={item[state.language]} onPress={()=>{setCategory(item.id);setChoices(null)}}/>)}
   </>}
   {reset&&<Label muted>{t('تحقّق من هوية السائق قبل تغيير كلمة مروره. سيتم استخدام كلمة المرور التي أدخلتها أنت.','Verify the driver’s identity before changing their password. The password you entered will be used.')}</Label>}
   <Button title={reset?t('حفظ كلمة المرور الجديدة','Save new password'):t('إنشاء حساب السائق','Create driver account')} disabled={!canSubmit} onPress={()=>void submit()}/>
   {providerDisabled&&<Button secondary icon="open-outline" title={t('فتح إعدادات المصادقة في Supabase','Open Supabase Auth settings')}
    onPress={()=>void Linking.openURL('https://supabase.com/dashboard/project/gokosprcqpdvqgahvquk/auth/providers').catch(()=>{})}/>}
   {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
 </Panel>;
}
