import {useState} from 'react';
import {View} from 'react-native';
import {CloudError,cloudAdminPhoneDriver,cloudCurrentToken} from './cloud-api';
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
 const [credential,setCredential]=useState<{phone:string;password:string}|null>(null);
 const normalized=syrianMobile(phone);
 async function submit(){
  if(busy||!normalized||(!reset&&!name.trim()))return;
  setBusy(true);setNotice('');
  try{
   const created=await cloudAdminPhoneDriver(await cloudCurrentToken(),reset
    ?{action:'reset',phone:normalized}
    :{action:'create',phone:normalized,name:name.trim(),region,category});
   if(created.phone!==normalized||typeof created.password!=='string'||created.password.length<16)throw Error('invalid_response');
   setCredential(created);
   if(!reset){setName('');onCreated()}
   setPhone('');setChoices(null);
  }catch(error){
   const code=error instanceof CloudError?error.kind:'';
   const messages:Record<string,string>={
    phone_driver_exists:t('هذا الرقم مرتبط بحساب. إذا كان حساب سائق أضافته الإدارة، استخدم إعادة تعيين كلمة المرور.','This number already belongs to an account. Use password reset if admin created it as a driver account.'),
    phone_driver_not_found:t('لم أجد حساب سائق أضافته الإدارة بهذا الرقم.','No admin-created driver account was found with this number.'),
    phone_provider_disabled:t('يجب تفعيل تسجيل الدخول بالهاتف في إعدادات المصادقة قبل إضافة حسابات السائقين.','Enable phone sign-in in authentication settings before adding driver accounts.'),
   };
   setNotice(messages[code]??t('تعذّر إتمام العملية. تحقّق من الاتصال قبل المحاولة مجددًا.','Could not complete the action. Check your connection before retrying.'));
  }finally{setBusy(false)}
 }
 return <Panel>
  <Label large>{t('إضافة سائق برقم الموبايل','Add a driver by mobile number')}</Label>
  <Label muted>{t('تحقّق من رقم السائق قبل إنشاء الحساب. يقدر السائق الدخول بالرقم وكلمة المرور وإرسال بيانات السيارة للمراجعة.','Check the driver’s number before creating the account. The driver can sign in with the number and password and submit the vehicle for review.')}</Label>
  {credential?<View accessibilityLiveRegion="polite" style={{gap:8}}>
   <Label>{t('أعطِ السائق هذه البيانات بشكل خاص، ثم اطلب منه تغيير كلمة المرور من حسابه.','Share these credentials privately and ask the driver to change the password in their account.')}</Label>
   <Field label={t('رقم تسجيل الدخول','Sign-in number')} value={credential.phone} editable={false} autoComplete="off"/>
   <Field label={t('كلمة المرور الأولية','Initial password')} value={credential.password} editable={false} autoComplete="off"/>
   <Button secondary title={t('إخفاء بيانات الدخول','Hide credentials')} onPress={()=>setCredential(null)}/>
  </View>:<>
   <Button secondary title={reset?t('العودة إلى إضافة سائق','Back to adding a driver'):t('إعادة تعيين كلمة مرور سائق','Reset a driver password')} disabled={busy} onPress={()=>{setReset(!reset);setNotice('');setChoices(null)}}/>
   {!reset&&<Field label={t('اسم السائق للعرض','Driver display name')} value={name} onChangeText={setName} maxLength={80} editable={!busy}/>}
   <Field label={t('رقم الموبايل السوري (+963)','Syrian mobile number (+963)')} placeholder="09XXXXXXXX" value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" editable={!busy}/>
   {!!phone.trim()&&!normalized&&<Label muted>{t('أدخل رقم موبايل سوري يبدأ بـ 09 أو +9639.','Enter a Syrian mobile number starting with 09 or +9639.')}</Label>}
   {!reset&&<>
    <Button secondary title={t('منطقة العمل','Service area')+' · '+regions[region][state.language==='ar'?0:1]} disabled={busy} onPress={()=>setChoices(choices==='region'?null:'region')}/>
    {choices==='region'&&regions.map((area,index)=><Button key={index} secondary={region!==index} title={area[state.language==='ar'?0:1]} onPress={()=>{setRegion(index);setChoices(null)}}/>)}
    <Button secondary title={t('فئة السيارة','Vehicle class')+' · '+categories.find(item=>item.id===category)?.[state.language]} disabled={busy} onPress={()=>setChoices(choices==='category'?null:'category')}/>
    {choices==='category'&&categories.map(item=><Button key={item.id} secondary={category!==item.id} title={item[state.language]} onPress={()=>{setCategory(item.id);setChoices(null)}}/>)}
   </>}
   {reset&&<Label muted>{t('تحقّق من هوية السائق قبل تأكيد التغيير. ستصدر كلمة مرور جديدة لهذا الرقم.','Check the driver’s identity before confirming the change. A new password will be issued for this number.')}</Label>}
   <Button title={reset?t('تأكيد إصدار كلمة مرور جديدة','Confirm new password'):t('إنشاء حساب السائق','Create driver account')} disabled={busy||!normalized||(!reset&&!name.trim())} onPress={()=>void submit()}/>
   {!!notice&&<View accessibilityRole="alert"><Label>{notice}</Label></View>}
  </>}
 </Panel>;
}
